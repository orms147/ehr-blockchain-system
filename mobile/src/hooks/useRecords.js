import { useState, useEffect, useCallback } from 'react';
import recordService from '../services/record.service';
import useAuthStore from '../store/authStore';

/**
 * Shared hook to fetch, transform, and cache patient records.
 * Used by both DashboardScreen (recent 3) and RecordsScreen (full list).
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
            return {
                id: record.id || index + 1,
                cidHash: record.cidHash,
                parentCidHash: record.parentCidHash || null,
                type: recordType,
                title: record.title || `${recordType} #${record.id || index + 1}`,
                description: record.description || null,
                date: new Date(record.createdAt).toLocaleDateString('vi-VN'),
                createdAt: new Date(record.createdAt),
                createdBy: record.createdBy,
                createdByDisplay: isCreatedBySelf
                    ? 'Bạn'
                    : `BS. ${(record.createdBy || '').substring(0, 6)}...`,
                isCreatedByDoctor: !isCreatedBySelf,
                ownerAddress: record.ownerAddress,
            };
        });

        // Filter to show only latest versions (records not superseded by children)
        const parentCidHashes = new Set(
            transformedRecords.map((r) => r.parentCidHash).filter(Boolean)
        );
        const latestRecords = transformedRecords.filter(
            (r) => !parentCidHashes.has(r.cidHash)
        );

        // Sort by newest first
        latestRecords.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return latestRecords;
    };

    const fetchRecords = useCallback(async () => {
        try {
            setError(null);
            const data = await recordService.getMyRecords();
            const latest = transformRecords(data);
            setRecords(latest);
        } catch (err) {
            console.error('Failed to fetch records:', err);
            setError(err.message || 'Không thể tải hồ sơ');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (token) {
            fetchRecords();
        } else {
            setIsLoading(false);
        }
    }, [token, fetchRecords]);

    const refresh = useCallback(() => {
        setIsRefreshing(true);
        fetchRecords();
    }, [fetchRecords]);

    return { records, isLoading, isRefreshing, error, refresh };
}
