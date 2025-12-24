// Web3Auth configuration for React Hooks API
import { WEB3AUTH_NETWORK, type Web3AuthOptions } from '@web3auth/modal';
import type { Web3AuthContextConfig } from '@web3auth/modal/react';

const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ||
    'BLcTr1Sfd1hpObhsaNjMbayzx5C5GZR31lUHuk9W9ijGCrVHueKwy-XsBilxn30SPUckJxJvoCllWz6-h_Ox0Ks';

// Arbitrum Sepolia chain configuration
const arbitrumSepoliaConfig = {
    chainNamespace: 'eip155' as const,
    chainId: '0x66eee', // 421614 in hex
    rpcTarget: 'https://sepolia-rollup.arbitrum.io/rpc',
    displayName: 'Arbitrum Sepolia',
    blockExplorerUrl: 'https://sepolia.arbiscan.io',
    ticker: 'ETH',
    tickerName: 'Ethereum',
    logo: 'https://arbiscan.io/images/svg/brands/arbitrum.svg',
};

// Sepolia chain configuration (for switching from)
const sepoliaConfig = {
    chainNamespace: 'eip155' as const,
    chainId: '0xaa36a7', // 11155111 in hex
    rpcTarget: 'https://rpc.sepolia.org',
    displayName: 'Sepolia',
    blockExplorerUrl: 'https://sepolia.etherscan.io',
    ticker: 'ETH',
    tickerName: 'Ethereum',
    logo: 'https://etherscan.io/images/svg/brands/ethereum-original.svg',
};

// Web3Auth options - using type assertion for chain configs
// Note: Web3Auth types may not match actual API, using 'as any' for chains support
export const web3AuthOptions = {
    clientId,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
} satisfies Web3AuthOptions;

// Context config with chains for switching functionality
export const web3AuthContextConfig = {
    web3AuthOptions,
    // Add chains array for useSwitchChain hook support
    chains: [arbitrumSepoliaConfig, sepoliaConfig],
} as Web3AuthContextConfig;

// Export chain IDs for use in components
export const ARBITRUM_SEPOLIA_CHAIN_ID = '0x66eee';
export const SEPOLIA_CHAIN_ID = '0xaa36a7';

export default web3AuthContextConfig;
