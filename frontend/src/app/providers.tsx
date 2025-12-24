"use client";

import { Web3AuthProvider } from '@web3auth/modal/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import web3AuthContextConfig from '@/config/web3authContext';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());

    return (
        <QueryClientProvider client={queryClient}>
            <Web3AuthProvider config={web3AuthContextConfig}>
                {children}
            </Web3AuthProvider>
        </QueryClientProvider>
    );
}
