// Self-pay fallback for the unified gas model (decided 2026-06-21):
// every user gets 100 free sponsored signatures/month; once that pool is used up
// the relayer refuses (HTTP 429 QUOTA_EXHAUSTED, or 402 requiresOwnWallet for
// revoke) and the user pays gas themselves from their OWN Web3Auth wallet.
//
// This helper wraps any relayer-sponsored action: on quota exhaustion it re-submits
// the SAME on-chain action directly via walletClient.writeContract (msg.sender =
// the user's embedded wallet). The Web3Auth embedded wallet is a real EOA whose
// private key the app holds (walletAction.service.js getWalletContext), so it can
// sign AND broadcast — it just needs ETH balance. See
// context/28_wallet_login_integration.md.
//
// NOTE: the biometric gate (gateOrThrow) is already invoked by each caller BEFORE
// the relayer call, so this helper deliberately does NOT prompt again.

import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { withRpcRetry } from './rpcRetry';
import walletActionService from '../services/walletAction.service';

const ARBITRUM_SEPOLIA_RPC = process.env.EXPO_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';

// "100 free used up" → self-pay. Distinct from RELAYER_RATE_LIMITED (a transient
// anti-abuse limiter) which must NOT trigger self-pay (the user still has free quota).
export function isQuotaExhausted(err) {
    if (!err) return false;
    if (err.code === 'QUOTA_EXHAUSTED') return true;
    if (err.data && err.data.code === 'QUOTA_EXHAUSTED') return true;
    if (err.status === 402 && err.data && err.data.requiresOwnWallet === true) return true;
    return false;
}

/**
 * Run a relayer-sponsored action; on quota exhaustion, fall back to self-pay by
 * submitting the same on-chain call from the user's own wallet.
 *
 * @param {() => Promise<any>} relayerCall - the existing gasless relayer path
 * @param {{ address: string, abi: any, functionName: string, args: any[] }} selfPayWrite
 *        - the equivalent direct contract call (account is injected from getWalletContext)
 * @param {{ onFallback?: () => void }} [opts]
 * @returns {Promise<{ txHash: string, selfPaid: boolean, relayerResult: any }>}
 */
export async function withSelfPayFallback(relayerCall, selfPayWrite, opts = {}) {
    try {
        const relayerResult = await relayerCall();
        return { txHash: relayerResult?.txHash, selfPaid: false, relayerResult };
    } catch (err) {
        if (!isQuotaExhausted(err)) throw err;
        if (typeof opts.onFallback === 'function') opts.onFallback();

        const { walletClient, account, address } = await walletActionService.getWalletContext();
        const publicClient = createPublicClient({
            chain: arbitrumSepolia,
            // retryCount=0: withRpcRetry below is the single retry layer (avoids
            // stacked viem-transport retries hanging ~26s on 429 bursts).
            transport: http(ARBITRUM_SEPOLIA_RPC, { retryCount: 0 }),
        });

        // An empty wallet can't self-pay → give a clear, actionable message instead
        // of viem's raw "insufficient funds for gas".
        const balance = await withRpcRetry(() => publicClient.getBalance({ address }));
        if (balance === 0n) {
            const e = new Error(
                'Đã hết 100 lượt miễn phí tháng này và ví của bạn chưa có ETH để tự trả phí. '
                + 'Hãy nạp một ít ETH (mạng Arbitrum Sepolia) vào địa chỉ ví của bạn rồi thử lại.'
            );
            e.code = 'NO_ETH_FOR_SELF_PAY';
            throw e;
        }

        const txHash = await withRpcRetry(() => walletClient.writeContract({ account, ...selfPayWrite }));
        await withRpcRetry(() => publicClient.waitForTransactionReceipt({ hash: txHash }));
        return { txHash, selfPaid: true, relayerResult: null };
    }
}

export default { withSelfPayFallback, isQuotaExhausted };
