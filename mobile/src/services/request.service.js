import api from './api';

// Request types enum (matches smart contract)
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

export const requestService = {
    // For patients: Get incoming requests (doctors requesting access)
    async getIncomingRequests() {
        return api.get('/api/requests/incoming');
    },

    // For patients: Get approval EIP-712 message to sign
    async getApprovalMessage(requestId) {
        return api.get(`/api/requests/${requestId}/approval-message`);
    },

    // For patients: Approve with signature + encrypted key.
    // cascadePayloads (S11.D, 2026-04-22): pre-computed payloads for OTHER
    // versions in the chain, staged on AccessRequest and applied by the
    // backend at mark-claimed time. Avoids updating ancestor KeyShares before
    // doctor's on-chain consent is minted.
    // Shape: [{ cidHash, encryptedPayload, senderPublicKey }]
    async approveWithSignature(requestId, signature, deadline, encryptedKeyPayload = null, cidHash = null, senderPublicKey = null, cascadePayloads = null) {
        return api.post('/api/requests/approve-with-sig', {
            requestId,
            signature,
            deadline,
            encryptedKeyPayload,
            cidHash,
            senderPublicKey,
            cascadePayloads,
        });
    },

    // For patients: Archive a request (hide from list without on-chain reject)
    async archiveRequest(requestId) {
        return api.post('/api/relayer/archive-request', { requestId });
    },

    // Wave K — fetch EIP-712 typed data for sponsored reject. Mobile signs
    // returned typedData with patient/requester wallet, then posts signature
    // to rejectWithSignature() below. Returns { typedData, deadline }.
    async getRejectMessage(requestId) {
        return api.get(`/api/requests/${requestId}/reject-message`);
    },

    // Wave K — submit signature for sponsored reject. Backend relayer
    // broadcasts EHRSystemSecure.rejectRequestBySig() and updates DB status.
    async rejectWithSignature(requestId, signature, deadline, reason = null) {
        return api.post(`/api/requests/${requestId}/reject`, {
            signature,
            deadline,
            reason,
        });
    },

    // For doctors: Mark request as claimed after on-chain transaction
    async markClaimed(requestId, claimTxHash) {
        return api.post('/api/requests/mark-claimed', { requestId, claimTxHash });
    },

    // For doctors: Get signed requests ready for on-chain claim
    async getSignedRequests() {
        return api.get('/api/requests/signed');
    },

    // Get request details
    async getRequestDetails(requestId) {
        return api.get(`/api/requests/${requestId}`);
    },
};

export default requestService;

