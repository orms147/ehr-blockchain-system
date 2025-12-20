import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
    rainbowWallet,
    walletConnectWallet,
    metaMaskWallet,
    coinbaseWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { arbitrumSepolia } from 'wagmi/chains';
import { createConfig, http } from 'wagmi';

const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || 'c07c08929bda531398544edc0da85917';

const connectors = connectorsForWallets(
    [
        {
            groupName: 'Ví được hỗ trợ',
            wallets: [
                metaMaskWallet,
                rainbowWallet,
                walletConnectWallet,
                coinbaseWallet,
            ],
        },
    ],
    {
        appName: 'EHR System',
        projectId,
    }
);

export const config = createConfig({
    chains: [arbitrumSepolia],
    transports: {
        [arbitrumSepolia.id]: http('https://sepolia-rollup.arbitrum.io/rpc'),
    },
    connectors,
    ssr: false,
});

