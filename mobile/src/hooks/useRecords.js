import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import recordService from '../services/record.service';
import localRecordRetryService from '../services/localRecordRetry.service';
import useAuthStore from '../store/authStore';

/**
 * Shared hook to fetch, transform, and cache patient records.
 * Includes local failed/pending drafts so users can keep working even when on-chain is unstable.
 */
export default function useRecords() {
    const { token } = useAuthStore();
    const [records, setRecords] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const transformRecords = (data) => {
        const transformedRecords = data.map((record, index) => {
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

    const fetchRecords = useCallback(async ({ refreshing = false } = {}) => {
        try {
            setError(null);
            if (refreshing) {
                setIsRefreshing(true);
            }

            // Auto-retry a few failed local drafts each refresh cycle.
            await localRecordRetryService.retryFailedLocalRecords({ limit: refreshing ? 8 : 3 });

            const [serverData, localDrafts] = await Promise.all([
                recordService.getMyRecords(),
                localRecordRetryService.getLocalDraftRecords(),
            ]);

            const latestServer = transformRecords(serverData);
            const merged = mergeServerAndLocal(latestServer, localDrafts);
            setRecords(merged);
        } catch (err) {
            console.warn('Failed to fetch records:', err?.message || err);

            const localDrafts = await localRecordRetryService.getLocalDraftRecords();
            if (localDrafts.length > 0) {
                setRecords(localDrafts.sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0)));
                setError(`${err?.message || 'Không thể tải hồ sơ'} (đang hiển thị bản local)`);
            } else {
                setError(err?.message || 'Không thể tải hồ sơ');
            }
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (token) {
            fetchRecords();
        } else {
            setIsLoading(false);
        }
    }, [token, fetchRecords]);

    useFocusEffect(
        useCallback(() => {
            if (token) {
                fetchRecords();
            }
        }, [token, fetchRecords])
    );

    const refresh = useCallback(() => {
        fetchRecords({ refreshing: true });
    }, [fetchRecords]);

    return { records, isLoading, isRefreshing, error, refresh };
}