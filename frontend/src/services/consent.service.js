// Consent Service - Frontend client for consent management
import { api } from './api';

// ConsentLedger contract ABI (matching official contract)
export const CONSENT_LEDGER_ABI = [
    // Note: there's no direct grantConsent - use grantBySig for gasless or grantInternal from authorized contracts
    'function grantBySig(address patient, address grantee, bytes32 rootCidHash, bytes32 encKeyHash, uint40 expireAt, bool includeUpdates, bool allowDelegate, uint256 deadline, bytes signature) external',
    'function revoke(address grantee, bytes32 rootCidHash) external',
    'function canAccess(address patient, address grantee, bytes32 cidHash) external view returns (bool)',
    'function getConsent(address patient, address grantee, bytes32 rootCidHash) external view returns (tuple(address patient, address grantee, bytes32 rootCidHash, bytes32 encKeyHash, uint40 issuedAt, uint40 expireAt, bool active, bool includeUpdates, bool allowDelegate))',
    'function grantDelegation(address delegatee, uint40 duration, bool allowSubDelegate) external',
    'function revokeDelegation(address delegatee) external',
    'event ConsentGranted(address indexed patient, address indexed grantee, bytes32 indexed rootCidHash, uint40 expireAt, bool allowDelegate)',
    'event ConsentRevoked(address indexed patient, address indexed grantee, bytes32 indexed rootCidHash, uint40 timestamp)',
];

// Get all active consents granted by current user
export async function getMyGrantedConsents() {
    const response = await api.get('/api/consents/granted');
    return response;
}

// Get all consents received by current user (as grantee)
export async function getMyReceivedConsents() {
    const response = await api.get('/api/consents/received');
    return response;
}

// Revoke a consent (sponsored by relayer)
export async function revokeConsent(granteeAddress, cidHash) {
    const response = await api.post('/api/relayer/revoke', {
        granteeAddress,
        cidHash,
    });
    return response;
}

// Check if consent is still active
export async function checkConsent(patientAddress, granteeAddress, cidHash) {
    const response = await api.get('/api/consents/check', {
        params: { patientAddress, granteeAddress, cidHash }
    });
    return response;
}

export const consentService = {
    getMyGrantedConsents,
    getMyReceivedConsents,
    revokeConsent,
    checkConsent,
};
