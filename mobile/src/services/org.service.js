import api from './api';

export const orgService = {
    // Get my org application status
    async getMyApplication() {
        return api.get('/api/org/my-application');
    },

    // Get my org details (for verified org admin)
    async getMyOrg() {
        return api.get('/api/org/my-org');
    },

    // Get org members (doctors under this org)
    async getOrgMembers(orgId) {
        return api.get(`/api/org/${orgId}/members`);
    },

    // Legacy helper: approve a verification request by id
    async verifyDoctor(orgId, verificationRequestId) {
        return api.post('/api/verification/review', {
            requestId: verificationRequestId,
            approved: true,
        });
    },

    // Remove a doctor from org
    async removeMember(orgId, memberId) {
        return api.post(`/api/org/${orgId}/remove-member/${memberId}`);
    },

    // Submit org application
    async submitApplication(data) {
        return api.post('/api/org/apply', data);
    },

    // Admin: get all pending org applications
    async getPendingApplications() {
        return api.get('/api/admin/org-applications', { status: 'PENDING' });
    },

    // Admin: approve org application
    async approveApplication(applicationId) {
        return api.post(`/api/admin/org-applications/${applicationId}/approve`);
    },

    // Admin: reject org application
    async rejectApplication(applicationId, reason) {
        return api.post(`/api/admin/org-applications/${applicationId}/reject`, { reason });
    },

    // Get all verified organizations
    async getAllOrganizations() {
        return api.get('/api/org/all');
    },
};

export default orgService;
