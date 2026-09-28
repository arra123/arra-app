import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { agentKeyFrom } from '@/lib/push';

/** Нажали на уведомление «агент закончил» — открываем этого агента. */
export function usePushOpen() {
  const handled = useRef<string | null>(null);
  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const key = agentKeyFrom(lastResponse);
    const id = lastResponse?.notification.request.identifier ?? null;
    if (!key || !id || handled.current === id) return;
    handled.current = id;
    router.navigate('/');
    router.push({ pathname: '/agent/[key]', params: { key } });
  }, [lastResponse]);
}
