// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IConsentLedger {
    struct Consent {
        address patient;
        address grantee;
        bytes32 rootCidHash;  // ✅ Changed from string rootCID - no plaintext storage
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

    error Unauthorized();
    error InvalidExpire();
    error InvalidNonce();
    error InvalidSignature();
    error DeadlinePassed();
    error NoActiveDelegation();
    error InvalidDuration();
    error EmptyCID();

    // Grant consent - accepts string CID for UX, stores hash only
    function grantInternal(
        address patient,
        address grantee,
        string calldata rootCID,
        bytes32 encKeyHash,
        uint40 expireAt,
        bool includeUpdates,
        bool allowDelegate
    ) external;

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
    ) external;

    // Revoke consent
    function revoke(address grantee, string calldata rootCID) external;

    // Delegation
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
        address delegatee,
        uint40 duration,
        bool allowSubDelegate,
        uint256 deadline,
        bytes calldata signature
    ) external;

    function revokeDelegation(address delegatee) external;

    function grantUsingDelegation(
        address patient,
        address newGrantee,
        string calldata rootCID,
        bytes32 encKeyHash,
        uint40 expireAt
    ) external;

    // Authorization
    function authorizeContract(address contractAddress, bool allowed) external;

    // View functions - accept string CID, hash internally
    function canAccess(
        address patient,
        address grantee,
        string calldata cid
    ) external view returns (bool);

    function getConsent(
        address patient,
        address grantee,
        string calldata rootCID
    ) external view returns (Consent memory);

    function getDelegation(address patient, address delegatee)
        external view returns (Delegation memory);

    function getNonce(address patient) external view returns (uint256);
}