import { useState, useEffect, useCallback } from 'react';
import requestService from '../services/request.service';
import useAuthStore from '../store/authStore';

/**
 * Shared hook to fetch incoming access requests for the patient.
 */
export default function useRequests() {
    const { token } = useAuthStore();
    const [requests, setRequests] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchRequests = useCallback(async () => {
        try {
            const data = await requestService.getIncomingRequests();
            setRequests(Array.isArray(data) ? data : (data?.requests || []));
        } catch (err) {
            console.error('Failed to fetch requests:', err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (token) {
            fetchRequests();
        } else {
            setIsLoading(false);
        }
    }, [token, fetchRequests]);

    const refresh = useCallback(() => {
        setIsRefreshing(true);
        fetchRequests();
    }, [fetchRequests]);

    return { requests, isLoading, isRefreshing, refresh };
}
