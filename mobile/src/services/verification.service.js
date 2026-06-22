import api from './api';

export const verificationService = {
    // Submit doctor verification request
    async submitVerification(proofData) {
        return api.post('/api/verification/submit', proofData);
    },

    // Get my verification status
    async getMyVerificationStatus() {
        return api.get('/api/verification/status');
    },

    // Pending verification requests
    async getPendingVerifications() {
        return api.get('/api/verification/pending');
    },

    // Approve a verification request (returns verifyDoctor call args to broadcast)
    async approveVerification(requestId) {
        return api.post('/api/verification/review', {
            requestId,
            approved: true,
        });
    },

    // Finalize a request AFTER the org admin's verifyDoctor tx is confirmed
    // on-chain — removes it from the pending list immediately (don't wait ~30s
    // for subgraphSync, which let the org re-verify the same request repeatedly).
    async confirmVerification(requestId, txHash) {
        return api.post('/api/verification/confirm', { requestId, txHash });
    },

    // Reject a verification request
    async rejectVerification(requestId, reason) {
        return api.post('/api/verification/review', {
            requestId,
            approved: false,
            rejectionReason: reason,
        });
    },
};

export default verificationService;
