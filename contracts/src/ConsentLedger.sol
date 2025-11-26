// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./interfaces/IConsentLedger.sol";

/**
 * @title ConsentLedger - Secure Implementation
 * @notice ✅ SECURITY FIXES:
 * - NO plaintext CID storage (only bytes32 hash)
 * - Deadline included in EIP-712 signatures
 * - Proper authorization
 */
contract ConsentLedger is EIP712, ReentrancyGuard, IConsentLedger {
    using ECDSA for bytes32;

    // ================ TYPE HASHES ================
    // ✅ FIX: Include deadline in signature
    bytes32 private constant CONSENT_PERMIT_TYPEHASH = keccak256(
        "ConsentPermit(address patient,address grantee,string rootCID,bytes32 encKeyHash,uint256 expireAt,bool includeUpdates,bool allowDelegate,uint256 deadline,uint256 nonce)"
    );

    bytes32 private constant DELEGATION_PERMIT_TYPEHASH = keccak256(
        "DelegationPermit(address patient,address delegatee,uint40 duration,bool allowSubDelegate,uint256 deadline,uint256 nonce)"
    );

    // ================ STORAGE ================
    // ✅ Consent struct now uses bytes32 rootCidHash (no plaintext)
    mapping(bytes32 => Consent) private _consents;
    
    // Delegation: patient => delegatee => packed data
    mapping(address => mapping(address => uint256)) private _delegations;
    
    // Nonces for replay protection
    mapping(address => uint256) public nonces;
    
    // Authorization
    mapping(address => bool) public authorizedContracts;
    address public immutable admin;

    // ================ CONSTANTS ================
    uint40 private constant FOREVER = type(uint40).max;
    uint40 private constant MAX_DURATION = 5 * 365 days;
    uint40 private constant MIN_DURATION = 1 days;

    // Delegation bit positions
    uint256 private constant EXPIRES_MASK = 0xFFFFFFFFFF; // 40 bits
    uint256 private constant ALLOW_SUB_DELEGATE_BIT = 40;
    uint256 private constant ACTIVE_BIT = 41;

    // ================ CONSTRUCTOR ================
    constructor(address admin_) EIP712("EHR Consent Ledger", "3") {
        if (admin_ == address(0)) revert Unauthorized();
        admin = admin_;
        authorizedContracts[admin_] = true;
        emit AuthorizedContract(admin_, true);
    }

    // ================ MODIFIERS ================
    modifier onlyAuthorized() {
        if (!authorizedContracts[msg.sender] && msg.sender != admin) {
            revert Unauthorized();
        }
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    // ================ AUTHORIZATION ================
    function authorizeContract(address contractAddress, bool allowed) 
        external override onlyAdmin 
    {
        if (contractAddress == address(0)) revert Unauthorized();
        authorizedContracts[contractAddress] = allowed;
        emit AuthorizedContract(contractAddress, allowed);
    }

    // ================ GRANT CONSENT ================

    /**
     * @notice Grant consent (internal, authorized contracts only)
     * ✅ Accepts string CID for UX, hashes immediately, stores only hash
     */
    function grantInternal(
        address patient,
        address grantee,
        string calldata rootCID,
        bytes32 encKeyHash,
        uint40 expireAt,
        bool includeUpdates,
        bool allowDelegate
    ) external override onlyAuthorized nonReentrant {
        bytes32 rootCidHash = keccak256(bytes(rootCID));  // ✅ Hash immediately
        
        _grantConsent(
            patient,
            grantee,
            rootCidHash,
            encKeyHash,
            expireAt,
            includeUpdates,
            allowDelegate
        );
    }

    /**
     * @notice Grant consent via EIP-712 signature
     * ✅ FIX: Deadline now included in signature
     */
    function grantBySig(
        address patient,
        address grantee,
        string calldata rootCID,
        bytes32 encKeyHash,
        uint40 expireAt,
        bool includeUpdates,
        bool allowDelegate,
        uint256 deadline,
        bytes calldata signature
    ) external override nonReentrant {
        if (block.timestamp > deadline) revert DeadlinePassed();
        
        uint256 currentNonce = nonces[patient];
        
        // ✅ FIX: Include deadline in signature
        bytes32 structHash = keccak256(abi.encode(
            CONSENT_PERMIT_TYPEHASH,
            patient,
            grantee,
            keccak256(bytes(rootCID)),
            encKeyHash,
            expireAt,
            includeUpdates,
            allowDelegate,
            deadline,  // ✅ ADDED
            currentNonce
        ));

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);
        
        if (signer != patient) revert InvalidSignature();
        
        nonces[patient] = currentNonce + 1;

        bytes32 rootCidHash = keccak256(bytes(rootCID));
        
        _grantConsent(
            patient,
            grantee,
            rootCidHash,
            encKeyHash,
            expireAt,
            includeUpdates,
            allowDelegate
        );
    }

    /**
     * @notice Internal grant logic
     * ✅ Only stores bytes32 hash, NO plaintext
     */
    function _grantConsent(
        address patient,
        address grantee,
        bytes32 rootCidHash,  // ✅ bytes32 parameter
        bytes32 encKeyHash,
        uint40 expireAt,
        bool includeUpdates,
        bool allowDelegate
    ) internal {
        if (grantee == address(0)) revert Unauthorized();
        if (rootCidHash == bytes32(0)) revert EmptyCID();
        if (expireAt != 0 && expireAt <= block.timestamp) revert InvalidExpire();

        bytes32 consentKey = keccak256(abi.encode(patient, grantee, rootCidHash));
        
        uint40 finalExpiry = expireAt == 0 ? FOREVER : expireAt;
        uint40 now40 = uint40(block.timestamp);

        _consents[consentKey] = Consent({
            patient: patient,
            grantee: grantee,
            rootCidHash: rootCidHash,  // ✅ Store hash only
            encKeyHash: encKeyHash,
            issuedAt: now40,
            expireAt: finalExpiry,
            active: true,
            includeUpdates: includeUpdates,
            allowDelegate: allowDelegate
        });

        emit ConsentGranted(patient, grantee, rootCidHash, finalExpiry, allowDelegate);
    }

    // ================ REVOKE CONSENT ================

    /**
     * @notice Patient revokes consent
     * ✅ Accepts string CID, hashes internally
     */
    function revoke(address grantee, string calldata rootCID) 
        external override nonReentrant 
    {
        bytes32 rootCidHash = keccak256(bytes(rootCID));
        bytes32 key = keccak256(abi.encode(msg.sender, grantee, rootCidHash));
        Consent storage c = _consents[key];
        
        if (!c.active) revert Unauthorized();
        if (c.patient != msg.sender) revert Unauthorized();
        
        c.active = false;
        
        emit ConsentRevoked(msg.sender, grantee, rootCidHash, uint40(block.timestamp));
    }

    // ================ DELEGATION SYSTEM ================

    function grantDelegation(
        address delegatee,
        uint40 duration,
        bool allowSubDelegate
    ) external override nonReentrant {
        _grantDelegation(msg.sender, delegatee, duration, allowSubDelegate);
    }

    function grantDelegationInternal(
        address patient,
        address delegatee,
        uint40 duration,
        bool allowSubDelegate
    ) external override onlyAuthorized nonReentrant {
        _grantDelegation(patient, delegatee, duration, allowSubDelegate);
    }

    /**
     * @notice Grant delegation via EIP-712 signature
     * ✅ Deadline already included in DELEGATION_PERMIT_TYPEHASH
     */
    function delegateAuthorityBySig(
        address delegatee,
        uint40 duration,
        bool allowSubDelegate,
        uint256 deadline,
        bytes calldata signature
    ) external override nonReentrant {
        if (block.timestamp > deadline) revert DeadlinePassed();
        if (delegatee == address(0)) revert Unauthorized();
        if (duration < MIN_DURATION || duration > MAX_DURATION) {
            revert InvalidDuration();
        }

        address patient = msg.sender;
        uint256 currentNonce = nonces[patient];

        bytes32 structHash = keccak256(abi.encode(
            DELEGATION_PERMIT_TYPEHASH,
            patient,
            delegatee,
            duration,
            allowSubDelegate,
            deadline,
            currentNonce
        ));

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);
        
        if (signer != patient) revert InvalidSignature();
        
        nonces[patient] = currentNonce + 1;

        _grantDelegation(patient, delegatee, duration, allowSubDelegate);
    }

    function _grantDelegation(
        address patient,
        address delegatee,
        uint40 duration,
        bool allowSubDelegate
    ) internal {
        if (delegatee == address(0)) revert Unauthorized();
        if (duration < MIN_DURATION || duration > MAX_DURATION) {
            revert InvalidDuration();
        }

        uint40 expiresAt = uint40(block.timestamp) + duration;

        uint256 packed = uint256(expiresAt) |
            (allowSubDelegate ? (1 << ALLOW_SUB_DELEGATE_BIT) : 0) |
            (1 << ACTIVE_BIT);

        _delegations[patient][delegatee] = packed;

        emit DelegationGranted(patient, delegatee, expiresAt, allowSubDelegate);
    }

    function revokeDelegation(address delegatee) external override nonReentrant {
        uint256 data = _delegations[msg.sender][delegatee];
        
        if (data == 0 || ((data >> ACTIVE_BIT) & 1) == 0) {
            revert NoActiveDelegation();
        }

        _delegations[msg.sender][delegatee] = data & ~(1 << ACTIVE_BIT);
        
        emit DelegationRevoked(msg.sender, delegatee);
    }

    /**
     * @notice Grant consent using delegation authority
     * ✅ Accepts string CID, hashes immediately
     */
    function grantUsingDelegation(
        address patient,
        address newGrantee,
        string calldata rootCID,
        bytes32 encKeyHash,
        uint40 expireAt
    ) external override nonReentrant {
        // Check delegation
        uint256 data = _delegations[patient][msg.sender];
        
        if (((data >> ACTIVE_BIT) & 1) == 0) revert NoActiveDelegation();
        
        uint40 expiresAt = uint40(data & EXPIRES_MASK);
        if (block.timestamp > expiresAt) revert NoActiveDelegation();

        bytes32 rootCidHash = keccak256(bytes(rootCID));

        _grantConsent(
            patient,
            newGrantee,
            rootCidHash,
            encKeyHash,
            expireAt,
            false,
            false
        );

        emit AccessGrantedViaDelegation(patient, newGrantee, msg.sender, rootCidHash);
    }

    // ================ VIEW FUNCTIONS ================

    /**
     * @notice Check if user can access record
     * ✅ Accepts string CID, hashes internally
     */
    function canAccess(
        address patient,
        address grantee,
        string calldata cid
    ) external view override returns (bool) {
        if (patient == grantee) return true;

        bytes32 cidHash = keccak256(bytes(cid));
        bytes32 key = keccak256(abi.encode(patient, grantee, cidHash));
        Consent memory c = _consents[key];

        if (!c.active) return false;
        if (c.expireAt != FOREVER && block.timestamp > c.expireAt) return false;

        return true;
    }

    /**
     * @notice Get consent details
     * ✅ Accepts string CID, hashes internally
     * ⚠️ Returns struct with bytes32 hash (no plaintext CID)
     */
    function getConsent(
        address patient,
        address grantee,
        string calldata rootCID
    ) external view override returns (Consent memory) {
        bytes32 rootCidHash = keccak256(bytes(rootCID));
        bytes32 key = keccak256(abi.encode(patient, grantee, rootCidHash));
        return _consents[key];
    }

    function getDelegation(address patient, address delegatee)
        external view override returns (Delegation memory) {
        uint256 data = _delegations[patient][delegatee];
        
        return Delegation({
            delegatee: delegatee,
            expiresAt: uint40(data & EXPIRES_MASK),
            allowSubDelegate: ((data >> ALLOW_SUB_DELEGATE_BIT) & 1) != 0,
            active: ((data >> ACTIVE_BIT) & 1) != 0
        });
    }

    function getNonce(address patient) external view override returns (uint256) {
        return nonces[patient];
    }
}