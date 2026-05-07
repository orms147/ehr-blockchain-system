import 'fast-text-encoding';
import '@tamagui/native/setup-zeego';
import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider } from 'tamagui';
import {
    useFonts as useFraunces,
    Fraunces_400Regular,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Fraunces_400Regular_Italic,
} from '@expo-google-fonts/fraunces';
import {
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
} from '@expo-google-fonts/be-vietnam-pro';
import { NotoSerif_400Regular, NotoSerif_700Bold } from '@expo-google-fonts/noto-serif';

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

  // Load brand fonts (Fraunces serif headings + DM Sans body) and Vietnamese
  // fallback fonts (Be Vietnam Pro, Noto Serif) for diacritics. Tamagui font
  // tokens reference these by family name; if they're not loaded yet the OS
  // substitutes system serif/sans which mangles "ữ", "ặ", "ề" combining
  // marks. We block initial render until at least the primary fonts are
  // ready — fonts are bundled, so this resolves in <100ms on cold start.
  const [fontsLoaded] = useFraunces({
    Fraunces_400Regular,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Fraunces_400Regular_Italic,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    NotoSerif_400Regular,
    NotoSerif_700Bold,
  });

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

  // Brand brief mandates dark mode default. We respect the system color
  // scheme as an override (light mode if user has explicitly set system
  // light theme), but fall back to dark when the system reports neither.
  const themeName = colorScheme === 'light' ? 'light' : 'dark';

  return (
    <QueryProvider>
      <TamaguiProvider config={tamaguiConfig} defaultTheme={themeName}>
        <SafeAreaProvider>
          {(!fontsLoaded || isLoading) ? (
            <LoadingSpinner message="Đang khởi tạo ứng dụng..." />
          ) : (
            <>
              <AppNavigator />
              <StatusBar style={themeName === 'dark' ? 'light' : 'dark'} />
            </>
          )}
        </SafeAreaProvider>
      </TamaguiProvider>
    </QueryProvider>
  );
}

export default Sentry.wrap(App);

