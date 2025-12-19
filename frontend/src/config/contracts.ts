// Arbitrum Sepolia Contract Addresses
// Deployed on: 2024-12-18
// Chain ID: 421614

export const CONTRACT_ADDRESSES = {
    AccessControl: '0x3181635DA614B65c2AeeA74E2473a54915acFF9D',
    ConsentLedger: '0x7D3813eE2f8B5c1041175EC646AA8F740720ad42',
    RecordRegistry: '0xA095cd84a6Ff6E3CEe2d7091bBC333aCa8B6B48b',
    EHRSystemSecure: '0x800676652205C2A8c7aAa9C4D4Ad0297460AB09D',
    DoctorUpdate: '0x7810d95EA96Bd7d1Fa474602ED1568cC46d2a8eE',
} as const;

// Arbitrum Sepolia Network Config
export const NETWORK_CONFIG = {
    chainId: 421614,
    chainName: 'Arbitrum Sepolia',
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    blockExplorer: 'https://sepolia.arbiscan.io',
    nativeCurrency: {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
    },
} as const;
