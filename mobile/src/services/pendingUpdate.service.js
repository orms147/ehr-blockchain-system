import api from './api';

export const pendingUpdateService = {
    // Doctor: Create pending update for patient's record
    async createUpdate(parentCidHash, patientAddress, encryptedContent, recordType = null, title = null) {
        return api.post('/api/pending-updates', {
            parentCidHash,
            patientAddress,
            encryptedContent,
            recordType,
            title,
        });
    },

    // Patient: Get incoming pending updates
    async getIncoming() {
        return api.get('/api/pending-updates/incoming');
    },

    // Doctor: Get outgoing pending updates
    async getOutgoing() {
        return api.get('/api/pending-updates/outgoing');
    },

    // Doctor: Get approved updates ready to claim
    async getApproved() {
        return api.get('/api/pending-updates/approved');
    },

    // Get update details
    async getUpdate(id) {
        return api.get(`/api/pending-updates/${id}`);
    },

    // Patient: Approve update
    async approve(id) {
        return api.post(`/api/pending-updates/${id}/approve`);
    },

    // Patient: Reject update
    async reject(id) {
        return api.post(`/api/pending-updates/${id}/reject`);
    },

    // Doctor: Claim approved update (after on-chain tx)
    async claim(id, cidHash, txHash, cid, aesKey) {
        return api.post(`/api/pending-updates/${id}/claim`, {
            cidHash,
            txHash,
            cid,
            aesKey,
        });
    },
};

export default pendingUpdateService;
