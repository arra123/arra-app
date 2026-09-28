import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useEffect, useRef } from 'react';

import { ara } from '@/ara/client';
import { Colors } from '@/constants/theme';
import { getToken } from '@/lib/api';
import { agentKeyFrom, registerForPush } from '@/lib/push';

export default function AppLayout() {
  const handled = useRef<string | null>(null);
  const lastResponse = Notifications.useLastNotificationResponse();

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

  // Нажали на уведомление «агент закончил» — открываем этого агента
  useEffect(() => {
    const key = agentKeyFrom(lastResponse);
    const id = lastResponse?.notification.request.identifier ?? null;
    if (!key || !id || handled.current === id) return;
    handled.current = id;
    router.navigate('/');
    router.push({ pathname: '/agent/[key]', params: { key } });
  }, [lastResponse]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        fullScreenGestureEnabled: true,
        gestureEnabled: true,
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="agent/[key]" />
      <Stack.Screen name="chat/[id]" />
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
    </Stack>
  );
}
