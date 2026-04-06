import { QueryClient } from '@tanstack/react-query';

/**
 * Global QueryClient instance for the EHR mobile app.
 *
 * Defaults are tuned for a mobile health-records app:
 * - staleTime 30s: most data (records, requests) doesn't change second-by-second
 *   so we avoid hammering the backend on every screen mount.
 * - gcTime 5min: keep cache around when user navigates away briefly.
 * - retry 1: one auto-retry on failure (network blips on mobile are common).
 * - refetchOnWindowFocus disabled: doesn't apply to RN, but explicit for clarity.
 * - refetchOnReconnect: refetch when network comes back online.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
        },
        mutations: {
            retry: 0,
        },
    },
});
