import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import recordService from '../../services/record.service';
import { recordKeys } from './queryKeys';

/**
 * Patient: list of my records.
 * Auto-cached for 30s — switching screens won't re-fetch immediately.
 */
export function useMyRecords(enabled = true) {
    return useQuery({
        queryKey: recordKeys.myList(),
        queryFn: () => recordService.getMyRecords(),
        enabled,
    });
}

/**
 * Single record by cidHash. Detail screens.
 */
export function useRecord(cidHash: string | undefined) {
    return useQuery({
        queryKey: recordKeys.detail(cidHash || ''),
        queryFn: () => recordService.getRecord(cidHash!),
        enabled: !!cidHash,
    });
}

/**
 * Version chain (parent → children) for a record.
 */
export function useRecordChain(cidHash: string | undefined) {
    return useQuery({
        queryKey: recordKeys.chain(cidHash || ''),
        queryFn: () => recordService.getRecordChain(cidHash!),
        enabled: !!cidHash,
    });
}

/**
 * Access list (who has been granted access) for a record.
 */
export function useRecordAccess(cidHash: string | undefined) {
    return useQuery({
        queryKey: recordKeys.access(cidHash || ''),
        queryFn: () => recordService.getRecordAccess(cidHash!),
        enabled: !!cidHash,
    });
}

/**
 * Mutation: revoke access from a target address.
 * On success, invalidates the access list for that record.
 */
export function useRevokeAccess() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ cidHash, targetAddress }: { cidHash: string; targetAddress: string }) =>
            recordService.revokeAccess(cidHash, targetAddress),
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: recordKeys.access(vars.cidHash) });
        },
    });
}
