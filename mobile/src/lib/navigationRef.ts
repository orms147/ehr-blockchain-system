import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * Global navigation ref so non-component code (push notification handlers,
 * deep links, background events) can navigate without being inside a screen.
 *
 * Attach to <NavigationContainer ref={navigationRef}> in AppNavigator.
 */
export const navigationRef = createNavigationContainerRef<any>();

/**
 * Safe navigate that no-ops if the navigation tree isn't ready yet.
 * Useful for events that arrive before the user has finished login.
 */
export function safeNavigate(name: string, params?: any) {
    if (navigationRef.isReady()) {
        navigationRef.navigate(name, params);
    }
}
