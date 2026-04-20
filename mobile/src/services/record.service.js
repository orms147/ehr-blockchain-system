import api from './api';

export const recordService = {
    // Create new record metadata
    async createRecord(cidHash, recordTypeHash = null, parentCidHash = null, title = null, description = null, recordType = null) {
        return api.post('/api/records', {
            cidHash,
            recordTypeHash,
            parentCidHash,
            title,
            description,
            recordType,
        });
    },

    // Save-only: doctor already submitted addRecordByDoctor on-chain; backend
    // just mirrors into RecordMetadata + creates KeyShare for doctor (and for
    // patient when `patientEncryptedPayload` is provided — the 2026-04-19
    // direct doctor-update flow).
    async saveOnly({
        cidHash,
        recordTypeHash = null,
        ownerAddress,              // patient (record owner)
        encryptedPayload = null,   // doctor's own copy (NaCl sealed for doctor OR plaintext self)
        senderPublicKey = null,
        title = null,
        description = null,
        recordType = null,
        parentCidHash = null,
        txHash = null,
        patientEncryptedPayload = null, // NaCl-sealed {cid,aesKey} for patient
    }) {
        return api.post('/api/records/save-only', {
            cidHash,
            recordTypeHash,
            ownerAddress,
            encryptedPayload,
            senderPublicKey,
            title,
            description,
            recordType,
            parentCidHash,
            txHash,
            patientEncryptedPayload,
        });
    },

    // Get my records
    async getMyRecords() {
        return api.get('/api/records/my');
    },

    // Get single record by cidHash
    async getRecord(cidHash) {
        return api.get(`/api/records/${cidHash}`);
    },

    // Alias for getRecord
    async getByHash(cidHash) {
        return this.getRecord(cidHash);
    },

    async getRecordChain(cidHash) {
        return api.get(`/api/records/chain/${cidHash}`);
    },

    async getChainCids(cidHash) {
        return api.get(`/api/records/chain-cids/${cidHash}`);
    },

    async getAccessList(cidHash) {
        return api.get(`/api/records/${cidHash}/access`);
    },

    async revokeAccess(cidHash, targetAddress) {
        return api.delete(`/api/records/${cidHash}/access/${targetAddress}`);
    },

    async getRecordAccess(cidHash) {
        return api.get(`/api/records/${cidHash}/access`);
    },

    // Doctor with active delegation: list records of a delegated patient.
    // Returns { delegation, records }.
    async getDelegatedPatientRecords(patientAddress) {
        return api.get(`/api/records/delegated/${patientAddress}`);
    },
};

export default recordService;
