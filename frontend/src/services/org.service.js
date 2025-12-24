// Organization Service - Frontend client for hospital/clinic management
import { api } from './api';

// Register organization
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

// Verify organization (Ministry only)
export async function verifyOrg(orgId) {
    const response = await api.post(`/api/org/${orgId}/verify`);
    return response;
}

export const orgService = {
    registerOrg,
    getMyOrg,
    getOrgMembers,
    addOrgMember,
    removeOrgMember,
    getAllOrgs,
    verifyOrg,
};
