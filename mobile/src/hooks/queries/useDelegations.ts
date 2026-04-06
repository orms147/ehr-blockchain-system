import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import delegationService from '../../services/delegation.service';
import { delegationKeys } from './queryKeys';

/**
 * Patient: list of delegates I've added.
 */
export function useMyDelegates(enabled = true) {
    return useQuery({
        queryKey: delegationKeys.myDelegates(),
        queryFn: async () => {
            const data = await delegationService.getMyDelegates();
            return data?.delegations || [];
        },
        enabled,
    });
}

/**
 * Delegate: list of patients who delegated to me.
 */
export function useDelegatedToMe(enabled = true) {
    return useQuery({
        queryKey: delegationKeys.delegatedToMe(),
        queryFn: async () => {
            const data = await delegationService.getDelegatedToMe();
            return data?.delegations || [];
        },
        enabled,
    });
}

/**
 * Patient: revoke a delegation by id.
 */
export function useRevokeDelegation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => delegationService.revokeDelegation(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: delegationKeys.myDelegates() });
        },
    });
}

/**
 * Patient: confirm on-chain delegation creation. Should be called AFTER the
 * on-chain tx succeeds (wallet flow happens client-side).
 */
export function useConfirmOnChainDelegation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (params: { delegateAddress: string; txHash: string; onChainStatus?: string }) =>
            delegationService.confirmOnChainDelegation(params),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: delegationKeys.myDelegates() });
        },
    });
}
