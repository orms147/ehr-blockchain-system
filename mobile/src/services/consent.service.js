import api from './api';

export async function getMyGrantedConsents() {
    return api.get('/api/key-share/sent');
}

export async function getMyReceivedConsents() {
    return api.get('/api/key-share/my');
}

export async function revokeConsent(consentOrAddress, cidHash) {
    // Preferred path: revoke by exact key-share id (off-chain lock + real-time update).
    if (consentOrAddress && typeof consentOrAddress === 'object' && consentOrAddress.id) {
        return api.delete(`/api/key-share/${consentOrAddress.id}`);
    }

    // Backward-compatible fallback to on-chain relayer revoke.
    return api.post('/api/relayer/revoke', {
        granteeAddress: consentOrAddress,
        cidHash,
    });
}

export async function checkConsent(patientAddress, granteeAddress, cidHash) {
    // No dedicated backend route currently; rely on relayer/key-share flows instead.
    return {
        supported: false,
        message: 'checkConsent endpoint is not available on current backend.',
        patientAddress,
        granteeAddress,
        cidHash,
    };
}

export const consentService = {
    getMyGrantedConsents,
    getMyReceivedConsents,
    revokeConsent,
    checkConsent,
};

export default consentService;
