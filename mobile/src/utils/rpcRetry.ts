// rpcRetry.ts (2026-04-27)
//
// Centralized helpers for two recurring problems with mobile contract reads/writes:
//
// 1. Alchemy free-tier rate limit (HTTP 429). Hits often during share flows
//    where mobile fires multiple eth_call in parallel (isDoctor, canAccess,
//    encryption keys, etc.). Without retry, user sees a raw "Status: 429"
//    dialog and has to manually re-tap the action.
//
// 2. Inconsistent error UX. Different code paths surfaced raw viem error
//    objects with `Status:`, `URL:`, `Request body:` blobs. Users had no idea
//    what to do. This file maps every recurring chain error to a Vietnamese
//    one-liner.

const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 600;

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimit(error: any): boolean {
    const raw = String(error?.message || error || '').toLowerCase();
    if (error?.status === 429) return true;
    if (error?.cause?.status === 429) return true;
    return raw.includes('429') || raw.includes('too many requests') || raw.includes('rate limit');
}

function isTransientNetwork(error: any): boolean {
    const raw = String(error?.message || error || '').toLowerCase();
    return (
        raw.includes('network request failed')
        || raw.includes('failed to fetch')
        || raw.includes('socket hang up')
        || raw.includes('econnreset')
        || raw.includes('etimedout')
        || raw.includes('timeout')
    );
}

export type RetryOpts = {
    retries?: number;
    baseDelayMs?: number;
    /** Custom predicate. Default: 429 + transient network errors. */
    shouldRetry?: (error: any) => boolean;
};

/**
 * Run an RPC call with automatic retry on rate-limit / transient network
 * errors. Uses exponential backoff (base * 2^attempt) so a 429 burst gets
 * spread out instead of hammering the endpoint.
 */
export async function withRpcRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
    const retries = opts.retries ?? DEFAULT_RETRIES;
    const base = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    const predicate = opts.shouldRetry ?? ((err: any) => isRateLimit(err) || isTransientNetwork(err));

    let lastErr: any;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (attempt === retries || !predicate(err)) break;
            const wait = base * Math.pow(2, attempt);
            await delay(wait);
        }
    }
    throw lastErr;
}

/**
 * Map a raw chain / viem / fetch error to a short Vietnamese user-facing
 * message. Drop into Alert.alert / setError so users never see raw JSON-RPC
 * dumps.
 */
export function formatChainError(error: any, fallback = 'Có lỗi xảy ra. Vui lòng thử lại.'): string {
    if (!error) return fallback;
    const raw = String(error?.message || error || '').toLowerCase();
    const code = String(error?.code || error?.data?.code || '');

    // App-level codes that other layers may already have set.
    if (code === 'CONSENT_NOT_FOUND') return 'Chưa có quyền truy cập trên blockchain.';
    if (code === 'DOCTOR_NOT_VERIFIED') return 'Tài khoản bác sĩ chưa được tổ chức xác minh.';
    if (code === 'CREATOR_KEY_LOST') return 'Khoá giải mã đã mất theo phiên cũ. Liên hệ tác giả hồ sơ để được chia sẻ lại.';
    if (code === 'OWNER_KEY_MISSING') return 'Bạn chưa có khoá cho phiên bản này. Hãy yêu cầu bác sĩ chia sẻ lại.';
    if (code === 'KEY_NOT_SHARED_FOR_VERSION') return 'Phiên bản này chưa được chia sẻ khoá cho bạn.';
    if (code === 'KEY_SHARE_REVOKED') return 'Bệnh nhân đã thu hồi quyền truy cập.';
    if (code === 'KEY_SHARE_EXPIRED') return 'Quyền truy cập đã hết hạn.';
    if (code === 'PARENT_ALREADY_UPDATED' || code === 'MAX_CHILDREN_REACHED') {
        return 'Hồ sơ đã có bản cập nhật mới. Hãy mở phiên bản mới nhất rồi thử lại.';
    }
    if (code === 'QUOTA_EXHAUSTED') return 'Hạn mức giao dịch miễn phí của tháng này đã hết.';

    // Rate limit & infra (highest priority — prevents users from staring at
    // raw "Status: 429" dialogs).
    if (isRateLimit(error)) {
        return 'Hệ thống blockchain đang quá tải. Vui lòng thử lại sau vài giây.';
    }
    if (raw.includes('block range') || raw.includes('block height')) {
        return 'Yêu cầu blockchain vượt giới hạn. Liên hệ admin để nâng quota RPC.';
    }
    if (raw.includes('-32600') || raw.includes('upgrade to payg')) {
        return 'Hệ thống blockchain đang ở chế độ giới hạn. Hãy chờ vài giây và thử lại.';
    }

    // Wallet / sign UX.
    if (raw.includes('user rejected') || raw.includes('user canceled') || raw.includes('cancelled') || raw.includes('user denied')) {
        return 'Bạn đã huỷ giao dịch.';
    }
    if (raw.includes('insufficient funds') || raw.includes('insufficient balance')) {
        return 'Ví không đủ ETH để trả phí giao dịch.';
    }
    if (raw.includes('nonce too low') || raw.includes('nonce provided') || raw.includes('replacement transaction')) {
        return 'Giao dịch trùng lặp. Vui lòng đóng app, mở lại và thử lại.';
    }
    if (raw.includes('gas required exceeds') || raw.includes('out of gas')) {
        return 'Giao dịch tốn quá nhiều gas. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.';
    }

    // Contract reverts.
    if (raw.includes('execution reverted') || raw.includes('reverted with reason')) {
        if (raw.includes('notdoctor')) return 'Tài khoản bác sĩ chưa đăng ký vai trò trên blockchain.';
        if (raw.includes('notpatient')) return 'Tài khoản bệnh nhân chưa đăng ký trên blockchain.';
        if (raw.includes('unauthorized')) return 'Bạn không có quyền thực hiện thao tác này.';
        if (raw.includes('alreadyregistered')) return 'Tài khoản đã đăng ký sẵn vai trò này.';
        if (raw.includes('alreadyprocessed')) return 'Yêu cầu này đã được xử lý.';
        if (raw.includes('expired') || raw.includes('deadlinepassed') || raw.includes('requestexpired')) {
            return 'Yêu cầu đã hết hạn. Vui lòng tạo yêu cầu mới.';
        }
        if (raw.includes('approvaltoosoon') || raw.includes('0x3d693ada')) {
            return 'Vui lòng chờ thêm 15-30 giây trước khi thử lại.';
        }
        if (raw.includes('invalidsignature')) return 'Chữ ký không hợp lệ. Vui lòng thử lại.';
        if (raw.includes('invalidnonce')) return 'Nonce không khớp. Vui lòng đóng app và mở lại.';
        return 'Giao dịch bị từ chối bởi blockchain. Vui lòng thử lại.';
    }

    // Generic network.
    if (isTransientNetwork(error)) {
        return 'Mất kết nối với blockchain. Vui lòng kiểm tra mạng và thử lại.';
    }
    if (raw.includes('cannot connect to expo') || raw.includes('loadbundle')) {
        return 'Không kết nối được Metro dev server. Khởi động lại Expo.';
    }

    // Unknown — give the fallback. Avoid leaking raw JSON-RPC details.
    return error?.userMessage || fallback;
}

export default { withRpcRetry, formatChainError };
