import { Wallet, WalletDetailsParams } from '@rainbow-me/rainbowkit';
import { Web3AuthConnector } from "@web3auth/web3auth-wagmi-connector";
import { Web3Auth } from "@web3auth/modal";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/base";
import { sepolia } from 'wagmi/chains';

export const web3AuthWallet = (): Wallet => ({
    id: 'web3auth',
    name: 'Web3Auth',
    iconUrl: 'https://web3auth.io/images/w3a-L-Favicon-1.svg',
    iconBackground: '#fff',
    createConnector: (walletDetails: WalletDetailsParams) => {
        const chain = sepolia;
        const chainConfig = {
            chainNamespace: CHAIN_NAMESPACES.EIP155,
            chainId: "0x" + chain.id.toString(16),
            rpcTarget: chain.rpcUrls.default.http[0],
            displayName: chain.name,
            blockExplorer: chain.blockExplorers?.default.url || "",
            ticker: chain.nativeCurrency.symbol,
            tickerName: chain.nativeCurrency.name,
        };

        const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

        const web3AuthInstance = new Web3Auth({
            clientId: process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || "YOUR_CLIENT_ID",
            web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
            privateKeyProvider,
            uiConfig: {
                appName: "EHR Blockchain System",
                mode: "light",
                loginMethodsOrder: ["google", "facebook", "twitter"],
                logoLight: "https://web3auth.io/images/w3a-L-Favicon-1.svg",
                logoDark: "https://web3auth.io/images/w3a-D-Favicon-1.svg",
                defaultLanguage: "en",
                loginGridCol: 3,
                primaryButton: "socialLogin",
            },
        });

        return {
            connector: Web3AuthConnector({
                web3AuthInstance,
            }),
        };
    },
});
