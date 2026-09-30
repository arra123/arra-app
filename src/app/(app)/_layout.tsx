import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { ara } from '@/ara/client';
import { Colors } from '@/constants/theme';
import { getToken } from '@/lib/api';
import { registerForPush } from '@/lib/push';
import { usePushOpen } from '@/lib/use-push-open';

export default function AppLayout() {
  usePushOpen();

  // Вошли — открываем канал к серверу и регистрируем push
  useEffect(() => {
    let alive = true;
    getToken().then((token) => {
      if (alive && token) ara.start(token);
    });
    registerForPush();
    return () => {
      alive = false;
      ara.stop();
    };
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        fullScreenGestureEnabled: true,
        gestureEnabled: true,
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="agent/[key]" options={{ animation: 'fade', animationDuration: 220 }} />
      {/* «Чат | Работа»: мягкая смена экрана, как вкладки, а не въезд сбоку */}
      <Stack.Screen name="chat/[id]" options={{ animation: 'fade', animationDuration: 220 }} />
      <Stack.Screen name="ask" />
      <Stack.Screen
        name="new"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.82, 1],
          sheetGrabberVisible: true,
          sheetCornerRadius: 28,
          contentStyle: { backgroundColor: Colors.card },
        }}
      />
      <Stack.Screen name="settings" options={{ presentation: 'modal', contentStyle: { backgroundColor: Colors.background } }} />
      <Stack.Screen name="tests" options={{ presentation: 'modal', contentStyle: { backgroundColor: Colors.background } }} />
    </Stack>
  );
}
