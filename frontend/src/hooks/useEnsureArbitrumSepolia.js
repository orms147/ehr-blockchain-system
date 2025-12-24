"use client";

/**
 * Hook to ensure wallet is on Arbitrum Sepolia before contract calls
 * Uses provider-based chain switching for reliability
 */

import { useWeb3Auth } from '@web3auth/modal/react';
import { useCallback, useState } from 'react';

// Read from environment variables for flexibility
const TARGET_CHAIN = {
    chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '421614', 10),
    chainIdHex: '0x' + parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '421614', 10).toString(16),
    chainName: process.env.NEXT_PUBLIC_CHAIN_NAME || 'Arbitrum Sepolia',
    rpcTarget: process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
    blockExplorer: process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL || 'https://sepolia.arbiscan.io',
    ticker: 'ETH',
    tickerName: 'Ethereum',
    decimals: 18,
};

export function useEnsureArbitrumSepolia() {
    const { web3Auth, isConnected } = useWeb3Auth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const ensureChain = useCallback(async () => {
        if (!isConnected || !web3Auth || !web3Auth.provider) {
            throw new Error('Wallet not connected');
        }

        const provider = web3Auth.provider;
        setLoading(true);
        setError(null);

        try {
            // Get current chain ID
            const currentChainId = await provider.request({
                method: "eth_chainId"
            });

            console.log('🔗 Current chain:', currentChainId, 'Target:', TARGET_CHAIN.chainIdHex);

            // If already on correct chain, no need to switch
            if (currentChainId === TARGET_CHAIN.chainIdHex) {
                console.log('✅ Already on correct chain');
                setLoading(false);
                return true;
            }

            // Try to switch using wallet_switchEthereumChain (provider-based)
            console.log('🔄 Switching chain...');
            try {
                await provider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: TARGET_CHAIN.chainIdHex }],
                });
            } catch (switchError) {
                // Error code 4902 means chain doesn't exist, need to add it
                if (switchError.code === 4902 || switchError.message?.includes('chain')) {
                    console.log('➕ Chain not found, adding...');
                    try {
                        await provider.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: TARGET_CHAIN.chainIdHex,
                                chainName: TARGET_CHAIN.chainName,
                                nativeCurrency: {
                                    name: TARGET_CHAIN.ticker,
                                    symbol: TARGET_CHAIN.ticker,
                                    decimals: TARGET_CHAIN.decimals,
                                },
                                rpcUrls: [TARGET_CHAIN.rpcTarget],
                                blockExplorerUrls: [TARGET_CHAIN.blockExplorer],
                            }],
                        });
                    } catch (addError) {
                        console.error('Failed to add chain:', addError);
                        setLoading(false);
                        throw new Error(`Không thể thêm mạng ${TARGET_CHAIN.chainName}. Vui lòng thêm thủ công.`);
                    }
                } else {
                    console.warn('Chain switch warning:', switchError.message);
                }
            }

            // Wait for chain switch to complete with polling
            const maxWaitMs = 8000;
            const pollIntervalMs = 300;
            const startTime = Date.now();

            while (Date.now() - startTime < maxWaitMs) {
                const newChainId = await provider.request({ method: 'eth_chainId' });
                if (newChainId === TARGET_CHAIN.chainIdHex) {
                    console.log('✅ Chain switch complete, stabilizing...');
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for wallet to stabilize
                    setLoading(false);
                    return true;
                }
                await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
            }

            // Timeout
            setLoading(false);
            throw new Error(`Không thể chuyển sang mạng ${TARGET_CHAIN.chainName}. Vui lòng logout và login lại.`);

        } catch (err) {
            console.error('Ensure chain error:', err);
            setError(err);
            setLoading(false);
            throw err;
        }
    }, [web3Auth, isConnected]);

    return {
        ensureChain,
        loading,
        error,
        ARBITRUM_SEPOLIA_CHAIN_ID: TARGET_CHAIN.chainIdHex,
    };
}

export default useEnsureArbitrumSepolia;
