// Delegation Service - Frontend client for family delegation
import { api } from './api';

// Create delegation to family member
export async function createDelegation(delegateAddress, delegationType = 'full') {
    const response = await api.post('/api/delegation/create', {
        delegateAddress,
        delegationType,
    });
    return response;
}

// Get my delegates (as patient)
export async function getMyDelegates() {
    const response = await api.get('/api/delegation/my-delegates');
    return response;
}

// Get patients who delegated to me
export async function getDelegatedToMe() {
    const response = await api.get('/api/delegation/delegated-to-me');
    return response;
}

// Revoke delegation
export async function revokeDelegation(id) {
    const response = await api.post(`/api/delegation/revoke/${id}`);
    return response;
}

// Check if I have delegation for a patient
export async function checkDelegation(patientAddress) {
    const response = await api.get(`/api/delegation/check/${patientAddress}`);
    return response;
}

export const delegationService = {
    createDelegation,
    getMyDelegates,
    getDelegatedToMe,
    revokeDelegation,
    checkDelegation,
};
