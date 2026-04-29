// Backend RPC retry helper (2026-04-28).
//
// Three sync workers (EventSync, RecordSync, ConsentSync) fire many parallel
// eth_getLogs calls during catchup. Alchemy free tier (300 CU/sec, ~75 CU per
// getLogs) saturates fast → cascading 429s, and the previous code logged the
// error and moved on, losing entire chunks of events.
//
// withRpcRetry: exponential backoff on 429 / transient network. Default
// 5 retries × 1.5x = up to ~25s before giving up. Always logs the retry so
// the operator can see when the system is throttled (vs healthy silence).

import { createLogger } from './logger.js';

const log = createLogger('RpcRetry');

const DEFAULT_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 800;
const MAX_DELAY_MS = 8_000;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimit(err) {
    if (!err) return false;
    if (err.status === 429 || err?.cause?.status === 429) return true;
    const raw = String(err?.message || err || '').toLowerCase();
    return raw.includes('429') || raw.includes('too many requests') || raw.includes('rate limit');
}

function isTransientNetwork(err) {
    if (!err) return false;
    const raw = String(err?.message || err || '').toLowerCase();
    return (
        raw.includes('network request failed')
        || raw.includes('failed to fetch')
        || raw.includes('socket hang up')
        || raw.includes('econnreset')
        || raw.includes('etimedout')
        || raw.includes('timeout')
        || raw.includes('fetch failed')
    );
}

/**
 * Run an RPC call with automatic retry on rate-limit / transient network
 * errors. Uses exponential backoff capped at MAX_DELAY_MS.
 *
 * @param {() => Promise<any>} fn   Async work to run.
 * @param {object} [opts]
 * @param {number} [opts.retries=DEFAULT_RETRIES]
 * @param {number} [opts.baseDelayMs=DEFAULT_BASE_DELAY_MS]
 * @param {string} [opts.label]     Optional label for log breadcrumbs.
 * @returns {Promise<any>}
 */
export async function withRpcRetry(fn, opts = {}) {
    const retries = opts.retries ?? DEFAULT_RETRIES;
    const base = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    const label = opts.label || 'rpc';

    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            const retryable = isRateLimit(err) || isTransientNetwork(err);
            if (attempt === retries || !retryable) break;
            const wait = Math.min(MAX_DELAY_MS, base * Math.pow(1.5, attempt));
            log.warn(`${label}: retrying after ${Math.round(wait)}ms (attempt ${attempt + 1}/${retries})`, {
                code: isRateLimit(err) ? '429' : 'NET',
            });
            await delay(wait);
        }
    }
    throw lastErr;
}

export default { withRpcRetry };
