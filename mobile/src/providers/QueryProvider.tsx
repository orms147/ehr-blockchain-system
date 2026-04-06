import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';

/**
 * Wrap the app tree so any component can use `useQuery` / `useMutation`.
 * Single shared QueryClient — see ../lib/queryClient.ts for tuning.
 */
export default function QueryProvider({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
