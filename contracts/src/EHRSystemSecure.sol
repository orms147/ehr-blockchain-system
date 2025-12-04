// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./interfaces/IAccessControl.sol";
import "./interfaces/IRecordRegistry.sol";
import "./interfaces/IConsentLedger.sol";
import "./interfaces/IEHRSystemSecure.sol";

contract EHRSystemSecure is IEHRSystem, Ownable, Pausable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;

    // Typehash EIP-712 signature
    bytes32 private constant CONFIRM_TYPEHASH = keccak256("ConfirmRequest(bytes32 reqId)");

    // Immutable
    IAccessControl public immutable accessControl;
    IRecordRegistry public immutable recordRegistry;
    IConsentLedger public immutable consentLedger;

    // Storage
    mapping(bytes32 => IEHRSystem.AccessRequest) private _accessRequests;
    uint256 private _requestNonce;
    
    // Constant
    uint40 private constant MIN_APPROVAL_DELAY = 1 minutes;  
    uint40 private constant MAX_REQUEST_VALIDITY = 30 days;
    uint40 private constant DEFAULT_CONSENT_DURATION = 30 days;
    uint40 private constant MAX_DELEGATION_DURATION = 365 days;

    // Constructor
    constructor(
        address accessControlAddr,
        address recordRegistryAddr,
        address consentLedgerAddr
    ) EIP712("EHR System Secure", "1") Ownable(msg.sender) {
        accessControl = IAccessControl(accessControlAddr);
        recordRegistry = IRecordRegistry(recordRegistryAddr);
        consentLedger = IConsentLedger(consentLedgerAddr);

        emit SystemInitialized(accessControlAddr, recordRegistryAddr, consentLedgerAddr);
    }

    // Function

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
        
        // Validate Request Type
        if (reqType == RequestType.DirectAccess || reqType == RequestType.RecordDelegation) {
            if (bytes(rootCID).length == 0) revert InvalidRequest(); // required record cid
        } else if (reqType == RequestType.FullDelegation) {
            if (bytes(rootCID).length > 0) revert InvalidRequest(); // > 1 record
        } else {
            // Full delegation: doctor/org requests delegation authority
            if (requesterIsPatient) revert InvalidRequest();
            
            bool isDoctor = accessControl.isDoctor(msg.sender);
            bool isOrg = accessControl.isOrganization(msg.sender);
            if (!isDoctor && !isOrg) revert InvalidRequest();
        }

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

    // Approve request
    function confirmAccessRequest(bytes32 reqId) external whenNotPaused nonReentrant {
        _processConfirmation(reqId, msg.sender);
    }

    function _processConfirmation(bytes32 reqId, address approver) internal {
        AccessRequest storage req = _accessRequests[reqId];
        
        // Validate request
        _requireValidRequest(req);

        // Check if caller is a party
        bool isRequester = approver == req.requester;   // msg.sender = doctor
        bool isPatient = approver == req.patient;
        
        if (!isRequester && !isPatient) revert NotParty();

        RequestStatus currentStatus = req.status;
        uint40 now40 = uint40(block.timestamp);

        // Handle first approval
        if (currentStatus == RequestStatus.Pending) {
            if (isRequester) {
                req.status = RequestStatus.RequesterApproved;
                req.firstApprovalTime = now40;
                emit RequestApprovedByRequester(reqId, approver, now40);
            } else {
                req.status = RequestStatus.PatientApproved;
                req.firstApprovalTime = now40;
                emit RequestApprovedByPatient(reqId, approver, now40);
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

        if (now40 < req.firstApprovalTime + MIN_APPROVAL_DELAY) {
            revert ApprovalTooSoon();
        }

        // Complete request
        _completeRequest(reqId, req);
    }

    function confirmAccessRequestWithSignature(
        bytes32 reqId, 
        bytes calldata signature
    ) 
        external 
        whenNotPaused 
        nonReentrant 
    {
        AccessRequest storage req = _accessRequests[reqId];

        bytes32 structHash = keccak256(abi.encode(
            CONFIRM_TYPEHASH,
            reqId
        ));

        bytes32 hash = _hashTypedDataV4(structHash);

        address signer = ECDSA.recover(hash, signature);

        if (signer != req.patient) revert("Invalid Signature");

        _processConfirmation(reqId, signer);
    }

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

    // Internal func
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
                true,       // includeUpdates
                false       // delegation false
            );
        } else if (req.reqType == RequestType.RecordDelegation) {
            
            consentLedger.grantInternal(
                req.patient,
                req.requester,
                req.rootCID,
                req.encKeyHash,
                uint40(block.timestamp) + req.consentDuration,
                true,  // includeUpdates
                true   // allowDelegate = TRUE 
            );
        } else {
        // FullDelegation
            consentLedger.grantDelegationInternal(
                req.patient,
                req.requester,
                req.consentDuration,
                true // allowSubDelegate
            );
        }

        emit RequestCompleted(
            reqId,
            req.requester,
            req.patient,
            req.reqType
        );
    }

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

    // View function
    function getAccessRequest(bytes32 reqId) 
        external view returns (AccessRequest memory) 
    {
        return _accessRequests[reqId];
    }

    function getCurrentNonce() external view returns (uint256) {
        return _requestNonce;
    }

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

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}