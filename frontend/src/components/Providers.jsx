// Providers - Web3Auth + React Query
import * as React from 'react';
import {
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import { Web3AuthProvider } from "@web3auth/modal/react";
import web3AuthContextConfig from "@/config/web3authContext";

const queryClient = new QueryClient();

export function Providers({ children }) {
    return (
        <QueryClientProvider client={queryClient}>
            <Web3AuthProvider config={web3AuthContextConfig}>
                {children}
            </Web3AuthProvider>
        </QueryClientProvider>
    );
}
