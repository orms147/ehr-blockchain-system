import * as Sentry from '@sentry/react-native';

/**
 * Sentry init. Call once at app start before rendering.
 *
 * DSN is read from EXPO_PUBLIC_SENTRY_DSN. If unset, init is a no-op so
 * dev builds without a DSN don't spam warnings.
 */
export function initSentry() {
    const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
    if (!dsn) {
        if (__DEV__) {
            console.log('[Sentry] EXPO_PUBLIC_SENTRY_DSN not set — skipping init');
        }
        return;
    }

    Sentry.init({
        dsn,
        enableAutoSessionTracking: true,
        // Lower in prod to control quota; full traces in dev for debugging.
        tracesSampleRate: __DEV__ ? 1.0 : 0.2,
        environment: __DEV__ ? 'development' : 'production',
        // Don't leak request bodies / headers by default.
        sendDefaultPii: false,
        beforeSend(event) {
            // Strip any auth tokens that might have leaked into breadcrumbs.
            if (event.request?.headers) {
                delete (event.request.headers as any).Authorization;
                delete (event.request.headers as any).authorization;
            }
            return event;
        },
    });
}

/**
 * Tag the current Sentry scope with authenticated user info.
 * Address only — no PII.
 */
export function setSentryUser(user: { id?: string | number; walletAddress?: string } | null) {
    if (!user) {
        Sentry.setUser(null);
        return;
    }
    Sentry.setUser({
        id: user.id ? String(user.id) : undefined,
        username: user.walletAddress,
    });
}

export { Sentry };
