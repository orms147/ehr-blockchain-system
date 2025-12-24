// Relayer Service - Frontend client for gas sponsorship API
import { api } from './api';

// Get current quota status
export async function getQuotaStatus() {
    const response = await api.get('/api/relayer/quota');
    return response;
}

// Request sponsored registration (patient/doctor)
export async function sponsoredRegister(role) {
    const response = await api.post('/api/relayer/register', { role });
    return response;
}

// Archive a request (hide from UI without on-chain reject)
export async function archiveRequest(requestId) {
    const response = await api.post('/api/relayer/archive-request', { requestId });
    return response;
}

// Get list of archived requests
export async function getArchivedRequests() {
    const response = await api.get('/api/relayer/archived-requests');
    return response;
}

// Restore an archived request
export async function restoreRequest(requestId) {
    const response = await api.post('/api/relayer/restore-request', { requestId });
    return response;
}

// Revoke consent (sponsored by relayer, quota limited)
export async function revokeConsent(granteeAddress, cidHash) {
    const response = await api.post('/api/relayer/revoke', { granteeAddress, cidHash });
    return response;
}

// Grant consent on-chain (sponsored by relayer, requires EIP-712 signature)
export async function grantConsent({
    granteeAddress,
    cidHash,
    encKeyHash,
    expireAt,
    includeUpdates = false,
    allowDelegate = false,
    deadline,
    signature,
}) {
    const response = await api.post('/api/relayer/grant', {
        granteeAddress,
        cidHash,
        encKeyHash,
        expireAt,
        includeUpdates,
        allowDelegate,
        deadline,
        signature,
    });
    return response;
}

export const relayerService = {
    getQuotaStatus,
    sponsoredRegister,
    archiveRequest,
    getArchivedRequests,
    restoreRequest,
    revokeConsent,
    grantConsent,
};
