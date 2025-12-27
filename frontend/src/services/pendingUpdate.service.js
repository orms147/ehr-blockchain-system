// Pending Update Service - Doctor update approval flow
import api from './api';

export const pendingUpdateService = {
    // Create pending update (Doctor)
    async createPendingUpdate(data) {
        return await api.post('/api/pending-updates', data);
    },

    // Get incoming updates for patient
    async getIncomingUpdates() {
        return await api.get('/api/pending-updates/incoming');
    },

    // Get outgoing updates created by doctor
    async getOutgoingUpdates() {
        return await api.get('/api/pending-updates/outgoing');
    },

    // Get approved updates ready to claim (Doctor)
    async getApprovedUpdates() {
        return await api.get('/api/pending-updates/approved');
    },

    // Get single update details
    async getUpdate(id) {
        return await api.get(`/api/pending-updates/${id}`);
    },

    // Approve update (Patient)
    async approveUpdate(id) {
        return await api.post(`/api/pending-updates/${id}/approve`);
    },

    // Reject update (Patient)
    async rejectUpdate(id) {
        return await api.post(`/api/pending-updates/${id}/reject`);
    },

    // Claim approved update (Doctor)
    async claimUpdate(id, cidHash, txHash, cid, aesKey) {
        return await api.post(`/api/pending-updates/${id}/claim`, {
            cidHash,
            txHash,
            cid,
            aesKey,
        });
    },
};

export default pendingUpdateService;


