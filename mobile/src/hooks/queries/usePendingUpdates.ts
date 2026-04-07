import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import pendingUpdateService from '../../services/pendingUpdate.service';
import { pendingUpdateKeys, recordKeys } from './queryKeys';

/**
 * Patient: incoming pending updates (doctor proposed changes to my record).
 */
export function useIncomingPendingUpdates(enabled = true) {
    return useQuery({
        queryKey: pendingUpdateKeys.incoming(),
        queryFn: () => pendingUpdateService.getIncoming(),
        enabled,
    });
}

/**
 * Doctor: outgoing pending updates I created.
 */
export function useOutgoingPendingUpdates(enabled = true) {
    return useQuery({
        queryKey: pendingUpdateKeys.outgoing(),
        queryFn: () => pendingUpdateService.getOutgoing(),
        enabled,
    });
}

/**
 * Doctor: pending updates already approved by patient — ready to claim on-chain.
 */
export function useApprovedPendingUpdates(enabled = true) {
    return useQuery({
        queryKey: pendingUpdateKeys.approved(),
        queryFn: () => pendingUpdateService.getApproved(),
        enabled,
    });
}

/**
 * Patient: approve a pending update.
 */
export function useApprovePendingUpdate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => pendingUpdateService.approve(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: pendingUpdateKeys.incoming() });
        },
    });
}

/**
 * Patient: reject a pending update.
 */
export function useRejectPendingUpdate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => pendingUpdateService.reject(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: pendingUpdateKeys.incoming() });
        },
    });
}

/**
 * Doctor: claim approved update after on-chain transaction.
 * Invalidates outgoing list + records (new record was added on-chain).
 */
export function useClaimPendingUpdate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            id,
            cidHash,
            txHash,
            cid,
            aesKey,
            encryptedPayloadForPatient,
            senderPublicKey,
        }: {
            id: string;
            cidHash: string;
            txHash: string;
            cid: string;
            aesKey: string;
            encryptedPayloadForPatient?: string | null;
            senderPublicKey?: string | null;
        }) => pendingUpdateService.claim(id, cidHash, txHash, cid, aesKey, encryptedPayloadForPatient, senderPublicKey),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: pendingUpdateKeys.outgoing() });
            queryClient.invalidateQueries({ queryKey: pendingUpdateKeys.approved() });
            queryClient.invalidateQueries({ queryKey: recordKeys.all });
        },
    });
}
