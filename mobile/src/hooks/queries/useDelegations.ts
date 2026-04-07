import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import delegationService from '../../services/delegation.service';
import { delegationKeys } from './queryKeys';

export type DelegationRow = {
    id: string;
    patientAddress: string;
    delegateeAddress: string;
    parentDelegator: string | null;
    chainDepth: number;
    epoch: string;
    allowSubDelegate: boolean;
    expiresAt: string;
    scopeNote: string | null;
    grantTxHash: string | null;
    grantBlockNumber: string | null;
    grantedAt: string;
    status: string;
    revokedTxHash: string | null;
    revokedAt: string | null;
    revokedBy: string | null;
};

export type DelegationAccessLogRow = {
    id: string;
    patientAddress: string;
    newGrantee: string;
    byDelegatee: string;
    rootCidHash: string;
    txHash: string;
    blockNumber: string;
    createdAt: string;
};

/**
 * Patient: list of delegations I (as patient) have issued.
 */
export function useMyDelegates(enabled = true) {
    return useQuery<DelegationRow[]>({
        queryKey: delegationKeys.myDelegates(),
        queryFn: async () => {
            const data = await delegationService.getMyDelegates();
            return data?.delegations || [];
        },
        enabled,
    });
}

/**
 * Delegate (doctor): list of patients who have delegated authority to me.
 * Includes both direct delegations (chainDepth=1) and sub-delegations where I'm downstream.
 */
export function useDelegatedToMe(enabled = true) {
    return useQuery<DelegationRow[]>({
        queryKey: delegationKeys.delegatedToMe(),
        queryFn: async () => {
            const data = await delegationService.getDelegatedToMe();
            return data?.delegations || [];
        },
        enabled,
    });
}

/**
 * Patient: grant a new root authority (signs DelegationPermit + backend relay).
 */
export function useGrantAuthority() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (params: {
            delegateeAddress: string;
            durationDays: number;
            allowSubDelegate?: boolean;
            scopeNote?: string | null;
        }) => delegationService.grantAuthority(params),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: delegationKeys.all });
        },
    });
}

/**
 * Patient: revoke a root delegation. Calls revokeDelegation() directly via the
 * patient's wallet (no sponsor variant exists in the contract).
 */
export function useRevokeAuthority() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (delegateeAddress: string) => delegationService.revokeAuthority(delegateeAddress),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: delegationKeys.all });
        },
    });
}

/**
 * Doctor: sub-delegate to another doctor (requires allowSubDelegate=true on my delegation).
 */
export function useSubDelegate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (params: {
            patientAddress: string;
            subDelegatee: string;
            durationDays: number;
            allowFurther?: boolean;
        }) => delegationService.subDelegate(params),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: delegationKeys.all });
        },
    });
}

/**
 * Doctor: revoke a sub-delegation I created.
 */
export function useRevokeSubDelegation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (params: { patientAddress: string; subDelegatee: string }) =>
            delegationService.revokeSubDelegation(params.patientAddress, params.subDelegatee),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: delegationKeys.all });
        },
    });
}

/**
 * Delegation audit trail (AccessGrantedViaDelegation events).
 * role='patient' shows grants ON my records; role='delegatee' shows grants I issued.
 */
export function useDelegationAccessLogs(role: 'patient' | 'delegatee' = 'patient', enabled = true) {
    return useQuery<DelegationAccessLogRow[]>({
        queryKey: [...delegationKeys.all, 'logs', role],
        queryFn: async () => {
            const data = await delegationService.getDelegationAccessLogs(role);
            return data?.logs || [];
        },
        enabled,
    });
}
