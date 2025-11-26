// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEHRSystem {
    enum RequestType { DirectAccess, FullDelegation }
    enum RequestStatus { Pending, RequesterApproved, CounterpartApproved, Completed, Rejected }

    struct AccessRequest {
        address requester;
        address counterpart;
        string rootCID;
        RequestType reqType;
        uint40 expiry;
        RequestStatus status;
        bytes32 encKeyHash;
        uint40 consentDuration;  // lưu theo giây
    }

    event AccessRequested(bytes32 indexed reqId, address indexed requester, address indexed counterpart, string rootCID, RequestType reqType);
    event AccessRequestUpdated(bytes32 indexed reqId, RequestStatus status);

    error InvalidRequest();
    error RequestExpired();
    error NotParty();
    error AlreadyProcessed();

    function requestAccess(
        address counterpart,
        string calldata rootCID,
        RequestType reqType,
        bytes32 encKeyHash,
        uint40 consentDurationHours,
        uint40 validForHours
    ) external;

    function confirmAccessRequest(bytes32 reqId) external;
    function rejectAccessRequest(bytes32 reqId) external;

    function addRecord(string calldata cid, string calldata parentCID, string calldata recordType) external;
    function delegateAuthorityBySig(address delegatee, uint40 duration, bool allowSubDelegate, uint256 deadline, bytes calldata signature) external;
    function revokeDelegation(address delegatee) external;

    function accessRequests(bytes32 reqId) external view returns (AccessRequest memory);
}
