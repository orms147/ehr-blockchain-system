import { useQuery } from '@tanstack/react-query';
import requestService from '../services/request.service';
import useAuthStore from '../store/authStore';
import { requestKeys } from './queries/queryKeys';

/**
 * Patient incoming access requests.
 * Backed by TanStack Query — auto-cached, dedup'd across consumers.
 * Public API kept stable: { requests, isLoading, isRefreshing, refresh }.
 */
export default function useRequests() {
    const { token } = useAuthStore();

    const query = useQuery({
        queryKey: requestKeys.incoming(),
        queryFn: async () => {
            const data = await requestService.getIncomingRequests();
            return Array.isArray(data) ? data : (data?.requests || []);
        },
        enabled: !!token,
    });

    return {
        requests: query.data || [],
        isLoading: query.isLoading,
        isRefreshing: query.isFetching && !query.isLoading,
        refresh: () => query.refetch(),
    };
}
