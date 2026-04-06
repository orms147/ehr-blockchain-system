import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import recordService from '../services/record.service';
import localRecordRetryService from '../services/localRecordRetry.service';
import useAuthStore from '../store/authStore';
import { recordKeys } from './queries/queryKeys';

/**
 * Patient records hook — backed by TanStack Query.
 * Preserves prior public API: { records, isLoading, isRefreshing, error, refresh }.
 * Adds: server-fetch dedup across screens, automatic background refresh on focus.
 */

const transformRecords = (data) => {
    const transformedRecords = (data || []).map((record, index) => {
        const recordType = record.recordType || 'Record';
        const isCreatedBySelf = record.createdBy?.toLowerCase() === record.ownerAddress?.toLowerCase();

        const createdAtSource = record.createdAt || record.confirmedAt || record.submittedAt || Date.now();
        const createdAtDate = new Date(createdAtSource);
        const createdAtTs = Number.isNaN(createdAtDate.getTime()) ? Date.now() : createdAtDate.getTime();
        const createdAtIso = new Date(createdAtTs).toISOString();

        return {
            id: record.id || index + 1,
            cidHash: record.cidHash,
            parentCidHash: record.parentCidHash || null,
            type: recordType,
            title: record.title || `${recordType} #${record.id || index + 1}`,
            description: record.description || null,
            date: new Date(createdAtTs).toLocaleDateString('vi-VN'),
            createdAt: createdAtIso,
            createdAtTs,
            createdBy: record.createdBy,
            createdByDisplay: isCreatedBySelf
                ? 'Bạn'
                : `BS. ${(record.createdBy || '').substring(0, 6)}...`,
            isCreatedByDoctor: !isCreatedBySelf,
            ownerAddress: record.ownerAddress,
            syncStatus: record.syncStatus || 'confirmed',
            syncError: record.syncError || null,
            isLocalDraft: false,
        };
    });

    const parentCidHashes = new Set(
        transformedRecords.map((r) => r.parentCidHash).filter(Boolean)
    );
    const latestRecords = transformedRecords.filter(
        (r) => !parentCidHashes.has(r.cidHash)
    );

    latestRecords.sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));
    return latestRecords;
};

const mergeServerAndLocal = (serverRecords, localDrafts) => {
    const merged = [...(serverRecords || [])];
    const existingCid = new Set(merged.map((item) => item.cidHash));

    for (const localRecord of localDrafts || []) {
        if (!existingCid.has(localRecord.cidHash)) {
            merged.push(localRecord);
        }
    }

    merged.sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));
    return merged;
};

export default function useRecords() {
    const { token } = useAuthStore();

    const query = useQuery({
        queryKey: recordKeys.myList(),
        queryFn: async () => {
            // Auto-retry a few failed local drafts each fetch cycle.
            await localRecordRetryService.retryFailedLocalRecords({ limit: 3 });

            try {
                const [serverData, localDrafts] = await Promise.all([
                    recordService.getMyRecords(),
                    localRecordRetryService.getLocalDraftRecords(),
                ]);
                const latestServer = transformRecords(serverData);
                return {
                    records: mergeServerAndLocal(latestServer, localDrafts),
                    error: null,
                };
            } catch (err) {
                console.warn('Failed to fetch records:', err?.message || err);
                const localDrafts = await localRecordRetryService.getLocalDraftRecords();
                if (localDrafts.length > 0) {
                    return {
                        records: localDrafts.sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0)),
                        error: `${err?.message || 'Không thể tải hồ sơ'} (đang hiển thị bản local)`,
                    };
                }
                throw err;
            }
        },
        enabled: !!token,
    });

    // Refresh on screen focus (preserves previous behavior).
    useFocusEffect(
        useCallback(() => {
            if (token) {
                query.refetch();
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [token])
    );

    return {
        records: query.data?.records || [],
        isLoading: query.isLoading,
        isRefreshing: query.isFetching && !query.isLoading,
        error: query.data?.error || (query.error?.message ?? null),
        refresh: () => query.refetch(),
    };
}
