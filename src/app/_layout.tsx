import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import * as Linking from 'expo-linking';
import { DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/lib/auth';
import { parseQuickAction, setQuickAction } from '@/lib/quick-action';

// Секретный аккаунт: вход «ульяна» открывает совсем другое приложение (УльянаOS).
const SECRET_LOGIN = 'ульяна';

function Gate() {
  const { user, loading } = useAuth();
  const secret = user?.email?.trim().toLowerCase() === SECRET_LOGIN;

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Protected guard={loading}>
        <Stack.Screen name="loading" />
      </Stack.Protected>
      <Stack.Protected guard={!loading && !user}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={!loading && !!user && !secret}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!loading && !!user && secret}>
        <Stack.Screen name="ulyana" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // Грузим Inter в фоне — НЕ блокируем рендер (иначе экран висит, если шрифт качается/не дошёл по OTA)
  useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // По умолчанию приложение портретное; альбомную включает только удалённый экран.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  // Ссылки из виджета: сразу уводим на нужную вкладку и открываем форму.
  useEffect(() => {
    function handle(url: string | null) {
      const action = parseQuickAction(url);
      if (!action) return;
      router.navigate(action === 'note' ? '/notes' : '/');
      // Даём вкладке смонтироваться, иначе экран не услышит действие.
      setTimeout(() => setQuickAction(action), 260);
    }
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', (event) => handle(event.url));
    return () => sub.remove();
  }, []);

  // Жёсткая авто-проверка апдейта при каждом запуске: качаем и применяем сразу,
  // не полагаясь на капризное нативное поведение expo-updates (из-за него версия «застревала»).
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
        // нет сети / уже последняя — молча
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: '#F2F3F7', card: '#FFFFFF', primary: '#007AFF', border: '#D7D9E0' } }}>
          <AuthProvider>
            <AnimatedSplashOverlay />
            <Gate />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
