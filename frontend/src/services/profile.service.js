import { api } from './api';

const profileService = {
    // Get my profile (auth required)
    async getMyProfile() {
        const response = await api.get('/api/profile/me');
        return response;
    },

    // Update my profile (auth required)
    async updateMyProfile(data) {
        const response = await api.put('/api/profile/me', data);
        return response;
    },

    // Get public profile by address (no auth)
    async getProfile(address) {
        const response = await api.get(`/api/profile/${address.toLowerCase()}`);
        return response;
    },

    // Update doctor-specific profile (auth required)
    async updateDoctorProfile(data) {
        const response = await api.put('/api/profile/doctor', data);
        return response;
    },

    // Get doctor profile by address (public)
    async getDoctorProfile(address) {
        const response = await api.get(`/api/profile/doctor/${address.toLowerCase()}`);
        return response;
    },

    // Batch lookup: get names for multiple addresses
    async batchLookup(addresses) {
        const response = await api.post('/api/profile/batch', { addresses });
        return response; // Returns { "0x...": { fullName, avatarUrl } }
    },
};

export default profileService;
