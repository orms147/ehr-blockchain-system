import * as SentryRN from '@sentry/react-native';

// Pass-through wrap used when Sentry is not initialized (no DSN). Avoids the
// "Sentry.wrap was called before Sentry.init" warning in dev builds.
const identityWrap = <T,>(component: T): T => component;

export const Sentry = {
    ...SentryRN,
    wrap: ((component: any) => {
        if (!process.env.EXPO_PUBLIC_SENTRY_DSN) return identityWrap(component);
        return SentryRN.wrap(component);
    }) as typeof SentryRN.wrap,
};

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

    SentryRN.init({
        dsn,
        enableAutoSessionTracking: true,
        // Lower in prod to control quota; full traces in dev for debugging.
        tracesSampleRate: __DEV__ ? 1.0 : 0.2,
        profilesSampleRate: __DEV__ ? 1.0 : 0.1,
        enableNativeFramesTracking: true,
        environment: __DEV__ ? 'development' : 'production',
        // Session Replay intentionally DISABLED. App renders patient EHR
        // data; recording screens would leak medical PII to Sentry SaaS.
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

