/// <reference types="nativewind/types" />
import 'fast-text-encoding';
import '@tamagui/native/setup-zeego';
import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider } from 'tamagui';

import { tamaguiConfig } from './tamagui.config';
import AppNavigator from './src/navigation/AppNavigator';
import useAuthStore from './src/store/authStore';
import LoadingSpinner from './src/components/LoadingSpinner';
import QueryProvider from './src/providers/QueryProvider';
import { initSentry, Sentry } from './src/lib/sentry';
import { setupNotificationListeners } from './src/lib/notifications';

initSentry();

// Filter noisy console.error from Web3Auth SDK when user cancels login modal.
// SDK logs "login flow failed with error type dismiss" before throwing; we already
// handle the throw silently, so drop the log to avoid red-screen in dev.
{
  const originalError = console.error;
  const SILENCED_PATTERNS = [
    'login flow failed with error type dismiss',
    'user closed',
    'user cancelled',
    'user canceled',
  ];
  console.error = (...args: any[]) => {
    const joined = args
      .map((a) => (typeof a === 'string' ? a : a?.message || ''))
      .join(' ')
      .toLowerCase();
    if (SILENCED_PATTERNS.some((p) => joined.includes(p))) return;
    originalError(...args);
  };
}

function App() {
  const colorScheme = useColorScheme();
  const { loadToken, isLoading } = useAuthStore();

  useEffect(() => {
    // loadToken verifies both JWT and Web3Auth session; if Web3Auth has no
    // hydrated private key on cold start, it clears auth state so the UI
    // lands directly on LoginScreen instead of flashing a dashboard then
    // redirecting.
    loadToken();

    // Wire notification tap → deeplink. Returns cleanup fn for unmount.
    const cleanup = setupNotificationListeners();
    return cleanup;
  }, [loadToken]);

  return (
    <QueryProvider>
      <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
        <SafeAreaProvider>
          {isLoading ? (
            <LoadingSpinner message="Dang khoi tao ung dung..." />
          ) : (
            <>
              <AppNavigator />
              <StatusBar style="auto" />
            </>
          )}
        </SafeAreaProvider>
      </TamaguiProvider>
    </QueryProvider>
  );
}

export default Sentry.wrap(App);

