// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IConsentLedger - Privacy-Safe Version
 * @notice All functions use bytes32 cidHash instead of string CID
 * @dev Frontend MUST compute keccak256(bytes(cid)) off-chain
 */
interface IConsentLedger {
    struct Consent {
        address patient;
        address grantee;
        bytes32 rootCidHash;    // Only hash stored
        bytes32 encKeyHash;
        uint40 issuedAt;
        uint40 expireAt;
        bool active;
        bool includeUpdates;
        bool allowDelegate;
    }

    struct Delegation {
        address delegatee;
        uint40 expiresAt;
        bool allowSubDelegate;
        bool active;
    }

    // Events
    event ConsentGranted(
        address indexed patient,
        address indexed grantee,
        bytes32 indexed rootCidHash,
        uint40 expireAt,
        bool allowDelegate
    );

    event ConsentRevoked(
        address indexed patient,
        address indexed grantee,
        bytes32 indexed rootCidHash,
        uint40 timestamp
    );

    event DelegationGranted(
        address indexed patient,
        address indexed delegatee,
        uint40 expiresAt,
        bool allowSubDelegate
    );

    event DelegationRevoked(
        address indexed patient,
        address indexed delegatee
    );

    event AccessGrantedViaDelegation(
        address indexed patient,
        address indexed newGrantee,
        address indexed byDelegatee,
        bytes32 rootCidHash
    );
    
    event AuthorizedContract(address indexed contractAddress, bool allowed);
 
    // Errors
    error Unauthorized();
    error InvalidExpire();
    error InvalidNonce();
    error InvalidSignature();
    error DeadlinePassed();
    error NoActiveDelegation();
    error InvalidDuration();
    error EmptyCID();

    // ============ CONSENT FUNCTIONS (Hash-based) ============

    /**
     * @notice Grant consent (called by authorized contracts)
     * @param patient Patient address
     * @param grantee Who receives access
     * @param rootCidHash keccak256(bytes(rootCID)) - computed OFF-CHAIN
     * @param encKeyHash Hash of encryption key
     * @param expireAt Expiration timestamp (0 = forever)
     * @param includeUpdates Can access child records
     * @param allowDelegate Can delegate access to others
     */
    function grantInternal(
        address patient,
        address grantee,
        bytes32 rootCidHash,
        bytes32 encKeyHash,
        uint40 expireAt,
        bool includeUpdates,
        bool allowDelegate
    ) external;

    /**
     * @notice Grant consent via patient signature (EIP-712)
     * @dev Signature must be over cidHash, not plaintext CID
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
    ) external;

    /**
     * @notice Revoke consent
     * @param grantee Who to revoke from
     * @param rootCidHash Hash of the CID to revoke
     */
    function revoke(address grantee, bytes32 rootCidHash) external;

    // ============ DELEGATION FUNCTIONS ============

    function grantDelegation(
        address delegatee,
        uint40 duration,
        bool allowSubDelegate
    ) external;

    function grantDelegationInternal(
        address patient,
        address delegatee,
        uint40 duration,
        bool allowSubDelegate
    ) external;

    function delegateAuthorityBySig(
        address patient,
        address delegatee,
        uint40 duration,
        bool allowSubDelegate,
        uint256 deadline,
        bytes calldata signature
    ) external;

    function revokeDelegation(address delegatee) external;

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
    ) external;

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
    ) external;

    // ============ ADMIN FUNCTIONS ============

    function authorizeContract(address contractAddress, bool allowed) external;

    // ============ VIEW FUNCTIONS (Hash-based) ============

    /**
     * @notice Check if user can access record
     * @param cidHash keccak256(bytes(cid)) - computed OFF-CHAIN
     */
    function canAccess(
        address patient,
        address grantee,
        bytes32 cidHash
    ) external view returns (bool);

    /**
     * @notice Get consent details
     * @param rootCidHash keccak256(bytes(rootCID))
     */
    function getConsent(
        address patient,
        address grantee,
        bytes32 rootCidHash
    ) external view returns (Consent memory);

    function getDelegation(address patient, address delegatee) external view returns (Delegation memory);

    function getNonce(address patient) external view returns (uint256);
}