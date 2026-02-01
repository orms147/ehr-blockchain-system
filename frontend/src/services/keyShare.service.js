// Key Share Service - manages encrypted key sharing between users
import api from './api';

export const keyShareService = {
    // Share encrypted key with recipient
    async shareKey({ cidHash, recipientAddress, encryptedPayload, senderPublicKey, expiresAt = null, allowDelegate = false }) {
        return api.post('/api/key-share', {
            cidHash,
            recipientAddress,
            encryptedPayload,
            senderPublicKey,
            expiresAt,
            allowDelegate, // NEW: For RecordDelegation
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

    // NEW: Get records I can re-share (RecordDelegation)
    async getDelegatableRecords() {
        return api.get('/api/key-share/delegatable');
    },

    // Claim a key share
    async claimKey(keyShareId) {
        return api.post(`/api/key-share/${keyShareId}/claim`);
    },

    // Revoke a key share (sender only)
    async revokeKey(keyShareId) {
        return api.delete(`/api/key-share/${keyShareId}`);
    },

    // Reject a key share (recipient only)
    async rejectKey(keyShareId) {
        return api.post(`/api/key-share/${keyShareId}/reject`);
    },

    // Get key shared for a specific record (by cidHash)
    async getKeyForRecord(cidHash) {
        return api.get(`/api/key-share/record/${cidHash}?t=${Date.now()}`);
    },

    // NEW: Get all recipients of a record (Care Team)
    async getRecordRecipients(cidHash) {
        return api.get(`/api/key-share/recipients/${cidHash}`);
    },
};

export default keyShareService;
