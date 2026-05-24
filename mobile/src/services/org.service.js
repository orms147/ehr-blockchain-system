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

    // Get org members (doctors under this org). Returns enriched shape with
    // fullName/specialty/licenseNumber/verifiedAt + filter counts per Wave C.
    //   status: 'active' (default) | 'revoked' | 'all'
    async getOrgMembers(orgId, status = 'active') {
        return api.get(`/api/org/${orgId}/members`, { status });
    },

    // Wave C: mirror on-chain revokeDoctorVerification → flip member status
    // to 'revoked'. Mobile broadcasts the contract tx, this updates the cache.
    async mirrorRevokeMember(orgId, doctorAddress, txHash, reason = null) {
        return api.post(`/api/org/${orgId}/revoke-member`, {
            doctorAddress,
            txHash,
            reason,
        });
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

    // Wave D: confirm/sync after Ministry broadcasts createOrganization tx.
    // Mobile parses OrganizationCreated event from receipt → posts orgId + name
    // + admins + txHash. Backend verifies receipt + writes Organization +
    // OrganizationMember admin row.
    async confirmOrgCreation({ orgId, name, primaryAdmin, backupAdmin, txHash, licenseCid = null, licenseUrl = null }) {
        return api.post('/api/admin/confirm-org-creation', {
            orgId: String(orgId),  // serialize BigInt safely
            name,
            primaryAdmin,
            backupAdmin,
            txHash,
            licenseCid,
            licenseUrl,
        });
    },
};

export default orgService;
