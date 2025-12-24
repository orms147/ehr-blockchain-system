// Record Service - manages medical records
import api from './api';

export const recordService = {
    // Create new record metadata (or update with parentCidHash for version chain)
    async createRecord(cidHash, recordTypeHash = null, parentCidHash = null, title = null, description = null, recordType = null) {
        return api.post('/api/records', {
            cidHash,
            recordTypeHash,
            parentCidHash, // Links to parent record for updates
            title,
            description,
            recordType,
        });
    },


    // Get my records
    async getMyRecords() {
        return api.get('/api/records/my');
    },

    // Save metadata only (for Doctor who already did on-chain tx)
    // Also creates KeyShare for Doctor with 7-day access if encryptedPayload provided
    async saveRecordMetadata(cidHash, recordTypeHash, ownerAddress, options = {}) {
        return api.post('/api/records/save-only', {
            cidHash,
            recordTypeHash,
            ownerAddress,
            encryptedPayload: options.encryptedPayload || null,
            senderPublicKey: options.senderPublicKey || null,
            title: options.title || null,
            description: options.description || null,
            recordType: options.recordType || null,
        });
    },


    // Get single record by cidHash
    async getRecord(cidHash) {
        return api.get(`/api/records/${cidHash}`);
    },

    // Get list of who has access to a record (only owner can view)
    async getAccessList(cidHash) {
        return api.get(`/api/records/${cidHash}/access`);
    },

    // Revoke someone's access to a record (only owner can revoke)
    async revokeAccess(cidHash, targetAddress) {
        return api.delete(`/api/records/${cidHash}/access/${targetAddress}`);
    },
};

export default recordService;
