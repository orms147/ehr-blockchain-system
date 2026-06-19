// In-memory, per-identity sliding-window rate limiter.
//
// Answers advisor feedback #7 ("giới hạn rate/cost theo người dùng"): the
// monthly 100-signature quota (relayer.service.js consumeQuota) caps long-term
// COST per user; this middleware caps short-term RATE so a single authenticated
// wallet cannot burst dozens of sponsored transactions in seconds — which would
// drain the sponsor wallet / RPC budget and race the on-chain nonce.
//
// Keyed on the AUTHENTICATED wallet (relayer abuse is per-identity, not per-IP),
// so it MUST be mounted AFTER `authenticate`. If no wallet is present it defers
// to downstream auth rather than blocking.
//
// Thesis-scale: process-local Map. A multi-instance production deployment would
// back this with Redis + a shared clock (documented as future work). Mirrors
// the naive limiter already inlined in emergency.routes.js, generalised + reusable.

import { createLogger } from '../utils/logger.js';

const log = createLogger('RateLimit');

export function rateLimitByWallet({
    windowMs = 60_000,
    max = 20,
    code = 'RATE_LIMITED',
    message,
} = {}) {
    const buckets = new Map(); // wallet -> { count, windowStart }

    return function rateLimit(req, res, next) {
        const wallet = req.user?.walletAddress?.toLowerCase();
        if (!wallet) return next();

        const now = Date.now();

        // Opportunistic sweep so the Map can't grow unbounded over a long uptime
        // across many distinct wallets.
        if (buckets.size > 10_000) {
            for (const [w, b] of buckets) {
                if (now - b.windowStart > windowMs) buckets.delete(w);
            }
        }

        const bucket = buckets.get(wallet);
        if (!bucket || now - bucket.windowStart > windowMs) {
            buckets.set(wallet, { count: 1, windowStart: now });
            return next();
        }

        bucket.count += 1;
        if (bucket.count > max) {
            const retryAfterSec = Math.max(1, Math.ceil((bucket.windowStart + windowMs - now) / 1000));
            res.set('Retry-After', String(retryAfterSec));
            log.warn('Rate limit exceeded', { wallet, count: bucket.count, max, windowMs });
            return res.status(429).json({
                code,
                error: message || `Quá nhiều yêu cầu (tối đa ${max} mỗi ${Math.round(windowMs / 1000)} giây). Vui lòng thử lại sau ${retryAfterSec} giây.`,
            });
        }

        return next();
    };
}

export default rateLimitByWallet;
