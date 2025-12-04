// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IConsentLedger} from "src/interfaces/IConsentLedger.sol";

contract ConsentLedger is EIP712, ReentrancyGuard, IConsentLedger {
    using ECDSA for bytes32;

    // Type hash (for off-chain sign)
        // Struct name = ConsentPermit
        // Fields = patient, grantee, rootCID, encKeyHash, expireAt, ...
    bytes32 private constant CONSENT_PERMIT_TYPEHASH = keccak256(
        "ConsentPermit(address patient,address grantee,string rootCID,bytes32 encKeyHash,uint256 expireAt,bool includeUpdates,bool allowDelegate,uint256 deadline,uint256 nonce)"
    );

    bytes32 private constant DELEGATION_PERMIT_TYPEHASH = keccak256(
        "DelegationPermit(address patient,address delegatee,uint40 duration,bool allowSubDelegate,uint256 deadline,uint256 nonce)"
    );

    // Storage

    // Key : bytes32 = keccak256(patient, grantee, rootCidHash)
    mapping(bytes32 => Consent) private _consents;
    
    // Delegation: patient => delegatee => packed data
    mapping(address => mapping(address => uint256)) private _delegations;
                                        //uint256 : 0–39 : expiresAt (uint40)       (Lowest bit)
                                        //          40   : allowSubDelegate
                                        //          41   : active
    
    // Nonces for replay protection
    mapping(address => uint256) public nonces;
    
    // Authorization (contract hav permit to call)
    mapping(address => bool) public authorizedContracts;        //admin as default

    address public immutable admin;

    // CONSTANT
    uint40 private constant FOREVER = type(uint40).max;
    uint40 private constant MAX_DURATION = 5 * 365 days;
    uint40 private constant MIN_DURATION = 1 days;          //cannot spam

    // Delegation bit positions (packed data _delegations)
    uint256 private constant EXPIRES_MASK = 0xFFFFFFFFFF;      // 10 * 4 = 40 bits  (Lowest bit -> expiresAt)
    uint256 private constant ALLOW_SUB_DELEGATE_BIT = 40;      // allowSubDelegate
    uint256 private constant ACTIVE_BIT = 41;                  // active

    // Constructors
    constructor (address admin_) EIP712("EHR Consent Ledger", "1") {
        if (admin_ == address(0)) revert Unauthorized();
        admin = admin_;
        authorizedContracts[admin_] = true;
        emit AuthorizedContract(admin_, true);
    }

    // Modifier
    modifier onlyAuthorized() {
        if (!authorizedContracts[msg.sender] && msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    // Authorization
    function authorizeContract(address contractAddress, bool allowed) external override onlyAdmin {
        if (contractAddress == address(0)) revert Unauthorized();
        authorizedContracts[contractAddress] = allowed;
        emit AuthorizedContract(contractAddress, allowed);
    }


    // Grant access --------------------------------------------------------
    // When patient agrees to request access to 1 record from doctor, system call this func
    function grantInternal(
        address patient,
        address grantee,
        string calldata rootCID,
        bytes32 encKeyHash,
        uint40 expireAt,
        bool includeUpdates,
        bool allowDelegate
    ) external override onlyAuthorized nonReentrant {
        if (bytes(rootCID).length == 0) revert EmptyCID();

        bytes32 rootCidHash = keccak256(bytes(rootCID));  // hash immediately
        
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

    // grant by patient's sig
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
        
        // CONSENT_PERMIT_TYPEHASH ~ correct data type order
        bytes32 structHash = keccak256(abi.encode(
            CONSENT_PERMIT_TYPEHASH,
            patient,
            grantee,
            keccak256(bytes(rootCID)),
            encKeyHash,
            expireAt,
            includeUpdates,
            allowDelegate,
            deadline,       
            currentNonce
        ));

        bytes32 digest = _hashTypedDataV4(structHash);      //create digest = keccak256("\x19\x01" || domainSeparator || structHash)
        address signer = digest.recover(signature);
        
        if (signer != patient) revert InvalidSignature();
        
        nonces[patient] = currentNonce + 1;

        if (bytes(rootCID).length == 0) revert EmptyCID();
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

    function _grantConsent(
        address patient,
        address grantee,
        bytes32 rootCidHash,  // bytes32 parameter
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
            rootCidHash: rootCidHash,  // store hash only
            encKeyHash: encKeyHash,
            issuedAt: now40,
            expireAt: finalExpiry,
            active: true,
            includeUpdates: includeUpdates,
            allowDelegate: allowDelegate
        });

        emit ConsentGranted(patient, grantee, rootCidHash, finalExpiry, allowDelegate);
    }

    // Revoke --------------------------------------------------------
    function revoke (address grantee, string calldata rootCID) external override nonReentrant {
        bytes32 rootCidHash = keccak256(bytes(rootCID));
        bytes32 key = keccak256(abi.encode(msg.sender, grantee, rootCidHash));
        Consent storage c = _consents[key];
        
        if (!c.active) revert Unauthorized();
        if (c.patient != msg.sender) revert Unauthorized();     //check owner
        
        c.active = false;       //revoke
        
        emit ConsentRevoked(msg.sender, grantee, rootCidHash, uint40(block.timestamp));
    }

    // Delegate - grant/revoke --------------------------------------------------------

    // Patient grant Delegate
    function grantDelegation(
        address delegatee,
        uint40 duration,
        bool allowSubDelegate
    ) external override nonReentrant {
        _grantDelegation(msg.sender, delegatee, duration, allowSubDelegate);
    }

    // System : Master grantee send request all record + delegate rights; patient OK -> run this fn
    function grantDelegationInternal(
        address patient,
        address delegatee,
        uint40 duration,
        bool allowSubDelegate
    ) external override onlyAuthorized nonReentrant {
        _grantDelegation(patient, delegatee, duration, allowSubDelegate);
    }

    // Authority off-chain delegate sig
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

        uint40 expiresAt = uint40(block.timestamp) + duration;

        //packed data (expiresAt + allowSubDelegate + active) in _delegations
        uint256 packed = 
            uint256(expiresAt) |
            (allowSubDelegate ? (1 << ALLOW_SUB_DELEGATE_BIT) : 0) |      //if allow -> put in 40th bit
            (1 << ACTIVE_BIT);      //41th bit

        _delegations[patient][delegatee] = packed;

        emit DelegationGranted(patient, delegatee, expiresAt, allowSubDelegate);
    }

    // Revoke delegate
    function revokeDelegation(address delegatee) external override nonReentrant {
        //get packed data
        uint256 data = _delegations[msg.sender][delegatee];

        if (data == 0 || ((data >> ACTIVE_BIT) & 1) == 0) {
            revert NoActiveDelegation();
        }

        //remove active flag (AND with mask hav ACTIVE_BIT = 0)
        _delegations[msg.sender][delegatee] = data & ~(1 << ACTIVE_BIT);
        
        emit DelegationRevoked(msg.sender, delegatee);
    }

    // Using delegate ------------------------------------------------

    // Master Grant using delegate rights to grant
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

        if (bytes(rootCID).length == 0) revert EmptyCID();
        
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

    // Grantee, who have delegate 1 record, share this record
    function grantUsingRecordDelegation(
        address patient,
        address newGrantee,
        string calldata rootCID,
        bytes32 encKeyHash,
        uint40 expireAt
    ) external override nonReentrant {
        if (bytes(rootCID).length == 0) revert EmptyCID();
        bytes32 rootCidHash = keccak256(bytes(rootCID));

        // check if msg.sender has active consent (allowDelegate=true)
        bytes32 senderKey = keccak256(abi.encode(patient, msg.sender, rootCidHash));
        Consent memory senderConsent = _consents[senderKey];        // Get consent info

        if (!senderConsent.active) revert Unauthorized();
        if (senderConsent.expireAt != FOREVER && block.timestamp > senderConsent.expireAt) {
            revert Unauthorized();
        }
        if (!senderConsent.allowDelegate) revert Unauthorized();    // anti attacker : has access record only

        // grant access to newGrantee
        _grantConsent(
            patient,
            newGrantee,
            rootCidHash,
            encKeyHash,
            expireAt,
            false, // subdelegates cannot grant 
            false  // subdelegates cannot grant 
        );

        emit AccessGrantedViaDelegation(patient, newGrantee, msg.sender, rootCidHash);
    }

    // View function --------------------------------------------------------
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