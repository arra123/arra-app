import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { DefaultTheme, ThemeProvider } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AuthScreen } from '@/components/auth-screen';
import { AuthProvider, useAuth } from '@/lib/auth';
import { registerPush } from '@/lib/push';

function Gate() {
  const { user, loading } = useAuth();

  // После входа — регистрируем push-уведомления (файл получен, Claude закончил и т.п.)
  useEffect(() => {
    if (user) registerPush();
  }, [user]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return user ? <AppTabs /> : <AuthScreen />;
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
        <ThemeProvider value={DefaultTheme}>
          <AuthProvider>
            <AnimatedSplashOverlay />
            <Gate />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
