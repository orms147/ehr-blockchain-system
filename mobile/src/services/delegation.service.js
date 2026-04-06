import api from './api';

/**
 * Patient delegation service.
 * Backend routes mounted under /api/delegation.
 *
 * Note: actual on-chain delegation creation happens via wallet/smart-contract.
 * Backend `/confirm-onchain` is called AFTER the on-chain tx succeeds to sync DB.
 */

export async function getMyDelegates() {
    return api.get('/api/delegation/my-delegates');
}

export async function getDelegatedToMe() {
    return api.get('/api/delegation/delegated-to-me');
}

export async function revokeDelegation(id) {
    return api.post(`/api/delegation/revoke/${id}`);
}

export async function checkDelegation(patientAddress) {
    return api.get(`/api/delegation/check/${patientAddress}`);
}

export async function confirmOnChainDelegation({ delegateAddress, txHash, onChainStatus = 'confirmed' }) {
    return api.post('/api/delegation/confirm-onchain', {
        delegateAddress,
        txHash,
        onChainStatus,
    });
}

export const delegationService = {
    getMyDelegates,
    getDelegatedToMe,
    revokeDelegation,
    checkDelegation,
    confirmOnChainDelegation,
};

export default delegationService;
