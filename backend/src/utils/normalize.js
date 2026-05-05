// Canonical normalize helpers (S16 R2). Previously duplicated across 6 files
// with subtly different behavior — passthrough vs null on non-string,
// strict regex vs lenient lowercase. The 2 functions here are the strictest
// variants; callers that previously had looser checks rely on truthy/falsy
// downstream so they're compatible with the strict null return.

/**
 * Lowercase a wallet address. Returns null on non-string input.
 * Use everywhere a 0x-prefixed Ethereum address is expected.
 */
export function normalizeAddress(value) {
    return typeof value === 'string' ? value.toLowerCase() : null;
}

/**
 * Lowercase + validate a 32-byte hex hash (cidHash, recordTypeHash, txHash, etc.).
 * Returns null if not a string OR doesn't match `0x[64 hex]`.
 *
 * The regex check defends against malformed event args from chain decoders or
 * upstream callers that bypass zod validation. Originally enforced only in
 * consentLedgerSync.service.js — promoted here as the canonical behavior so a
 * malformed hash never silently reaches the DB.
 */
export function normalizeHash(value) {
    if (typeof value !== 'string') return null;
    return /^0x[a-fA-F0-9]{64}$/.test(value) ? value.toLowerCase() : null;
}
