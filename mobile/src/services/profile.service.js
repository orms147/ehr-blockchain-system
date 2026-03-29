import api from './api';

const profileService = {
    // Get my profile 
    async getMyProfile() {
        const response = await api.get('/api/profile/me');
        return response;
    },

    // Update my profile
    async updateMyProfile(data) {
        const response = await api.put('/api/profile/me', data);
        return response;
    },

    // Get public profile by address
    async getProfile(address) {
        const response = await api.get(`/api/profile/${address.toLowerCase()}`);
        return response;
    },

    // Batch lookup
    async batchLookup(addresses) {
        const response = await api.post('/api/profile/batch', { addresses });
        return response; 
    },
};

export default profileService;
