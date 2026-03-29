import api from './api';

export const keyShareService = {
    async shareKey({ cidHash, recipientAddress, encryptedPayload, senderPublicKey, expiresAt = null, allowDelegate = false }) {
        return api.post('/api/key-share', {
            cidHash,
            recipientAddress,
            encryptedPayload,
            senderPublicKey,
            expiresAt,
            allowDelegate, 
        });
    },

    async getReceivedKeys() {
        return api.get('/api/key-share/my');
    },

    async getSentKeys() {
        return api.get('/api/key-share/sent');
    },

    async getDelegatableRecords() {
        return api.get('/api/key-share/delegatable');
    },

    async claimKey(keyShareId) {
        return api.post(`/api/key-share/${keyShareId}/claim`);
    },

    async rejectKey(keyShareId) {
        return api.post(`/api/key-share/${keyShareId}/reject`);
    },

    async revokeKey(keyShareId) {
        return api.delete(`/api/key-share/${keyShareId}`);
    },

    async getKeyForRecord(cidHash) {
        return api.get(`/api/key-share/record/${cidHash}?t=${Date.now()}`);
    },

    async getRecordRecipients(cidHash) {
        return api.get(`/api/key-share/recipients/${cidHash}`);
    },
};

export default keyShareService;
