import { getDefaultConfig, connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
    rainbowWallet,
    walletConnectWallet,
    metaMaskWallet,
    coinbaseWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { web3AuthWallet } from '../lib/web3auth-wallet';
import { sepolia } from 'wagmi/chains';
import { createConfig, http } from 'wagmi';

const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || 'YOUR_PROJECT_ID';

const connectors = connectorsForWallets(
    [
        {
            groupName: 'Recommended',
            wallets: [
                rainbowWallet,
                metaMaskWallet,
                walletConnectWallet,
                web3AuthWallet(),
            ],
        },
    ],
    {
        appName: 'EHR System',
        projectId,
    }
);

export const config = createConfig({
    chains: [sepolia],
    transports: {
        [sepolia.id]: http(),
    },
    connectors,
    ssr: true,
});

