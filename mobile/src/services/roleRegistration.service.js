import api from './api';

export const roleRegistrationService = {
    async register(role) {
        return api.post('/api/relayer/register', { role });
    },
};

export default roleRegistrationService;