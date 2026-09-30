import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '@/lib/api';

/** The agent whose screen is open now: its news are seen right there. */
let openAgentKey: string | null = null;
export function setOpenAgent(key: string | null) { openAgentKey = key; }

// While the app is open a notification still shows as a banner, except for
// the agent whose chat is open: that one is on the screen already (it came
// as «Claude закончил» while you were reading its answer)
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as { agentKey?: string } | undefined;
      const here = !!openAgentKey && data?.agentKey === openAgentKey;
      return { shouldShowBanner: !here, shouldShowList: !here, shouldPlaySound: !here, shouldSetBadge: false };
    },
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

/** Уведомление от самого телефона (без сервера Apple): баннер «агент закончил». */
export function localNotify(title: string, body: string, agentKey: string) {
  if (Platform.OS === 'web') return;
  Notifications.scheduleNotificationAsync({
    content: { title, body, sound: 'default', data: { type: 'ara.agent', agentKey } },
    trigger: null,
  }).catch(() => {});
}
