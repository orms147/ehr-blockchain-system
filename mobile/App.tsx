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
import walletActionService from './src/services/walletAction.service';
import QueryProvider from './src/providers/QueryProvider';
import { initSentry, Sentry } from './src/lib/sentry';

initSentry();

function App() {
  const colorScheme = useColorScheme();
  const { loadToken, isLoading } = useAuthStore();

  useEffect(() => {
    loadToken();

    // Warm up Web3Auth at app start to fail fast with actionable errors.
    walletActionService.initializeWeb3Auth().catch((error) => {
      console.warn('[Web3Auth] init warning:', error?.message || error);
    });
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

