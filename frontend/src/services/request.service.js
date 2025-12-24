// Request Service - Frontend client for access request management
import { api } from './api';

// EHRSystemSecure contract ABI for requests (matching official contract)
export const EHR_SYSTEM_ABI = [
    // requestAccess with 6 params
    'function requestAccess(address patient, bytes32 rootCidHash, uint8 reqType, bytes32 encKeyHash, uint40 consentDurationHours, uint40 validForHours) external',
    'function confirmAccessRequest(bytes32 reqId) external',
    'function confirmAccessRequestWithSignature(bytes32 reqId, uint256 deadline, bytes signature) external',
    'function rejectRequest(bytes32 reqId) external',
    'function getAccessRequest(bytes32 reqId) external view returns (tuple(address requester, address patient, bytes32 rootCidHash, bytes32 encKeyHash, uint8 reqType, uint40 expiry, uint40 consentDuration, uint40 firstApprovalTime, uint8 status))',
    'event AccessRequested(bytes32 indexed reqId, address indexed requester, address indexed patient, bytes32 rootCidHash, uint8 reqType, uint40 expiry)',
    'event RequestCompleted(bytes32 indexed reqId, address indexed requester, address indexed patient, uint8 reqType)',
    'event RequestRejected(bytes32 indexed reqId, address indexed rejectedBy, uint40 timestamp)',
];

// Request types enum
export const REQUEST_TYPES = {
    VIEW_ONLY: 0,
    FULL_ACCESS: 1,
    EMERGENCY: 2,
};

// Request status enum
export const REQUEST_STATUS = {
    PENDING: 0,
    APPROVED: 1,
    REJECTED: 2,
    EXPIRED: 3,
};

// Backend API calls
export async function getMyRequests() {
    // Get requests made BY current user (as Doctor)
    const response = await api.get('/api/requests/outgoing');
    return response;
}

export async function getPendingRequestsForMe() {
    // Get requests made TO current user (as Patient)
    const response = await api.get('/api/requests/incoming');
    return response;
}

export async function getRequestDetails(requestId) {
    const response = await api.get(`/api/requests/${requestId}`);
    return response;
}

// Create a new access request (called by Doctor after on-chain tx)
export async function createAccessRequest(patientAddress, cidHash, requestType, durationDays = 7, txHash = null, onChainReqId = null) {
    const response = await api.post('/api/requests/create', {
        patientAddress,
        cidHash,
        requestType,
        durationDays,
        txHash,
        onChainReqId, // bytes32 from AccessRequested event
    });
    return response;
}

// Approve request with signature (Patient signs, anyone can submit)
// Optionally includes encrypted AES key for Doctor to decrypt
export async function approveWithSignature(
    requestId,
    signature,
    deadline,
    encryptedKeyPayload = null,
    cidHash = null,
    senderPublicKey = null
) {
    const response = await api.post('/api/requests/approve-with-sig', {
        requestId,
        signature,
        deadline,
        encryptedKeyPayload,
        cidHash,
        senderPublicKey,
    });
    return response;
}

// Get EIP-712 message for signing
export async function getApprovalMessage(requestId) {
    const response = await api.get(`/api/requests/${requestId}/approval-message`);
    return response;
}

// Archive a request (hide without on-chain reject)
export async function archiveRequest(requestId) {
    const response = await api.post('/api/relayer/archive-request', { requestId });
    return response;
}

// Get archived requests
export async function getArchivedRequests() {
    const response = await api.get('/api/relayer/archived-requests');
    return response;
}

// Restore archived request
export async function restoreRequest(requestId) {
    const response = await api.post('/api/relayer/restore-request', { requestId });
    return response;
}

// Get requests that Patient signed (for Doctor to claim)
export async function getSignedRequests() {
    const response = await api.get('/api/requests/signed');
    return response;
}

// Mark request as claimed after Doctor submits on-chain
export async function markClaimed(requestId, claimTxHash) {
    const response = await api.post('/api/requests/mark-claimed', {
        requestId,
        claimTxHash,
    });
    return response;
}

export const requestService = {
    getMyRequests,
    getPendingRequestsForMe,
    getRequestDetails,
    createAccessRequest,
    approveWithSignature,
    getApprovalMessage,
    archiveRequest,
    getArchivedRequests,
    restoreRequest,
    getSignedRequests,
    markClaimed,
    REQUEST_TYPES,
    REQUEST_STATUS,
};
