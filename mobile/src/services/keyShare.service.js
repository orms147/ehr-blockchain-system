import api from './api';

export const keyShareService = {
    /**
     * @param {object} params
     * @param {string} params.cidHash
     * @param {string} params.recipientAddress
     * @param {string} params.encryptedPayload
     * @param {string} [params.senderPublicKey]
     * @param {string|null} [params.expiresAt]   ISO datetime string, or null for no expiry
     * @param {boolean} [params.allowDelegate]
     * @param {boolean} [params.includeUpdates]
     */
    async shareKey({ cidHash, recipientAddress, encryptedPayload, senderPublicKey, expiresAt = null, allowDelegate = false, includeUpdates = true }) {
        return api.post('/api/key-share', {
            cidHash,
            recipientAddress,
            encryptedPayload,
            senderPublicKey,
            expiresAt,
            allowDelegate,
            includeUpdates,
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
