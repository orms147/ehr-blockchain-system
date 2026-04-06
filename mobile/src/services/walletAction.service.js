import web3auth, { redirectUrl } from '../config/web3authContext';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';

const ARBITRUM_SEPOLIA_RPC = 'https://sepolia-rollup.arbitrum.io/rpc';
const SIGN_RETRY_COUNT = 1;
const INIT_TIMEOUT_MS = 15000;
const LOGIN_TIMEOUT_MS = 90000;

let cachedWeb3Auth = web3auth;
let initPromise = null;

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
        throw new Error('Không khoi tao được Web3Auth context.');
    }
    return cachedWeb3Auth;
}

async function initializeWeb3Auth() {
    if (!initPromise) {
        initPromise = (async () => {
            const web3authInstance = await getWeb3Auth();
            if (!web3authInstance.ready) {
                await withTimeout(
                    web3authInstance.init(),
                    INIT_TIMEOUT_MS,
                    'Khởi tạo Web3Auth quá thời gian. Vui lòng thử lại.'
                );
            }
            return web3authInstance;
        })().catch((error) => {
            initPromise = null;
            throw error;
        });
    }

    return initPromise;
}

async function ensureWeb3AuthReady() {
    return initializeWeb3Auth();
}

async function getWalletContext() {
    const web3authInstance = await ensureWeb3AuthReady();
    if (!web3authInstance.provider) {
        throw new Error('Phiên đăng nhập Web3Auth không hợp lệ. Vui lòng đăng nhập lai.');
    }

    const rawPrivateKey = await web3authInstance.provider.request({ method: 'eth_private_key' });
    if (!rawPrivateKey || typeof rawPrivateKey !== 'string') {
        throw new Error('Không lay được private key tu Web3Auth.');
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
        throw new Error('Web3Auth không tra ve địa chỉ vi hop le.');
    }
    if (firstRpcAccount.toLowerCase() !== account.address.toLowerCase()) {
        throw new Error('Địa chỉ ví Web3Auth không khop voi private key phiên đăng nhập.');
    }

    return {
        web3auth: web3authInstance,
        privateKey,
        account,
        walletClient,
        address: account.address,
    };
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
                shouldRetry: (error) => {
                    const raw = (error?.message || '').toLowerCase();
                    return raw.includes('timeout') || raw.includes('network') || raw.includes('rpc');
                },
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
                shouldRetry: (error) => {
                    const raw = (error?.message || '').toLowerCase();
                    return raw.includes('timeout') || raw.includes('network') || raw.includes('rpc');
                },
            }
        );
    } catch (error) {
        throw new Error(mapWalletError(error, 'Không thể ký dữ liệu EIP-712.'));
    }
}

async function loginWithWeb3Auth(loginProvider = 'google') {
    const web3authInstance = await ensureWeb3AuthReady();

    try {
        await withTimeout(
            web3authInstance.login({
                loginProvider,
                redirectUrl,
            }),
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
        throw new Error(mapWalletError(error, 'Đăng nhập Web3Auth that bai.'));
    }
}

async function logoutWeb3Auth() {
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
    signMessage,
    signTypedData,
    logoutWeb3Auth,
};

export default walletActionService;





