// Record Service - manages medical records
import api from './api';

export const recordService = {
    // Create new record metadata
    async createRecord(cidHash, recordTypeHash = null) {
        return api.post('/api/records', {
            cidHash,
            recordTypeHash,
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
};

export default recordService;
