import { Platform } from 'react-native';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SplashOverlay, type SplashVariant } from '@/components/splash-overlay';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.background,
    card: Colors.background,
    text: Colors.text,
    border: Colors.separator,
    primary: Colors.text,
  },
};

// the preview on a computer can ask for a splash variant: /?splash=wave
const SPLASH_FROM_URL = (Platform.OS === 'web' && typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('splash') : null) as SplashVariant | null;

function Splash() {
  const { loading } = useAuth();
  return <SplashOverlay ready={!loading} variant={SPLASH_FROM_URL ?? 'roll'} />;
}

function Gate() {
  const { user, loading } = useAuth();
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Protected guard={loading}>
        <Stack.Screen name="loading" />
      </Stack.Protected>
      <Stack.Protected guard={!loading && !user}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={!loading && !!user}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // Проверяем OTA-обновление при каждом запуске и применяем сразу
  useEffect(() => {
    if (__DEV__) return;
    (async () => {
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // нет сети / уже последняя версия
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ThemeProvider value={theme}>
            <AuthProvider>
              <StatusBar style="light" />
              <Gate />
              <Splash />
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
