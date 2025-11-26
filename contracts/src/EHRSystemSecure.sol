// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAccessControl.sol";
import "./interfaces/IRecordRegistry.sol";
import "./interfaces/IConsentLedger.sol";

/**
 * @title EHRSystemSecure - Complete Implementation
 * @notice Main contract coordinating the EHR system with:
 * - 2-step approval (requester → patient → complete)
 * - Patient consent required
 * - Request expiry
 * - Nonce-based request IDs (no collision)
 * - Time delay between approvals (security)
 */
contract EHRSystemSecure is Ownable, Pausable, ReentrancyGuard {

    // ================ IMMUTABLES ================
    IAccessControl public immutable accessControl;
    IRecordRegistry public immutable recordRegistry;
    IConsentLedger public immutable consentLedger;

    // ================ ENUMS ================
    enum RequestType { DirectAccess, FullDelegation }
    
    enum RequestStatus {
        Pending,
        RequesterApproved,
        PatientApproved,
        Completed,
        Rejected
    }

    // ================ STRUCTS ================
    /**
     * @dev Access request with proper structure
     * ✅ FIX: Added expiry, patient approval tracking
     */
    struct AccessRequest {
        address requester;
        address patient;
        string rootCID;
        bytes32 encKeyHash;
        RequestType reqType;
        uint40 expiry;
        uint40 consentDuration;
        uint40 firstApprovalTime;
        RequestStatus status;
    }

    // ================ STORAGE ================
    mapping(bytes32 => AccessRequest) private _accessRequests;
    
    // ✅ FIX: Nonce-based request ID generation
    uint256 private _requestNonce;

    // ================ CONSTANTS ================
    uint40 private constant MIN_APPROVAL_DELAY = 1 minutes;  // Reduced from 1 hour for better UX
    uint40 private constant MAX_REQUEST_VALIDITY = 30 days;
    uint40 private constant DEFAULT_CONSENT_DURATION = 30 days;
    uint40 private constant MAX_DELEGATION_DURATION = 365 days;

    // ================ EVENTS ================
    event SystemInitialized(
        address indexed accessControl,
        address indexed recordRegistry,
        address indexed consentLedger
    );

    event AccessRequested(
        bytes32 indexed reqId,
        address indexed requester,
        address indexed patient,
        string rootCID,
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

    // ================ ERRORS ================
    error InvalidRequest();
    error RequestExpired();
    error NotParty();
    error AlreadyProcessed();
    error ApprovalTooSoon();
    error InvalidDuration();

    // ================ CONSTRUCTOR ================
    constructor(
        address accessControlAddr,
        address recordRegistryAddr,
        address consentLedgerAddr
    ) Ownable(msg.sender) {
        accessControl = IAccessControl(accessControlAddr);
        recordRegistry = IRecordRegistry(recordRegistryAddr);
        consentLedger = IConsentLedger(consentLedgerAddr);

        emit SystemInitialized(
            accessControlAddr,
            recordRegistryAddr,
            consentLedgerAddr
        );
    }

    // ================ REQUEST ACCESS ================

    /**
     * @notice Request access to patient records or delegation authority
     * ✅ FIX: Proper validation, nonce-based ID, expiry
     * 
     * @param patient Patient address
     * @param rootCID Root record CID (for DirectAccess)
     * @param reqType DirectAccess or FullDelegation
     * @param encKeyHash Encryption key hash (for DirectAccess)
     * @param consentDurationHours How long consent lasts (0 = default)
     * @param validForHours How long request is valid
     */
    function requestAccess(
        address patient,
        string calldata rootCID,
        RequestType reqType,
        bytes32 encKeyHash,
        uint40 consentDurationHours,
        uint40 validForHours
    ) external whenNotPaused nonReentrant {
        // Validate parties
        if (msg.sender == patient || patient == address(0)) {
            revert InvalidRequest();
        }
        if (!accessControl.isPatient(patient)) revert InvalidRequest();

        // Validate validity period (allow 0 for default)
        if (validForHours > MAX_REQUEST_VALIDITY / 1 hours) {
            revert InvalidRequest();
        }
        
        // Use default if 0
        if (validForHours == 0) {
            validForHours = 7 * 24; // Default: 7 days
        }

        // Validate based on request type
        bool requesterIsPatient = accessControl.isPatient(msg.sender);
        
        if (reqType == RequestType.DirectAccess) {
            // Direct access: doctor/org requests patient's record
            if (requesterIsPatient) revert InvalidRequest();
            if (bytes(rootCID).length == 0) revert InvalidRequest();
            if (encKeyHash == bytes32(0)) revert InvalidRequest();
            
            bool isDoctor = accessControl.isDoctor(msg.sender);
            bool isOrg = accessControl.isOrganization(msg.sender);
            if (!isDoctor && !isOrg) revert InvalidRequest();
            
        } else {
            // Full delegation: doctor/org requests delegation authority
            if (requesterIsPatient) revert InvalidRequest();
            
            bool isDoctor = accessControl.isDoctor(msg.sender);
            bool isOrg = accessControl.isOrganization(msg.sender);
            if (!isDoctor && !isOrg) revert InvalidRequest();
        }

        // ✅ FIX: Generate unique request ID with nonce
        bytes32 reqId = keccak256(abi.encode(
            msg.sender,
            patient,
            rootCID,
            reqType,
            _requestNonce++
        ));

        // Calculate durations
        uint40 validityWindow = validForHours * 1 hours;
        uint40 expiry = uint40(block.timestamp) + validityWindow;
        
        uint40 consentDuration;
        if (consentDurationHours == 0) {
            consentDuration = reqType == RequestType.DirectAccess 
                ? DEFAULT_CONSENT_DURATION 
                : MAX_DELEGATION_DURATION;
        } else {
            consentDuration = consentDurationHours * 1 hours;
            
            uint40 maxDuration = reqType == RequestType.DirectAccess 
                ? 365 days 
                : MAX_DELEGATION_DURATION;
            
            if (consentDuration > maxDuration) revert InvalidDuration();
        }

        // Store request
        _accessRequests[reqId] = AccessRequest({
            requester: msg.sender,
            patient: patient,
            rootCID: rootCID,
            encKeyHash: encKeyHash,
            reqType: reqType,
            expiry: expiry,
            consentDuration: consentDuration,
            firstApprovalTime: 0,
            status: RequestStatus.Pending
        });

        emit AccessRequested(
            reqId,
            msg.sender,
            patient,
            rootCID,
            reqType,
            expiry
        );
    }

    // ================ APPROVE REQUEST ================

    /**
     * @notice Approve access request
     * ✅ FIX: 2-step approval with time delay
     * Flow: Requester confirms → Patient approves → Complete (with delay)
     */
    function approveRequest(bytes32 reqId) 
        external whenNotPaused nonReentrant 
    {
        AccessRequest storage req = _accessRequests[reqId];
        
        // Validate request
        _requireValidRequest(req);

        // Check if caller is a party
        bool isRequester = msg.sender == req.requester;
        bool isPatient = msg.sender == req.patient;
        
        if (!isRequester && !isPatient) revert NotParty();

        RequestStatus currentStatus = req.status;
        uint40 now40 = uint40(block.timestamp);

        // Handle first approval
        if (currentStatus == RequestStatus.Pending) {
            if (isRequester) {
                req.status = RequestStatus.RequesterApproved;
                req.firstApprovalTime = now40;
                emit RequestApprovedByRequester(reqId, msg.sender, now40);
            } else {
                req.status = RequestStatus.PatientApproved;
                req.firstApprovalTime = now40;
                emit RequestApprovedByPatient(reqId, msg.sender, now40);
            }
            return;
        }

        // Handle second approval
        bool canComplete = false;
        
        if (currentStatus == RequestStatus.RequesterApproved && isPatient) {
            canComplete = true;
        } else if (currentStatus == RequestStatus.PatientApproved && isRequester) {
            canComplete = true;
        }

        if (!canComplete) revert AlreadyProcessed();

        // ✅ FIX: Check approval delay (security measure)
        if (now40 < req.firstApprovalTime + MIN_APPROVAL_DELAY) {
            revert ApprovalTooSoon();
        }

        // Complete request
        _completeRequest(reqId, req);
    }

    // ================ REJECT REQUEST ================

    /**
     * @notice Reject access request
     * Either party can reject
     */
    function rejectRequest(bytes32 reqId) 
        external whenNotPaused nonReentrant 
    {
        AccessRequest storage req = _accessRequests[reqId];
        _requireValidRequest(req);
        
        if (msg.sender != req.requester && msg.sender != req.patient) {
            revert NotParty();
        }

        req.status = RequestStatus.Rejected;
        
        emit RequestRejected(reqId, msg.sender, uint40(block.timestamp));
    }

    // ================ INTERNAL FUNCTIONS ================

    /**
     * @notice Complete approved request
     * ✅ FIX: Patient consent is REQUIRED (patient must approve)
     */
    function _completeRequest(bytes32 reqId, AccessRequest storage req) 
        internal 
    {
        req.status = RequestStatus.Completed;

        if (req.reqType == RequestType.DirectAccess) {
            // Grant direct access to specific record
            uint40 expireAt = req.consentDuration == 0 
                ? 0 
                : uint40(block.timestamp) + req.consentDuration;

            consentLedger.grantInternal(
                req.patient,
                req.requester,
                req.rootCID,
                req.encKeyHash,
                expireAt,
                true,
                false
            );
        } else {
            // Grant full delegation authority
            consentLedger.grantDelegationInternal(
                req.patient,
                req.requester,
                req.consentDuration,
                true
            );
        }

        emit RequestCompleted(
            reqId,
            req.requester,
            req.patient,
            req.reqType
        );
    }

    /**
     * @notice Validate request is processable
     */
    function _requireValidRequest(AccessRequest storage req) internal view {
        if (req.expiry == 0) revert InvalidRequest();
        if (block.timestamp > req.expiry) revert RequestExpired();
        
        RequestStatus status = req.status;
        if (status != RequestStatus.Pending &&
            status != RequestStatus.RequesterApproved &&
            status != RequestStatus.PatientApproved) 
        {
            revert AlreadyProcessed();
        }
    }

    // ================ VIEW FUNCTIONS ================

    /**
     * @notice Get access request details
     */
    function getAccessRequest(bytes32 reqId) 
        external view returns (AccessRequest memory) 
    {
        return _accessRequests[reqId];
    }

    /**
     * @notice Get current request nonce
     */
    function getCurrentNonce() external view returns (uint256) {
        return _requestNonce;
    }

    /**
     * @notice Get system constants
     */
    function getSystemConstants() external pure returns (
        uint40 minApprovalDelay,
        uint40 maxRequestValidity,
        uint40 defaultConsentDuration,
        uint40 maxDelegationDuration
    ) {
        return (
            MIN_APPROVAL_DELAY,
            MAX_REQUEST_VALIDITY,
            DEFAULT_CONSENT_DURATION,
            MAX_DELEGATION_DURATION
        );
    }

    // ================ EMERGENCY PAUSE ================

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}