"use client";

import { useState, useEffect, useCallback } from 'react';
import { useWeb3Auth } from '@web3auth/modal/react';

/**
 * Custom hook to get wallet address from Web3Auth provider
 * Gets address using eth_accounts RPC call, which works regardless of chain
 */
export function useWalletAddress() {
    const web3Auth = useWeb3Auth();
    const [address, setAddress] = useState(null);
    const [loading, setLoading] = useState(true);

    const getAddress = useCallback(async () => {
        // Wait for Web3Auth to be ready
        if (!web3Auth || web3Auth?.status === 'not_ready') {
            return; // Keep loading=true, wait for init
        }

        // If connecting, also wait
        if (web3Auth?.status === 'connecting') {
            return; // Keep loading=true
        }

        // If not connected or no provider, set address to null
        if (!web3Auth?.isConnected || !web3Auth?.provider) {
            setAddress(null);
            setLoading(false);
            return;
        }

        // Connected - try to get address
        try {
            const accounts = await web3Auth.provider.request({
                method: 'eth_accounts',
            });

            if (accounts && accounts.length > 0) {
                setAddress(accounts[0]);
            } else {
                setAddress(null);
            }
        } catch (err) {
            console.error('[useWalletAddress] Error getting address:', err);
            setAddress(null);
        } finally {
            setLoading(false);
        }
    }, [web3Auth?.isConnected, web3Auth?.provider, web3Auth?.status]);

    useEffect(() => {
        getAddress();
    }, [getAddress]);

    // Also listen for status changes via interval for session restore edge cases
    useEffect(() => {
        if (web3Auth?.status === 'connected' && !address && !loading) {
            // Session just restored but we haven't got address yet
            getAddress();
        }
    }, [web3Auth?.status, address, loading, getAddress]);

    return {
        address,
        loading,
        isConnected: web3Auth?.isConnected,
        provider: web3Auth?.provider,
    };
}

export default useWalletAddress;

