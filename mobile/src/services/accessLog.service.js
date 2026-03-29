import api from './api';

export const accessLogService = {
    // Get access logs for my records
    async getAccessLogs() {
        return api.get('/api/access-logs/my/activity');
    },

    // Get access log for a specific record
    async getRecordAccessLog(cidHash) {
        return api.get(`/api/access-logs/${cidHash}`);
    },
};

export default accessLogService;
