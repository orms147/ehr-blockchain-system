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

// DIAG: trace Web3Auth module load + config at startup
console.log('[Web3AuthCtx] Module loading. clientId prefix:', clientId.slice(0, 12), '... length:', clientId.length);
console.log('[Web3AuthCtx] Constants.appOwnership:', Constants.appOwnership);
console.log('[Web3AuthCtx] EXPO_PUBLIC_RPC_URL:', process.env.EXPO_PUBLIC_RPC_URL || '(not set, using public)');

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
  // Prefer private RPC when set — Web3Auth periodically polls eth_blockNumber
  // / eth_chainId during init. Public RPC gets rate-limited under heavy use.
  rpcTarget: process.env.EXPO_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
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

console.log('[Web3AuthCtx] Resolved redirectUrl:', redirectUrl);
console.log('[Web3AuthCtx] Network: SAPPHIRE_DEVNET');
console.log('[Web3AuthCtx] Creating Web3Auth instance...');

// Web3Auth lưu session keyed bằng "sessionId" + TÊN VERIFIER (KeyStore.set(verifier, …)
// tại Web3Auth.js). Một số verifier — đặc biệt email_passwordless — chứa ký tự mà
// expo-secure-store từ chối ("Invalid key … chỉ a-z 0-9 . - _") → login crash, trong khi
// Google (verifier hợp lệ) vẫn chạy. Bọc SecureStore để chuẩn hoá key. Key hợp lệ giữ
// nguyên (vd "sessionId", verifier Google) → không ảnh hưởng phiên cũ. 2026-06-21.
const sanitizeSecureStoreKey = (k: unknown): string => {
  const s = String(k ?? '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return s.length ? s : 'w3a_default';
};
const secureStoreSafe = {
  getItemAsync: (k: string, opts?: any) => SecureStore.getItemAsync(sanitizeSecureStoreKey(k), opts),
  setItemAsync: (k: string, v: string, opts?: any) => SecureStore.setItemAsync(sanitizeSecureStoreKey(k), v, opts),
  deleteItemAsync: (k: string, opts?: any) => SecureStore.deleteItemAsync(sanitizeSecureStoreKey(k), opts),
};

const web3auth = new Web3Auth(WebBrowser, secureStoreSafe as any, {
  clientId,
  network: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
  privateKeyProvider,
  redirectUrl,
  whiteLabel: {
    appName: 'EHR Chain',
  },
});

console.log('[Web3AuthCtx] Web3Auth instance created. Has init fn:', typeof (web3auth as any).init, '· Has login fn:', typeof (web3auth as any).login, '· ready:', (web3auth as any).ready);

export { redirectUrl, clientId, privateKeyProvider };
export default web3auth;
