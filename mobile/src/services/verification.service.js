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

    // Approve a verification request
    async approveVerification(requestId) {
        return api.post('/api/verification/review', {
            requestId,
            approved: true,
        });
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
