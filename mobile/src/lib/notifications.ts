/**
 * Push notification listener wiring.
 *
 * Two-tier listener model:
 *   - addNotificationReceivedListener: foreground notifications (app open).
 *     We log + let the system show the heads-up via the existing handler.
 *   - addNotificationResponseReceivedListener: user tapped notification (any state).
 *     We deeplink into the screen specified by `data.screen` + `data.params`.
 *
 * Backend convention (see backend/src/services/push.service.js sendPushToWallet):
 *   notification.data = { screen?: string, params?: object, kind?: string }
 *
 * expo-notifications native module is unavailable in Expo Go (SDK 53+); we lazy
 * require it so this module is safe to import in any environment.
 */

import Constants from 'expo-constants';
import { safeNavigate } from './navigationRef';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

let cleanupFn: (() => void) | null = null;

export function setupNotificationListeners(): () => void {
    if (IS_EXPO_GO) {
        console.log('[Push] Expo Go detected — listeners disabled');
        return () => {};
    }

    let Notifications: any;
    try {
        Notifications = require('expo-notifications');
    } catch (err: any) {
        console.warn('[Push] expo-notifications module unavailable:', err?.message || err);
        return () => {};
    }

    // Foreground arrival — system handler already shows the banner; we only log.
    const receivedSub = Notifications.addNotificationReceivedListener((notification: any) => {
        const data = notification?.request?.content?.data;
        console.log('[Push] received foreground:', notification?.request?.content?.title, data);
    });

    // Tap response — works in foreground/background/killed (when launched via tap).
    const responseSub = Notifications.addNotificationResponseReceivedListener((response: any) => {
        const data = response?.notification?.request?.content?.data;
        if (!data) return;
        const screen = data.screen as string | undefined;
        const params = data.params as Record<string, unknown> | undefined;
        if (screen) {
            console.log('[Push] tap → navigate', screen, params);
            // Slight delay to ensure NavigationContainer is mounted on cold start.
            setTimeout(() => safeNavigate(screen, params), 100);
        }
    });

    cleanupFn = () => {
        receivedSub?.remove?.();
        responseSub?.remove?.();
        cleanupFn = null;
    };
    return cleanupFn;
}

export function teardownNotificationListeners() {
    if (cleanupFn) cleanupFn();
}
