// Authentication Service - connects to backend auth APIs
import api from './api';

export const authService = {
    // Get nonce for wallet signature
    async getNonce(walletAddress) {
        return api.get(`/api/auth/nonce/${walletAddress}`);
    },

    // Login with wallet signature
    async login(walletAddress, message, signature) {
        const response = await api.post('/api/auth/login', {
            walletAddress,
            message,
            signature,
        });

        if (response.token) {
            api.setToken(response.token);
        }

        return response;
    },

    // Register public key for encryption
    async registerPublicKey(publicKey) {
        return api.post('/api/auth/register-pubkey', { publicKey });
    },

    // Get current user info
    async getMe() {
        return api.get('/api/auth/me');
    },

    // Get another user's public key
    async getPublicKey(walletAddress) {
        return api.get(`/api/auth/pubkey/${walletAddress}`);
    },

    // Get another user's encryption public key
    async getEncryptionKey(walletAddress) {
        return api.get(`/api/auth/encryption-key/${walletAddress}`);
    },

    // Logout
    logout() {
        api.clearToken();
    },

    // Check if logged in
    isLoggedIn() {
        return !!api.getToken();
    },
};

export default authService;
