import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import requestService from '../../services/request.service';
import { requestKeys, recordKeys } from './queryKeys';

/**
 * Patient: incoming access requests from doctors.
 */
export function useIncomingRequests(enabled = true) {
    return useQuery({
        queryKey: requestKeys.incoming(),
        queryFn: () => requestService.getIncomingRequests(),
        enabled,
    });
}

/**
 * Doctor: requests that have been signed by patient — ready for on-chain claim.
 */
export function useSignedRequests(enabled = true) {
    return useQuery({
        queryKey: requestKeys.signed(),
        queryFn: () => requestService.getSignedRequests(),
        enabled,
    });
}

/**
 * Detail of a single request.
 */
export function useRequestDetails(requestId: string | number | undefined) {
    return useQuery({
        queryKey: requestKeys.detail(requestId ?? ''),
        queryFn: () => requestService.getRequestDetails(requestId!),
        enabled: requestId !== undefined && requestId !== null,
    });
}

/**
 * Doctor: mark request as claimed after on-chain transaction succeeded.
 * Invalidates signed list + my-records (new shared record appears).
 */
export function useMarkRequestClaimed() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ requestId, claimTxHash }: { requestId: string | number; claimTxHash: string }) =>
            requestService.markClaimed(requestId, claimTxHash),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: requestKeys.signed() });
            queryClient.invalidateQueries({ queryKey: recordKeys.all });
        },
    });
}

/**
 * Patient: archive a request (hide locally, no on-chain reject).
 */
export function useArchiveRequest() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (requestId: string | number) => requestService.archiveRequest(requestId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: requestKeys.incoming() });
        },
    });
}
