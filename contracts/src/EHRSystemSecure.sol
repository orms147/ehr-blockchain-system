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

/**
 * @title EHRSystemSecure - Privacy-Safe Version
 * @notice All functions use bytes32 cidHash instead of string CID
 * @dev Frontend MUST compute keccak256(bytes(cid)) off-chain before calling
 * 
 * SECURITY: This version NEVER receives plaintext CID on-chain.
 * The CID only exists in frontend/IPFS, never in blockchain calldata.
 */
contract EHRSystemSecure is IEHRSystem, Ownable, Pausable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;

    // EIP-712 Typehash - enriched so user knows exactly what they're confirming
    bytes32 private constant CONFIRM_TYPEHASH = keccak256(
        "ConfirmRequest(bytes32 reqId,address requester,address patient,bytes32 rootCidHash,uint8 reqType,uint256 deadline)"
    );

    // Immutables
    IAccessControl public immutable accessControl;
    IRecordRegistry public immutable recordRegistry;
    IConsentLedger public immutable consentLedger;

    // Storage
    mapping(bytes32 => IEHRSystem.AccessRequest) private _accessRequests;
    uint256 private _requestNonce;
    
    // Constants
    uint40 private constant MIN_APPROVAL_DELAY = 15 seconds;
    uint40 private constant MAX_REQUEST_VALIDITY = 30 days;
    uint40 private constant DEFAULT_CONSENT_DURATION = 30 days;
    uint40 private constant MAX_DELEGATION_DURATION = 365 days;

    // Constructor
    constructor(
        address accessControlAddr,
        address recordRegistryAddr,
        address consentLedgerAddr
    ) EIP712("EHR System Secure", "2") Ownable(msg.sender) {
        accessControl = IAccessControl(accessControlAddr);
        recordRegistry = IRecordRegistry(recordRegistryAddr);
        consentLedger = IConsentLedger(consentLedgerAddr);

        emit SystemInitialized(accessControlAddr, recordRegistryAddr, consentLedgerAddr);
    }

    /// @notice Get the EIP-712 domain separator
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ============ MAIN FUNCTIONS (Hash-based) ============

    /**
     * @notice Request access to patient records
     * @param rootCidHash keccak256(bytes(rootCID)) - computed OFF-CHAIN
     *        For DirectAccess/RecordDelegation: required (non-zero)
     *        For FullDelegation: must be bytes32(0)
     */
    function requestAccess(
        address patient,
        bytes32 rootCidHash,
        RequestType reqType,
        bytes32 encKeyHash,
        uint40 consentDurationHours,
        uint40 validForHours
    ) external override whenNotPaused nonReentrant {
        // Validate parties
        if (msg.sender == patient || patient == address(0)) {
            revert InvalidRequest();
        }
        if (!accessControl.isPatient(patient)) revert InvalidRequest();

        // Validate validity period
        if (validForHours > MAX_REQUEST_VALIDITY / 1 hours) {
            revert InvalidRequest();
        }
        
        // Use default if 0
        if (validForHours == 0) {
            validForHours = 7 * 24; // Default: 7 days
        }

        // Validate based on request type
        bool requesterIsPatient = accessControl.isPatient(msg.sender);
        
        if (reqType == RequestType.DirectAccess || reqType == RequestType.RecordDelegation) {
            // These require a specific record
            if (rootCidHash == bytes32(0)) revert InvalidRequest();
        } else if (reqType == RequestType.FullDelegation) {
            // Full delegation should NOT have a specific record
            if (rootCidHash != bytes32(0)) revert InvalidRequest();
            
            // Only doctors/orgs can request full delegation
            if (requesterIsPatient) revert InvalidRequest();
            
            bool isDoctor = accessControl.isDoctor(msg.sender);
            bool isOrg = accessControl.isOrganization(msg.sender);
            if (!isDoctor && !isOrg) revert InvalidRequest();
        }

        bytes32 reqId = keccak256(abi.encode(
            msg.sender,
            patient,
            rootCidHash,
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

        // Store request with cidHash (not string!)
        _accessRequests[reqId] = AccessRequest({
            requester: msg.sender,
            patient: patient,
            rootCidHash: rootCidHash,    // bytes32, not string
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
            rootCidHash,
            reqType,
            expiry
        );
    }

    // ============ APPROVAL FUNCTIONS ============

    function confirmAccessRequest(bytes32 reqId) external override whenNotPaused nonReentrant {
        _processConfirmation(reqId, msg.sender);
    }

    function _processConfirmation(bytes32 reqId, address approver) internal {
        AccessRequest storage req = _accessRequests[reqId];
        
        _requireValidRequest(req);

        bool isRequester = approver == req.requester;
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

        _completeRequest(reqId, req);
    }

    /**
     * @notice Confirm access request with patient signature
     * @param reqId Request ID to confirm
     * @param deadline Signature deadline (must be in future)
     * @param signature EIP-712 signature from patient
     */
    function confirmAccessRequestWithSignature(
        bytes32 reqId,
        uint256 deadline,
        bytes calldata signature
    ) external override whenNotPaused nonReentrant {
        // Check deadline FIRST
        if (block.timestamp > deadline) revert RequestExpired();
        
        AccessRequest storage req = _accessRequests[reqId];
        
        // Validate request BEFORE signature verification (save gas on invalid requests)
        _requireValidRequest(req);

        // Build EIP-712 struct hash with FULL context
        // User's wallet will show: reqId, requester, patient, rootCidHash, reqType, deadline
        bytes32 structHash = keccak256(abi.encode(
            CONFIRM_TYPEHASH,
            reqId,
            req.requester,
            req.patient,
            req.rootCidHash,
            uint8(req.reqType),
            deadline
        ));

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);

        if (signer != req.patient) revert InvalidRequest();

        _processConfirmation(reqId, signer);
    }

    function rejectRequest(bytes32 reqId) external override whenNotPaused nonReentrant {
        AccessRequest storage req = _accessRequests[reqId];
        _requireValidRequest(req);
        
        if (msg.sender != req.requester && msg.sender != req.patient) {
            revert NotParty();
        }

        req.status = RequestStatus.Rejected;
        
        emit RequestRejected(reqId, msg.sender, uint40(block.timestamp));
    }

    // ============ INTERNAL FUNCTIONS ============

    function _completeRequest(bytes32 reqId, AccessRequest storage req) internal {
        req.status = RequestStatus.Completed;

        if (req.reqType == RequestType.DirectAccess) {
            uint40 expireAt = req.consentDuration == 0 
                ? 0 
                : uint40(block.timestamp) + req.consentDuration;

            consentLedger.grantInternal(
                req.patient,
                req.requester,
                req.rootCidHash,    // bytes32, not string
                req.encKeyHash,
                expireAt,
                false              // DirectAccess: no re-share
            );
        } else if (req.reqType == RequestType.RecordDelegation) {
            consentLedger.grantInternal(
                req.patient,
                req.requester,
                req.rootCidHash,    // bytes32, not string
                req.encKeyHash,
                uint40(block.timestamp) + req.consentDuration,
                true               // RecordDelegation: allowDelegate (re-share)
            );
        } else {
            // FullDelegation
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

    // ============ VIEW FUNCTIONS ============

    function getAccessRequest(bytes32 reqId) external view override returns (AccessRequest memory) {
        return _accessRequests[reqId];
    }

    function getCurrentNonce() external view override returns (uint256) {
        return _requestNonce;
    }

    function getSystemConstants() external pure override returns (
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

    // ============ ADMIN FUNCTIONS ============

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}