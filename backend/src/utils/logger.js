/**
 * Structured Logger Utility
 * Thin wrapper around console for contextual, structured logging.
 * No external dependencies — sufficient for academic project.
 *
 * Usage:
 *   import { createLogger } from '../utils/logger.js';
 *   const log = createLogger('RecordRoutes');
 *   log.info('Record created', { wallet, cidHash, txHash });
 *   // → [RecordRoutes] Record created {"wallet":"0x...","cidHash":"0x..."}
 */

function formatContext(context) {
    if (!context || typeof context !== 'object' || Object.keys(context).length === 0) {
        return '';
    }

    // Truncate long values (wallet addresses, hashes) for readability
    const cleaned = {};
    for (const [key, value] of Object.entries(context)) {
        if (value === undefined || value === null) continue;
        cleaned[key] = value;
    }

    if (Object.keys(cleaned).length === 0) return '';

    try {
        return ` ${JSON.stringify(cleaned, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`;
    } catch {
        return ` ${String(cleaned)}`;
    }
}

function timestamp() {
    return new Date().toISOString();
}

export function createLogger(module) {
    const prefix = `[${module}]`;

    return {
        info(message, context = {}) {
            console.log(`${timestamp()} ${prefix} ${message}${formatContext(context)}`);
        },

        warn(message, context = {}) {
            console.warn(`${timestamp()} ${prefix} ${message}${formatContext(context)}`);
        },

        error(message, context = {}) {
            console.error(`${timestamp()} ${prefix} ${message}${formatContext(context)}`);
        },

        debug(message, context = {}) {
            if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug') {
                console.log(`${timestamp()} ${prefix} [DEBUG] ${message}${formatContext(context)}`);
            }
        },
    };
}
