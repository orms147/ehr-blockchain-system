import api from './api';

export const recordService = {
    // Create new record metadata
    async createRecord(cidHash, recordTypeHash = null, parentCidHash = null, title = null, description = null, recordType = null) {
        return api.post('/api/records', {
            cidHash,
            recordTypeHash,
            parentCidHash,
            title,
            description,
            recordType,
        });
    },

    // Get my records
    async getMyRecords() {
        return api.get('/api/records/my');
    },

    // Get single record by cidHash
    async getRecord(cidHash) {
        return api.get(`/api/records/${cidHash}`);
    },

    // Alias for getRecord
    async getByHash(cidHash) {
        return this.getRecord(cidHash);
    },

    async getRecordChain(cidHash) {
        return api.get(`/api/records/chain/${cidHash}`);
    },

    async getChainCids(cidHash) {
        return api.get(`/api/records/chain-cids/${cidHash}`);
    },

    async getAccessList(cidHash) {
        return api.get(`/api/records/${cidHash}/access`);
    },

    async revokeAccess(cidHash, targetAddress) {
        return api.delete(`/api/records/${cidHash}/access/${targetAddress}`);
    },

    async getRecordAccess(cidHash) {
        return api.get(`/api/records/${cidHash}/access`);
    }
};

export default recordService;
