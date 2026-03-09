// Organization Service - Frontend client for hospital/clinic management
import { api } from './api';

// ============ ORG APPLICATION (Hybrid Flow) ============

// Apply/update org profile (with file upload support)
export async function applyOrg(data) {
    // If data is FormData, use postFormData, else use regular post
    if (data instanceof FormData) {
        const response = await api.postFormData('/api/org/apply', data);
        return response;
    }
    const response = await api.post('/api/org/apply', data);
    return response;
}

// Get my application status
export async function getMyApplication() {
    const response = await api.get('/api/org/my-application');
    return response;
}

// ============ ORG MANAGEMENT ============

// Register organization (legacy - direct on-chain)
export async function registerOrg(data) {
    const response = await api.post('/api/org/register', data);
    return response;
}

// Get my organization
export async function getMyOrg() {
    const response = await api.get('/api/org/my-org');
    return response;
}

// Get organization members
export async function getOrgMembers(orgId) {
    const response = await api.get(`/api/org/${orgId}/members`);
    return response;
}

// Add member to organization
export async function addOrgMember(orgId, memberAddress, role = 'doctor') {
    const response = await api.post(`/api/org/${orgId}/add-member`, {
        memberAddress,
        role,
    });
    return response;
}

// Remove member from organization
export async function removeOrgMember(orgId, memberId) {
    const response = await api.post(`/api/org/${orgId}/remove-member/${memberId}`);
    return response;
}

// Get all organizations (for Ministry)
export async function getAllOrgs(status = null, type = null) {
    let url = '/api/org/all';
    const params = [];
    if (status) params.push(`status=${status}`);
    if (type) params.push(`type=${type}`);
    if (params.length > 0) url += '?' + params.join('&');
    const response = await api.get(url);
    return response;
}

// ============ ADMIN (Ministry Only) ============

// Get org applications (Ministry)
export async function getOrgApplications(status) {
    let url = '/api/admin/org-applications';
    if (status) url += `?status=${status}`;
    const response = await api.get(url);
    return response;
}

// Approve org application (Ministry)
export async function approveOrgApplication(applicationId) {
    const response = await api.post(`/api/admin/org-applications/${applicationId}/approve`);
    return response;
}

// Reject org application (Ministry)
export async function rejectOrgApplication(applicationId, reason) {
    const response = await api.post(`/api/admin/org-applications/${applicationId}/reject`, {
        reason,
    });
    return response;
}

// Verify organization (Ministry - legacy)
export async function verifyOrg(orgId) {
    const response = await api.post(`/api/org/${orgId}/verify`);
    return response;
}

// Save encrypted doctor credential off-chain
export async function saveDoctorCredential(doctorAddress, credential, credentialHash) {
    const response = await api.post('/api/org/doctor-credential', {
        doctorAddress,
        credential,
        credentialHash
    });
    return response;
}

export const orgService = {
    applyOrg,
    getMyApplication,
    registerOrg,
    getMyOrg,
    getOrgMembers,
    addOrgMember,
    removeOrgMember,
    getAllOrgs,
    getOrgApplications,
    approveOrgApplication,
    rejectOrgApplication,
    verifyOrg,
    saveDoctorCredential,
};

