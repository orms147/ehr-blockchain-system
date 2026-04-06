// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IConsentLedger} from "src/interfaces/IConsentLedger.sol";
import {IAccessControl} from "src/interfaces/IAccessControl.sol";

/**
 * @title ConsentLedger - Privacy-Safe Version
 * @notice All functions use bytes32 cidHash instead of string CID
 * @dev Frontend MUST compute keccak256(bytes(cid)) off-chain before calling
 * 
 * SECURITY: This version NEVER receives plaintext CID on-chain.
 * The CID only exists in frontend/IPFS, never in blockchain calldata.
 */
contract ConsentLedger is EIP712, ReentrancyGuard, IConsentLedger {
    using ECDSA for bytes32;

    // EIP-712 TypeHash - now signs over bytes32 cidHash, not string
    bytes32 private constant CONSENT_PERMIT_TYPEHASH = keccak256(
        "ConsentPermit(address patient,address grantee,bytes32 rootCidHash,bytes32 encKeyHash,uint256 expireAt,bool includeUpdates,bool allowDelegate,uint256 deadline,uint256 nonce)"
    );

    bytes32 private constant DELEGATION_PERMIT_TYPEHASH = keccak256(
        "DelegationPermit(address patient,address delegatee,uint40 duration,bool allowSubDelegate,uint256 deadline,uint256 nonce)"
    );

    // Storage
    // Key: bytes32 = keccak256(patient, grantee, rootCidHash)
    mapping(bytes32 => Consent) private _consents;
    
    // Delegation: patient => delegatee => packed data
    mapping(address => mapping(address => uint256)) private _delegations;
    
    // Nonces for replay protection
    mapping(address => uint256) public nonces;
    
    // Authorization
    mapping(address => bool) public authorizedContracts;
    
    // Authorized sponsors (EOAs that can revoke/reject on behalf of patients)
    mapping(address => bool) public authorizedSponsors;

    // FIX (audit #4): track which delegatee originated a delegated grant.
    // consentKey => delegatee that performed grantUsingDelegation. address(0) if direct grant.
    mapping(bytes32 => address) public consentDelegationSource;

    // FIX (audit #3): reference to AccessControl so canAccess can check doctor verification status.
    // Set once by admin via setAccessControl after deploy (avoids constructor circular dep).
    IAccessControl public accessControl;

    address public immutable admin;

    // Constants
    uint40 private constant FOREVER = type(uint40).max;
    uint40 private constant MAX_DURATION = 5 * 365 days;
    uint40 private constant MIN_DURATION = 1 days;

    // Delegation bit positions
    uint256 private constant EXPIRES_MASK = 0xFFFFFFFFFF;
    uint256 private constant ALLOW_SUB_DELEGATE_BIT = 40;
    uint256 private constant ACTIVE_BIT = 41;

    // Constructor
    constructor(address admin_) EIP712("EHR Consent Ledger", "2") {
        if (admin_ == address(0)) revert Unauthorized();
        admin = admin_;
        authorizedContracts[admin_] = true;
        emit AuthorizedContract(admin_, true);
    }

    // Modifiers
    modifier onlyAuthorized() {
        if (!authorizedContracts[msg.sender] && msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    // ============ AUTHORIZATION ============

    function authorizeContract(address contractAddress, bool allowed) external override onlyAdmin {
        if (contractAddress == address(0)) revert Unauthorized();
        authorizedContracts[contractAddress] = allowed;
        emit AuthorizedContract(contractAddress, allowed);
    }
    
    /// @notice Authorize sponsor address for revoke/reject on behalf of patients
    function authorizeSponsor(address sponsorAddr, bool allowed) external onlyAdmin {
        if (sponsorAddr == address(0)) revert Unauthorized();
        authorizedSponsors[sponsorAddr] = allowed;
        emit SponsorAuthorized(sponsorAddr, allowed);
    }

    /// @notice Wire AccessControl reference (one-time, admin only).
    /// FIX (audit #3): allows canAccess() to invalidate consents granted to doctors
    /// whose verification was later revoked.
    function setAccessControl(address ac) external onlyAdmin {
        if (ac == address(0)) revert Unauthorized();
        accessControl = IAccessControl(ac);
    }


    /// @notice Get the EIP-712 domain separator
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ============ GRANT CONSENT (Hash-based) ============

    /**
     * @notice Grant consent (called by authorized contracts)
     * @param rootCidHash keccak256(bytes(rootCID)) - computed OFF-CHAIN
     */
    function grantInternal(
        address patient,
        address grantee,
        bytes32 rootCidHash,
        bytes32 encKeyHash,
        uint40 expireAt,
        bool includeUpdates,
        bool allowDelegate
    ) external override onlyAuthorized nonReentrant {
        if (rootCidHash == bytes32(0)) revert EmptyCID();
        
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
     * @notice Grant consent via patient signature
     * @dev Signature is over cidHash (bytes32), NOT plaintext CID
     * @param rootCidHash keccak256(bytes(rootCID)) - computed OFF-CHAIN
     */
    function grantBySig(
        address patient,
        address grantee,
        bytes32 rootCidHash,
        bytes32 encKeyHash,
        uint40 expireAt,
        bool includeUpdates,
        bool allowDelegate,
        uint256 deadline,
        bytes calldata signature
    ) external override nonReentrant {
        if (block.timestamp > deadline) revert DeadlinePassed();
        if (rootCidHash == bytes32(0)) revert EmptyCID();
        
        uint256 currentNonce = nonces[patient];
        
        // Struct hash now uses bytes32 cidHash directly (no keccak of string)
        bytes32 structHash = keccak256(abi.encode(
            CONSENT_PERMIT_TYPEHASH,
            patient,
            grantee,
            rootCidHash,    // Already a hash
            encKeyHash,
            expireAt,
            includeUpdates,
            allowDelegate,
            deadline,
            currentNonce
        ));

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);
        
        if (signer != patient) revert InvalidSignature();
        
        nonces[patient] = currentNonce + 1;
        
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

    function _grantConsent(
        address patient,
        address grantee,
        bytes32 rootCidHash,
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
            rootCidHash: rootCidHash,
            encKeyHash: encKeyHash,
            issuedAt: now40,
            expireAt: finalExpiry,
            active: true,
            includeUpdates: includeUpdates,
            allowDelegate: allowDelegate
        });

        emit ConsentGranted(patient, grantee, rootCidHash, finalExpiry, allowDelegate);
    }

    // ============ REVOKE (Hash-based) ============

    /**
     * @notice Revoke consent
     * @param rootCidHash keccak256(bytes(rootCID)) - computed OFF-CHAIN
     */
    function revoke(address grantee, bytes32 rootCidHash) external override nonReentrant {
        bytes32 key = keccak256(abi.encode(msg.sender, grantee, rootCidHash));
        Consent storage c = _consents[key];
        
        if (!c.active) revert Unauthorized();
        if (c.patient != msg.sender) revert Unauthorized();
        
        c.active = false;
        
        emit ConsentRevoked(msg.sender, grantee, rootCidHash, uint40(block.timestamp));
    }
    
    /**
     * @notice Sponsor revokes consent on behalf of patient (for gas sponsorship)
     * @param patient Patient address who owns the consent
     * @param grantee Who to revoke from
     * @param rootCidHash keccak256(bytes(rootCID)) - computed OFF-CHAIN
     */
    function revokeFor(address patient, address grantee, bytes32 rootCidHash) external override nonReentrant {
        if (!authorizedSponsors[msg.sender]) revert NotSponsor();
        
        bytes32 key = keccak256(abi.encode(patient, grantee, rootCidHash));
        Consent storage c = _consents[key];
        
        if (!c.active) revert Unauthorized();
        if (c.patient != patient) revert Unauthorized();
        
        c.active = false;
        
        emit ConsentRevoked(patient, grantee, rootCidHash, uint40(block.timestamp));
    }


    // ============ DELEGATION ============

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

    function delegateAuthorityBySig(
        address patient,
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

        // FIX (audit #7): explicit overflow guard on uint40 cast.
        uint256 expiresAt256 = block.timestamp + duration;
        if (expiresAt256 > type(uint40).max) revert InvalidDuration();
        uint40 expiresAt = uint40(expiresAt256);

        uint256 packed = 
            uint256(expiresAt) |
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

    // ============ USING DELEGATION (Hash-based) ============

    /**
     * @notice Delegatee grants access to someone else
     * @param rootCidHash keccak256(bytes(rootCID)) - computed OFF-CHAIN
     */
    function grantUsingDelegation(
        address patient,
        address newGrantee,
        bytes32 rootCidHash,
        bytes32 encKeyHash,
        uint40 expireAt
    ) external override nonReentrant {
        uint256 data = _delegations[patient][msg.sender];
        
        if (((data >> ACTIVE_BIT) & 1) == 0) revert NoActiveDelegation();
        
        uint40 expiresAt = uint40(data & EXPIRES_MASK);
        if (block.timestamp > expiresAt) revert NoActiveDelegation();

        if (rootCidHash == bytes32(0)) revert EmptyCID();

        _grantConsent(
            patient,
            newGrantee,
            rootCidHash,
            encKeyHash,
            expireAt,
            false,
            false
        );

        // FIX (audit #4): record delegation provenance so canAccess can cascade-revoke.
        bytes32 ck = keccak256(abi.encode(patient, newGrantee, rootCidHash));
        consentDelegationSource[ck] = msg.sender;

        emit AccessGrantedViaDelegation(patient, newGrantee, msg.sender, rootCidHash);
    }

    /**
     * @notice Grant using per-record delegation
     * @param rootCidHash keccak256(bytes(rootCID)) - computed OFF-CHAIN
     */
    function grantUsingRecordDelegation(
        address patient,
        address newGrantee,
        bytes32 rootCidHash,
        bytes32 encKeyHash,
        uint40 expireAt
    ) external override nonReentrant {
        if (rootCidHash == bytes32(0)) revert EmptyCID();

        bytes32 senderKey = keccak256(abi.encode(patient, msg.sender, rootCidHash));
        Consent memory senderConsent = _consents[senderKey];

        if (!senderConsent.active) revert Unauthorized();
        if (senderConsent.expireAt != FOREVER && block.timestamp > senderConsent.expireAt) {
            revert Unauthorized();
        }
        if (!senderConsent.allowDelegate) revert Unauthorized();

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

    // ============ VIEW FUNCTIONS (Hash-based) ============

    /**
     * @notice Check if user can access record
     * @param cidHash keccak256(bytes(cid)) - computed OFF-CHAIN
     */
    function canAccess(
        address patient,
        address grantee,
        bytes32 cidHash
    ) external view override returns (bool) {
        if (patient == grantee) return true;

        bytes32 key = keccak256(abi.encode(patient, grantee, cidHash));
        Consent memory c = _consents[key];

        if (!c.active) return false;
        if (c.expireAt != FOREVER && block.timestamp > c.expireAt) return false;

        // FIX (audit #3): if AccessControl is wired and grantee carries the doctor flag,
        // require their verification to still be active. Revoking a doctor's verification
        // therefore cascades to invalidate every prior consent.
        if (address(accessControl) != address(0)) {
            if (accessControl.isDoctor(grantee) && !accessControl.isVerifiedDoctor(grantee)) {
                return false;
            }
        }

        // FIX (audit #4): if this consent originated from a delegation, the underlying
        // delegation must still be active and unexpired.
        address delegator = consentDelegationSource[key];
        if (delegator != address(0)) {
            uint256 data = _delegations[patient][delegator];
            if (((data >> ACTIVE_BIT) & 1) == 0) return false;
            uint40 dExp = uint40(data & EXPIRES_MASK);
            if (block.timestamp > dExp) return false;
        }

        return true;
    }
    
    /**
     * @notice Get consent details
     * @param rootCidHash keccak256(bytes(rootCID))
     */
    function getConsent(
        address patient,
        address grantee,
        bytes32 rootCidHash
    ) external view override returns (Consent memory) {
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