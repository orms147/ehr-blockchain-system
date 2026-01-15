// Access Log Service - fetches audit logs for records
import api from './api';

export const accessLogService = {
    // Get access logs for a specific record (owner only)
    async getRecordLogs(cidHash) {
        const response = await api.get(`/api/access-logs/${cidHash}`);
        return response.data;
    },

    // Get my own activity logs
    async getMyActivity() {
        const response = await api.get('/api/access-logs/my/activity');
        return response.data;
    },
};

export default accessLogService;
