import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import Web3Auth, { WEB3AUTH_NETWORK } from '@web3auth/react-native-sdk';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';

export const ARBITRUM_SEPOLIA_CHAIN_ID = '0x66eee';

const clientId = process.env.EXPO_PUBLIC_WEB3AUTH_CLIENT_ID?.trim();
if (!clientId) {
  throw new Error(
    'Missing EXPO_PUBLIC_WEB3AUTH_CLIENT_ID. Add it to .env before starting the app.'
  );
}

const resolveWeb3AuthRedirect = (): string => {
  const fromEnv = process.env.EXPO_PUBLIC_WEB3AUTH_REDIRECT_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const isExpoGo = Constants.appOwnership === 'expo' || Constants.appOwnership === 'guest';

  // Expo Go fallback (mainly for Email OTP during development).
  if (isExpoGo) {
    const expoRedirect = Linking.createURL('auth', {});
    return expoRedirect;
  }

  // Development client / production build should always use custom scheme.
  const scheme = 'erhsystem';
  const nativeRedirect = Linking.createURL('auth', { scheme }).replace(/\/$/, '');
  return nativeRedirect;
};

const chainConfig = {
  chainNamespace: 'eip155' as const,
  chainId: ARBITRUM_SEPOLIA_CHAIN_ID,
  rpcTarget: 'https://sepolia-rollup.arbitrum.io/rpc',
  displayName: 'Arbitrum Sepolia',
  blockExplorerUrl: 'https://sepolia.arbiscan.io',
  ticker: 'ETH',
  tickerName: 'Ethereum',
};

const privateKeyProvider = new EthereumPrivateKeyProvider({
  config: { chainConfig },
});

const maybeCompatProvider = privateKeyProvider as any;
if (typeof maybeCompatProvider.setKeyExportFlag !== 'function') {
  maybeCompatProvider.setKeyExportFlag = () => {};
}

const redirectUrl = resolveWeb3AuthRedirect();

const web3auth = new Web3Auth(WebBrowser, SecureStore, {
  clientId,
  network: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
  privateKeyProvider,
  redirectUrl,
  whiteLabel: {
    appName: 'EHR Chain',
  },
});

export { redirectUrl, clientId };
export default web3auth;
