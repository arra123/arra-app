import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '@/lib/api';

// Пока приложение открыто, уведомление всё равно показываем баннером:
// сервер не шлёт push про агента, чей экран сейчас открыт.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Разрешение на уведомления + Expo push-токен на сервер. Тихо, без падений. */
export async function registerForPush() {
  if (!Device.isDevice || Platform.OS === 'web') return;
  try {
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/push/token', { body: { token: data, platform: Platform.OS } });
  } catch {
    // нет сети или симулятор — попробуем при следующем запуске
  }
}

/** Ключ агента из нажатого уведомления. */
export function agentKeyFrom(response: Notifications.NotificationResponse | null | undefined): string | null {
  const data = response?.notification.request.content.data as { type?: string; agentKey?: string } | undefined;
  return data?.type === 'ara.agent' && typeof data.agentKey === 'string' ? data.agentKey : null;
}
