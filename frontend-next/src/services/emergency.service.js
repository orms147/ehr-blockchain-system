// Emergency Service - Frontend client for emergency access
import { api } from './api';

// Request emergency access
export async function requestEmergencyAccess(data) {
    const response = await api.post('/api/emergency/request', data);
    return response;
}

// Get active emergency accesses (for doctor)
export async function getActiveEmergencyAccesses() {
    const response = await api.get('/api/emergency/active');
    return response;
}

// Get emergency accesses for a patient
export async function getPatientEmergencyAccesses(patientAddress) {
    const response = await api.get(`/api/emergency/patient/${patientAddress}`);
    return response;
}

// Revoke emergency access
export async function revokeEmergencyAccess(id) {
    const response = await api.post(`/api/emergency/revoke/${id}`);
    return response;
}

// Check if doctor has emergency access
export async function checkEmergencyAccess(patientAddress) {
    const response = await api.get(`/api/emergency/check/${patientAddress}`);
    return response;
}

export const emergencyService = {
    requestEmergencyAccess,
    getActiveEmergencyAccesses,
    getPatientEmergencyAccesses,
    revokeEmergencyAccess,
    checkEmergencyAccess,
};
