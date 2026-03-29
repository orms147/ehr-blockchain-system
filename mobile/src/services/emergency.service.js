import api from './api';

export const emergencyService = {
    // Request emergency access to a patient's records
    async requestEmergencyAccess(patientAddress, reason, options = {}) {
        return api.post('/api/emergency/request', {
            patientAddress,
            reason,
            cidHash: options.cidHash,
            emergencyType: options.emergencyType || 'medical',
            location: options.location,
            durationHours: options.durationHours || 24,
        });
    },

    // Get my active emergency accesses
    async getActiveEmergencies() {
        return api.get('/api/emergency/active');
    },

    // Get emergency accesses related to a patient
    async getPatientEmergencies(patientAddress) {
        return api.get(`/api/emergency/patient/${patientAddress}`);
    },

    // Revoke emergency access
    async revokeEmergency(emergencyId) {
        return api.post(`/api/emergency/revoke/${emergencyId}`);
    },

    // Check if current doctor has emergency access to patient
    async checkEmergencyAccess(patientAddress) {
        return api.get(`/api/emergency/check/${patientAddress}`);
    },
};

export default emergencyService;
