"use client";

import { useState, useEffect } from 'react';
import { useWeb3Auth } from '@web3auth/modal/react';

/**
 * Custom hook to get wallet address from Web3Auth provider
 * Gets address using eth_accounts RPC call, which works regardless of chain
 */
export function useWalletAddress() {
    const web3Auth = useWeb3Auth();
    const [address, setAddress] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const getAddress = async () => {
            // Debug: check full web3Auth state including init status
            // If Web3Auth is still initializing, keep waiting
            if (web3Auth?.status === 'not_ready' || web3Auth?.status === 'connecting') {
                return; // Don't set loading=false, wait for status change
            }

            if (!web3Auth?.isConnected || !web3Auth?.provider) {
                setAddress(null);
                setLoading(false);
                return;
            }

            try {
                // Use eth_accounts directly - works regardless of chain
                const accounts = await web3Auth.provider.request({
                    method: 'eth_accounts',
                });

                if (accounts && accounts.length > 0) {
                    setAddress(accounts[0]);
                } else {
                    setAddress(null);
                }
            } catch (err) {
                console.error('Error getting wallet address:', err);
                setAddress(null);
            } finally {
                setLoading(false);
            }
        };

        getAddress();
    }, [web3Auth?.isConnected, web3Auth?.provider, web3Auth?.status]);

    return {
        address,
        loading,
        isConnected: web3Auth?.isConnected,
        provider: web3Auth?.provider,
    };
}

export default useWalletAddress;
