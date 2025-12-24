// Type definitions for useWalletAddress hook

export interface WalletAddressHookResult {
    address: string | null;
    loading: boolean;
    isConnected: boolean;
    provider: any;
}

export function useWalletAddress(): WalletAddressHookResult;
export default useWalletAddress;
