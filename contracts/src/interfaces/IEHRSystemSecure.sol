// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IEHRSystem - Privacy-Safe Version
 * @notice All functions use bytes32 cidHash instead of string CID
 */
interface IEHRSystem {
    enum RequestType { DirectAccess, FullDelegation, RecordDelegation }
    enum RequestStatus { Pending, RequesterApproved, PatientApproved, Completed, Rejected }

    struct AccessRequest {
        address requester;
        address patient;
        bytes32 rootCidHash;    // Changed from string to bytes32
        bytes32 encKeyHash;
        RequestType reqType;
        uint40 expiry;
        uint40 consentDuration;
        uint40 firstApprovalTime;
        RequestStatus status;
    }

    // Events
    event SystemInitialized(
        address indexed accessControl,
        address indexed recordRegistry,
        address indexed consentLedger
    );
    
    event AccessRequested(
        bytes32 indexed reqId,
        address indexed requester,
        address indexed patient,
        bytes32 rootCidHash,    // Changed from string to bytes32
        RequestType reqType,
        uint40 expiry
    );
    
    event RequestApprovedByRequester(
        bytes32 indexed reqId,
        address indexed requester,
        uint40 timestamp
    );
    
    event RequestApprovedByPatient(
        bytes32 indexed reqId,
        address indexed patient,
        uint40 timestamp
    );
    
    event RequestCompleted(
        bytes32 indexed reqId,
        address indexed requester,
        address indexed patient,
        RequestType reqType
    );
    
    event RequestRejected(
        bytes32 indexed reqId,
        address indexed rejectedBy,
        uint40 timestamp
    );

    // Errors
    error InvalidRequest();
    error RequestExpired();
    error NotParty();
    error AlreadyProcessed();
    error ApprovalTooSoon();
    error InvalidDuration();

    // ============ FUNCTIONS (Hash-based) ============

    /**
     * @notice Request access to patient records
     * @param rootCidHash keccak256(bytes(rootCID)) - computed OFF-CHAIN
     *        For FullDelegation, use bytes32(0)
     */
    function requestAccess(
        address patient,
        bytes32 rootCidHash,
        RequestType reqType,
        bytes32 encKeyHash,
        uint40 consentDurationHours,
        uint40 validForHours
    ) external;

    function confirmAccessRequest(bytes32 reqId) external;
    function confirmAccessRequestWithSignature(bytes32 reqId, uint256 deadline, bytes calldata signature) external;
    function rejectRequest(bytes32 reqId) external;

    // ============ VIEW FUNCTIONS ============
    
    function getAccessRequest(bytes32 reqId) external view returns (AccessRequest memory);
    function getCurrentNonce() external view returns (uint256);
    function getSystemConstants() external pure returns (
        uint40 minApprovalDelay,
        uint40 maxRequestValidity,
        uint40 defaultConsentDuration,
        uint40 maxDelegationDuration
    );
}
