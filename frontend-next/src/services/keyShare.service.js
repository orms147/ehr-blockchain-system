// Key Share Service - manages encrypted key sharing between users
import api from './api';

export const keyShareService = {
    // Share encrypted key with recipient
    async shareKey(cidHash, recipientAddress, encryptedPayload, expiresAt = null) {
        return api.post('/api/key-share', {
            cidHash,
            recipientAddress,
            encryptedPayload,
            expiresAt,
        });
    },

    // Get keys shared with me
    async getReceivedKeys() {
        return api.get('/api/key-share/my');
    },

    // Get keys I've shared
    async getSentKeys() {
        return api.get('/api/key-share/sent');
    },

    // Claim a key share
    async claimKey(keyShareId) {
        return api.post(`/api/key-share/${keyShareId}/claim`);
    },

    // Revoke a key share
    async revokeKey(keyShareId) {
        return api.delete(`/api/key-share/${keyShareId}`);
    },
};

export default keyShareService;
