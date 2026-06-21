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

    // Remove a doctor from org (legacy db-only). Wave G prefers
    // on-chain removeOrgMember broadcast + mirror via addMember POST.
    async removeMember(orgId, memberId) {
        return api.post(`/api/org/${orgId}/remove-member/${memberId}`);
    },

    // Wave G: mirror on-chain addOrgMember tx → create OrganizationMember
    // row. Mobile broadcasts AccessControl.addOrgMember(orgId, doctor) tx,
    // then POSTs here with the tx hash for backend to mirror DB cache.
    async addMember(orgId, memberAddress, txHash, role = 'doctor') {
        return api.post(`/api/org/${orgId}/add-member`, {
            memberAddress,
            txHash,
            role,
        });
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

    // Get all verified organizations (Ministry-only endpoint)
    async getAllOrganizations() {
        return api.get('/api/org/all');
    },

    // Public directory of verified+active orgs — any authenticated user.
    // Doctors use this to pick which facility verifies their CCHN.
    async getOrgDirectory() {
        return api.get('/api/org/directory');
    },

    // Wave E: list doctors NOT belonging to any organization. Ministry uses
    // this to verify independent doctors directly. Filter status:
    //   'pending' (default) | 'verified' | 'revoked' | 'all'
    async getIndependentDoctors(status = 'pending') {
        return api.get('/api/admin/independent-doctors', { status });
    },

    // Wave E: mirror on-chain verifyDoctorByMinistry tx → flip
    // VerificationRequest.status='approved' + record txHash.
    async mirrorVerifyDoctor(doctorAddress, txHash, credential = null) {
        return api.post('/api/admin/verify-doctor-mirror', {
            doctorAddress,
            txHash,
            credential,
        });
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
