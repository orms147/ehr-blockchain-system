"use client";

import { Web3AuthProvider } from '@web3auth/modal/react';
import web3AuthContextConfig from '../config/web3authContext';

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <Web3AuthProvider config={web3AuthContextConfig}>
            {children}
        </Web3AuthProvider>
    );
}
