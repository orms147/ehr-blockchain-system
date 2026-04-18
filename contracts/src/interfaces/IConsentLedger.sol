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
        bytes32 rootCidHash;    // Canonical record-tree root (walked via RecordRegistry at grant time)
        bytes32 anchorCidHash;  // Original cidHash input to grant — used to enforce "read-only exact version"
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

    /// @notice Emergency consent lives in a SEPARATE storage slot from normal
    /// consent. Fixes BUG-D where an emergency 24h grant would overwrite an
    /// existing 30-day consent. canAccess OR-checks both: patient keeps the
    /// long-term consent untouched even if the same doctor triggers emergency.
    struct EmergencyConsent {
        uint40 issuedAt;
        uint40 expireAt;
        bool active;
    }

    // Events
    event ConsentGranted(
        address indexed patient,
        address indexed grantee,
        bytes32 indexed rootCidHash,
        bytes32 anchorCidHash,
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

    /// @notice Emergency access granted (separate from ConsentGranted — this
    /// does NOT touch the normal consent storage so the regular consent
    /// survives the emergency window).
    event EmergencyGranted(
        address indexed patient,
        address indexed grantee,
        bytes32 indexed rootCidHash,
        bytes32 anchorCidHash,
        uint40 expireAt
    );

    event AuthorizedContract(address indexed contractAddress, bool allowed);
    event SponsorAuthorized(address indexed sponsor, bool allowed);
 
    // Errors
    error Unauthorized();
    error InvalidExpire();
    error InvalidNonce();
    error InvalidSignature();
    error DeadlinePassed();
    error NoActiveDelegation();
    error InvalidDuration();
    error EmptyCID();
    error NotSponsor();
    error SubDelegateNotAllowed();
    error DelegationChainTooDeep();

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
     * @notice Grant emergency access (separate storage from normal consent).
     *         Called by DoctorUpdate.grantEmergencyAccess after witness validation.
     *         A normal consent at the same (patient, grantee, root) is NOT overwritten.
     * @param patient Patient address
     * @param grantee Doctor invoking emergency
     * @param inputCidHash any cidHash in the target record chain (walked to root)
     * @param expireAt Emergency window end (must be > now)
     */
    function grantEmergencyInternal(
        address patient,
        address grantee,
        bytes32 inputCidHash,
        uint40 expireAt
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
    
    /**
     * @notice Sponsor revokes consent on behalf of patient (for gas sponsorship)
     * @param patient Patient address who owns the consent
     * @param grantee Who to revoke from
     * @param rootCidHash Hash of the CID to revoke
     */
    function revokeFor(address patient, address grantee, bytes32 rootCidHash) external;


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
     * @notice Parent delegatee (who holds an active delegation from patient with
     *         allowSubDelegate = true) creates a sub-delegation for another doctor.
     *         This is the CHAIN topology entry point — enables N-hop delegation chains.
     * @dev    Sub-delegation expiry is capped to the parent's expiry.
     */
    function subDelegate(
        address patient,
        address newDelegatee,
        uint40 duration,
        bool allowSubDelegate
    ) external;

    /**
     * @notice Parent of a sub-delegation revokes it. Bumps the delegatee's epoch
     *         so every consent they granted via grantUsingDelegation becomes invalid.
     */
    function revokeSubDelegation(address patient, address subDelegatee) external;

    /**
     * @notice Delegatee grants access to someone else
     * @param rootCidHash keccak256(bytes(rootCID)) - computed OFF-CHAIN
     * @param includeUpdates Whether the new consent can traverse the update chain
     * @param allowDelegate Whether the new grantee may further sub-delegate this consent
     * @dev    Consent expiry is capped to the caller's active delegation expiry.
     */
    function grantUsingDelegation(
        address patient,
        address newGrantee,
        bytes32 rootCidHash,
        bytes32 encKeyHash,
        uint40 expireAt,
        bool includeUpdates,
        bool allowDelegate
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