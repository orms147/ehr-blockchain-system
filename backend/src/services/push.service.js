// Expo Push Notifications sender.
// Uses Expo's HTTP API directly — no SDK dependency. Works for unauthenticated
// push (no project secret required). For production scale switch to expo-server-sdk
// to get receipts + chunking.
import { createLogger } from '../utils/logger.js';
import prisma from '../config/database.js';

const log = createLogger('Push');

const EXPO_API = 'https://exp.host/--/api/v2/push/send';

const isExpoToken = (t) => typeof t === 'string' && t.startsWith('ExponentPushToken[');

/**
 * Send push notification to a single wallet address.
 * Silently no-ops if user has no token registered.
 */
export async function sendPushToWallet(walletAddress, { title, body, data = {} }) {
    if (!walletAddress) return { skipped: true, reason: 'no-address' };

    const user = await prisma.user.findUnique({
        where: { walletAddress: walletAddress.toLowerCase() },
        select: { expoPushToken: true },
    });

    if (!user?.expoPushToken) {
        return { skipped: true, reason: 'no-token' };
    }

    if (!isExpoToken(user.expoPushToken)) {
        log.warn('Invalid expo token format', { walletAddress });
        return { skipped: true, reason: 'invalid-token' };
    }

    const message = {
        to: user.expoPushToken,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
    };

    try {
        const res = await fetch(EXPO_API, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            log.error('Expo push failed', { status: res.status, body: text });
            return { ok: false, status: res.status };
        }

        const json = await res.json();
        log.info('Push sent', { walletAddress, title });
        return { ok: true, data: json };
    } catch (err) {
        log.error('Expo push error', { error: err?.message });
        return { ok: false, error: err?.message };
    }
}

export const pushService = { sendPushToWallet };
export default pushService;
