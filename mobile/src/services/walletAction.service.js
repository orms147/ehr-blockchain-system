import web3auth, { redirectUrl, privateKeyProvider } from '../config/web3authContext';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';

// Public Arbitrum Sepolia RPC gets rate-limited (HTTP 429) fast under
// heavy testing. Prefer EXPO_PUBLIC_RPC_URL (private endpoint, e.g. Alchemy)
// when set; fall back to public for local dev convenience.
const ARBITRUM_SEPOLIA_RPC = process.env.EXPO_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const SIGN_RETRY_COUNT = 1;
// Bumped from 15s → 30s for slower mobile networks (VN 4G/WiFi sometimes
// takes >15s for Web3Auth Sapphire Devnet handshake). If still timing out,
// real root cause is likely redirect URL not whitelisted in Web3Auth
// Dashboard (https://dashboard.web3auth.io) — must add `erhsystem://auth`.
const INIT_TIMEOUT_MS = 30000;
const LOGIN_TIMEOUT_MS = 120000;

let cachedWeb3Auth = web3auth;
let initPromise = null;
// In-memory cache of the derived walletContext for the current session.
// Private key lives only here — never persisted. Cleared on logout + app restart.
// Avoids calling `provider.request('eth_private_key')` repeatedly (Web3Auth RN
// SDK's middleware occasionally returns null right after login; caching once
// we succeed eliminates that failure mode for subsequent sign/decrypt calls).
let cachedWalletContext = null;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(task, timeoutMs, timeoutMessage) {
    return Promise.race([
        task,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        }),
    ]);
}

function mapWalletError(error, fallbackMessage) {
    const raw = String(error?.message || '').toLowerCase();

    if (raw.includes('cannot connect to expo cli') || raw.includes('could not load bundle') || raw.includes('loadbundlefromserverrequesterror')) {
        return 'Ứng dụng không kết nối được Metro. Hãy mở lại Expo dev server và chạy adb reverse tcp:8081 tcp:8081.';
    }

    if (raw.includes('user rejected') || raw.includes('user canceled') || raw.includes('cancelled')) {
        return 'Bạn đã huỷ thao tác ký. Vui lòng thử lại.';
    }

    // RPC rate limit (Alchemy free tier 300 CU/sec).
    if (error?.status === 429 || raw.includes('429') || raw.includes('too many requests') || raw.includes('rate limit')) {
        return 'Hệ thống blockchain đang quá tải. Vui lòng thử lại sau vài giây.';
    }

    if (raw.includes('upgrade to payg') || raw.includes('block range')) {
        return 'Yêu cầu RPC vượt giới hạn quota free. Liên hệ admin để nâng cấp.';
    }

    if (raw.includes('session') || raw.includes('provider') || raw.includes('not logged in') || raw.includes('walletconnect')) {
        return 'Phiên đăng nhập Web3Auth đã hết hạn. Vui lòng đăng nhập lại.';
    }

    if (raw.includes('timeout') || raw.includes('timed out')) {
        return 'Thao tác bị quá thời gian. Vui lòng thử lại.';
    }

    if (raw.includes('network') || raw.includes('rpc') || raw.includes('fetch')) {
        return 'Không thể kết nối đến mạng blockchain. Vui lòng kiểm tra internet và thử lại.';
    }

    if (raw.includes('client id')) {
        return 'Thiếu hoặc sai Web3Auth Client ID. Kiểm tra biến EXPO_PUBLIC_WEB3AUTH_CLIENT_ID.';
    }

    return error?.message || fallbackMessage;
}

async function runWithRetry(task, {
    retries = 0,
    retryDelayMs = 450,
    shouldRetry = () => false,
} = {}) {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await task();
        } catch (error) {
            lastError = error;
            if (attempt === retries || !shouldRetry(error)) break;
            await delay(retryDelayMs);
        }
    }

    throw lastError;
}

function validateWeb3AuthInstance(instance) {
    return (
        instance &&
        typeof instance === 'object' &&
        typeof instance.init === 'function' &&
        typeof instance.login === 'function'
    );
}

async function getWeb3Auth() {
    if (!validateWeb3AuthInstance(cachedWeb3Auth)) {
        throw new Error('Không khởi tạo được Web3Auth context.');
    }
    return cachedWeb3Auth;
}

async function initializeWeb3Auth() {
    if (!initPromise) {
        console.log('[InitWeb3Auth] STEP 1 — start. cachedWeb3Auth valid:', validateWeb3AuthInstance(cachedWeb3Auth));
        initPromise = (async () => {
            const startTs = Date.now();
            console.log('[InitWeb3Auth] STEP 2 — getWeb3Auth...');
            const web3authInstance = await getWeb3Auth();
            console.log('[InitWeb3Auth] STEP 3 — got instance. ready:', web3authInstance.ready, '· provider:', !!web3authInstance.provider);
            if (!web3authInstance.ready) {
                console.log('[InitWeb3Auth] STEP 4 — calling web3auth.init() with timeout', INIT_TIMEOUT_MS, 'ms');
                try {
                    const initRaw = web3authInstance.init();
                    console.log('[InitWeb3Auth] STEP 4a — init() invoked, type:', typeof initRaw, '· thenable:', !!(initRaw && typeof initRaw.then === 'function'));
                    await withTimeout(
                        initRaw,
                        INIT_TIMEOUT_MS,
                        'Khởi tạo Web3Auth quá thời gian. Vui lòng thử lại.'
                    );
                    console.log('[InitWeb3Auth] STEP 5 — init() resolved in', Date.now() - startTs, 'ms · ready now:', web3authInstance.ready);
                } catch (initErr) {
                    console.log('[InitWeb3Auth] STEP 5x — init() FAILED after', Date.now() - startTs, 'ms · message:', String(initErr?.message || initErr).slice(0, 200));
                    throw initErr;
                }
            } else {
                console.log('[InitWeb3Auth] STEP 4 — already ready=true, skip init()');
            }
            console.log('[InitWeb3Auth] STEP 6 — done in', Date.now() - startTs, 'ms');
            return web3authInstance;
        })().catch((error) => {
            console.log('[InitWeb3Auth] OUTER CATCH:', String(error?.message || error).slice(0, 200));
            initPromise = null;
            throw error;
        });
    } else {
        console.log('[InitWeb3Auth] reusing in-flight initPromise');
    }

    return initPromise;
}

async function ensureWeb3AuthReady() {
    return initializeWeb3Auth();
}

// Error code thrown by getWalletContext when Web3Auth init succeeded (provider
// exists, ready=true) but no active login session is hydrated — eg. cold start
// with valid JWT but Web3Auth session not restored. Consumers (App.tsx boot
// guard, screen-level handlers) use this code to decide "force re-login".
export const WEB3AUTH_SESSION_EXPIRED = 'WEB3AUTH_SESSION_EXPIRED';

function makeSessionExpiredError() {
    const err = new Error('Phiên đăng nhập Web3Auth đã hết hạn. Vui lòng đăng nhập lại.');
    err.code = WEB3AUTH_SESSION_EXPIRED;
    return err;
}

async function getWalletContext() {
    const web3authInstance = await ensureWeb3AuthReady();

    if (!web3authInstance.provider) {
        cachedWalletContext = null;
        throw makeSessionExpiredError();
    }

    // Fast path: return cached context if the session is still the same instance.
    // Address is double-checked below after the fresh eth_accounts read to
    // detect session rotation.
    if (cachedWalletContext && cachedWalletContext.web3auth === web3authInstance) {
        return cachedWalletContext;
    }

    // Web3Auth RN SDK (v8.1.0) stores the private key in the EthereumPrivateKeyProvider's
    // controller state after login. The JSON-RPC route `provider.request('eth_private_key')`
    // goes through a wallet middleware that occasionally returns null right after
    // login / cold-start even when the state is already set — state hydrates before
    // the middleware's handler is wired. Read state directly as PRIMARY source;
    // fall back to the RPC request only if state is empty.
    let rawPrivateKey = null;
    const directPk = privateKeyProvider?.state?.privateKey;
    if (directPk && typeof directPk === 'string') {
        rawPrivateKey = directPk;
    } else {
        for (let attempt = 0; attempt < 5; attempt++) {
            const viaState = privateKeyProvider?.state?.privateKey;
            if (viaState && typeof viaState === 'string') {
                rawPrivateKey = viaState;
                break;
            }
            const viaRpc = await web3authInstance.provider.request({ method: 'eth_private_key' });
            if (viaRpc && typeof viaRpc === 'string') {
                rawPrivateKey = viaRpc;
                break;
            }
            await delay(300);
        }
    }
    if (!rawPrivateKey || typeof rawPrivateKey !== 'string') {
        // Provider exists + ready=true, but state has no privateKey and RPC
        // returns nothing — classic "cold-start JWT valid but Web3Auth session
        // not restored" scenario. Surface as WEB3AUTH_SESSION_EXPIRED so the
        // boot guard / caller can force re-login instead of showing a cryptic
        // "thu 5 lan" error.
        throw makeSessionExpiredError();
    }

    const privateKey = rawPrivateKey.startsWith('0x') ? rawPrivateKey : `0x${rawPrivateKey}`;
    const account = privateKeyToAccount(privateKey);

    const walletClient = createWalletClient({
        account,
        chain: arbitrumSepolia,
        transport: http(ARBITRUM_SEPOLIA_RPC),
    });

    const rpcAccounts = await web3authInstance.provider.request({ method: 'eth_accounts' });
    const firstRpcAccount = Array.isArray(rpcAccounts) && typeof rpcAccounts[0] === 'string' ? rpcAccounts[0] : null;
    if (!firstRpcAccount) {
        throw new Error('Web3Auth không trả về địa chỉ ví hợp lệ.');
    }
    if (firstRpcAccount.toLowerCase() !== account.address.toLowerCase()) {
        throw new Error('Địa chỉ ví Web3Auth không khớp với private key phiên đăng nhập.');
    }

    const ctx = {
        web3auth: web3authInstance,
        privateKey,
        account,
        walletClient,
        address: account.address,
    };
    cachedWalletContext = ctx;
    return ctx;
}

function isRetryableSignError(error) {
    const raw = (error?.message || '').toLowerCase();
    if (error?.status === 429 || error?.cause?.status === 429) return true;
    return raw.includes('timeout') || raw.includes('network') || raw.includes('rpc')
        || raw.includes('429') || raw.includes('too many requests') || raw.includes('rate limit');
}

async function signMessage(walletClient, message) {
    if (!walletClient) {
        throw new Error('Không tìm thấy wallet client để ký dữ liệu.');
    }

    try {
        return await runWithRetry(
            () => walletClient.signMessage({ message }),
            {
                retries: SIGN_RETRY_COUNT,
                shouldRetry: isRetryableSignError,
            }
        );
    } catch (error) {
        throw new Error(mapWalletError(error, 'Không thể ký dữ liệu.'));
    }
}

async function signTypedData(walletClient, typedDataPayload) {
    if (!walletClient) {
        throw new Error('Không tìm thấy wallet client để ký dữ liệu.');
    }

    try {
        return await runWithRetry(
            () => walletClient.signTypedData(typedDataPayload),
            {
                retries: SIGN_RETRY_COUNT,
                shouldRetry: isRetryableSignError,
            }
        );
    } catch (error) {
        throw new Error(mapWalletError(error, 'Không thể ký dữ liệu EIP-712.'));
    }
}

/**
 * Login via Web3Auth Sapphire v8.1.0.
 * @param {string} loginProvider - 14 social providers + 2 passwordless:
 *   Social OAuth: 'google' | 'apple' | 'twitter' (X) | 'facebook' | 'discord' |
 *                 'line' | 'reddit' | 'twitch' | 'github' | 'kakao' |
 *                 'linkedin' | 'weibo' | 'wechat' | 'farcaster'
 *   Passwordless: 'email_passwordless' | 'sms_passwordless'
 * @param {object} [options]
 * @param {string} [options.loginHint] - Required for sms_passwordless (phone in E.164 format e.g. +84901234567)
 *                                       and recommended for email_passwordless (skips Web3Auth's email input form).
 *                                       Web3Auth rejects sms_passwordless without it: "Missing login_hint for web3auth passwordless login".
 */
async function loginWithWeb3Auth(loginProvider = 'google', options = {}) {
    const web3authInstance = await ensureWeb3AuthReady();
    const { loginHint } = options;

    try {
        const loginParams = { loginProvider, redirectUrl };
        // Fix bug "logout → login user khác vẫn vào dashboard cũ": Google +
        // social OAuth (Apple/Facebook/etc.) cache session ở browser Custom
        // Tabs. Web3Auth logout không clear cookie browser → next login auto
        // pick last account → cùng wallet → cùng identity. Force prompt=
        // select_account để bắt user chọn lại tài khoản OAuth.
        // OAuth providers cho phép `prompt=select_account` (Google/Facebook/Apple/...
        // dùng OAuth 2.0 standard). Một số provider (Farcaster sign-in-with, WeChat,
        // Kakao) dùng flow custom — không support extraLoginOptions.prompt.
        const SOCIAL_PROVIDERS_WITH_ACCOUNT_PICKER = [
            'google', 'facebook', 'apple', 'discord', 'twitter',
            'line', 'reddit', 'twitch', 'github', 'linkedin',
        ];
        const extraLoginOptions = {};
        if (loginHint) {
            extraLoginOptions.login_hint = loginHint;
        }
        if (SOCIAL_PROVIDERS_WITH_ACCOUNT_PICKER.includes(loginProvider)) {
            extraLoginOptions.prompt = 'select_account';
        }
        if (Object.keys(extraLoginOptions).length > 0) {
            loginParams.extraLoginOptions = extraLoginOptions;
        }
        await withTimeout(
            web3authInstance.login(loginParams),
            LOGIN_TIMEOUT_MS,
            'Đăng nhập Web3Auth quá thời gian. Vui lòng thử lại.'
        );
    } catch (error) {
        let raw = '';
        if (typeof error === 'string') {
            raw = error.toLowerCase();
        } else {
            const message = typeof error?.message === 'string' ? error.message : '';
            const stack = typeof error?.stack === 'string' ? error.stack : '';
            raw = `${message} ${stack}`.toLowerCase().trim();
            if (!raw) {
                try {
                    raw = JSON.stringify(error).toLowerCase();
                } catch {
                    raw = '';
                }
            }
        }

        if (raw.includes('reload')) {
            throw new Error(
                'Đăng nhập social đang gặp lỗi từ Web3Auth SDK (reload). Vui lòng thử Email OTP hoặc kiểm tra redirectUrl/whitelist erhsystem://auth trong Web3Auth Dashboard.'
            );
        }

        throw new Error(mapWalletError(error, 'Đăng nhập Web3Auth thất bại.'));
    }

    try {
        return await getWalletContext();
    } catch (error) {
        throw new Error(mapWalletError(error, 'Đăng nhập Web3Auth thất bại.'));
    }
}

// Returns true iff Web3Auth has a hydrated private key for the current session.
// Used by App.tsx boot guard to detect the "JWT valid but Web3Auth session not
// restored" state that happens on cold start.
function hasActiveSession() {
    return !!privateKeyProvider?.state?.privateKey;
}

async function logoutWeb3Auth() {
    // Clear the in-memory walletContext first so any concurrent getWalletContext
    // call starts from scratch after logout.
    cachedWalletContext = null;

    const web3authInstance = await getWeb3Auth();
    if (!web3authInstance) return;

    if (web3authInstance.connected || web3authInstance.provider) {
        await web3authInstance.logout();
    }
}

const walletActionService = {
    ensureWeb3AuthReady,
    initializeWeb3Auth,
    loginWithWeb3Auth,
    getWalletContext,
    hasActiveSession,
    signMessage,
    signTypedData,
    logoutWeb3Auth,
};

export default walletActionService;





