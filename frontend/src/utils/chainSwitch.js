/**
 * Chain switching utility for ensuring wallet is on correct network
 * Reads chain config from environment variables for easy deployment switching
 */

// Target chain config from environment variables
const TARGET_CHAIN = {
    chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '421614', 10),
    chainIdHex: '0x' + parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '421614', 10).toString(16),
    chainName: process.env.NEXT_PUBLIC_CHAIN_NAME || 'Arbitrum Sepolia',
    nativeCurrency: {
        name: process.env.NEXT_PUBLIC_NATIVE_CURRENCY_NAME || 'ETH',
        symbol: process.env.NEXT_PUBLIC_NATIVE_CURRENCY_SYMBOL || 'ETH',
        decimals: parseInt(process.env.NEXT_PUBLIC_NATIVE_CURRENCY_DECIMALS || '18', 10),
    },
    rpcUrls: [process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'],
    blockExplorerUrls: [process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL || 'https://sepolia.arbiscan.io'],
};

// Export for use in other files
export { TARGET_CHAIN };

/**
 * Ensures the wallet is connected to the target chain (from env config)
 * @param {object} provider - Web3Auth provider
 * @returns {Promise<boolean>} - true if successfully on correct chain
 * @throws {Error} - if chain switch fails or times out
 */
export async function ensureCorrectChain(provider) {
    if (!provider) {
        throw new Error('No provider available');
    }

    // Helper to get current chain ID
    const getCurrentChainId = async () => {
        const chainId = await provider.request({ method: 'eth_chainId' });
        return chainId;
    };

    // Check if already on correct chain
    const currentChainId = await getCurrentChainId();
    if (currentChainId === TARGET_CHAIN.chainIdHex) {
        return true; // Already on correct chain
    }
    try {
        // Try to switch to target chain
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: TARGET_CHAIN.chainIdHex }],
        });
    } catch (switchError) {
        // Error code 4902 means chain doesn't exist, need to add it
        if (switchError.code === 4902 || switchError.message?.includes('chain')) {
            try {
                await provider.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: TARGET_CHAIN.chainIdHex,
                        chainName: TARGET_CHAIN.chainName,
                        nativeCurrency: TARGET_CHAIN.nativeCurrency,
                        rpcUrls: TARGET_CHAIN.rpcUrls,
                        blockExplorerUrls: TARGET_CHAIN.blockExplorerUrls,
                    }],
                });
            } catch (addError) {
                console.error('Failed to add chain:', addError);
                throw new Error(`Không thể thêm mạng ${TARGET_CHAIN.chainName}. Vui lòng thêm thủ công trong ví.`);
            }
        } else {
            // Log and continue - switch might still work
            console.warn('Chain switch warning:', switchError.message);
        }
    }

    // Wait for chain switch to complete with longer timeout and better polling
    const maxWaitMs = 10000; // Increased to 10 seconds
    const pollIntervalMs = 300;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        const newChainId = await getCurrentChainId();
        if (newChainId === TARGET_CHAIN.chainIdHex) {
            // CRITICAL: Wait longer for wallet to fully stabilize after chain switch
            // Web3Auth/MetaMask internal state takes time to sync
            await new Promise(resolve => setTimeout(resolve, 1500)); // Increased to 1.5 seconds

            // Double-check chain is still correct after delay
            const verifyChainId = await getCurrentChainId();
            if (verifyChainId === TARGET_CHAIN.chainIdHex) {
                return true;
            }
        }
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    // Timeout - chain switch failed
    const finalChainId = await getCurrentChainId();
    if (finalChainId !== TARGET_CHAIN.chainIdHex) {
        throw new Error(
            `Không thể chuyển sang mạng ${TARGET_CHAIN.chainName}. ` +
            `Vui lòng logout và login lại, hoặc chuyển mạng thủ công trong ví.`
        );
    }

    return true;
}

// Backward compatibility alias
export const ensureArbitrumSepolia = ensureCorrectChain;

export default ensureCorrectChain;
