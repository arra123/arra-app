import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '@/lib/api';

// Показывать уведомления и когда приложение открыто (баннер сверху).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const PROJECT_ID = '804ef682-ea7e-4d3f-9994-d578dd0e4c79';

/**
 * Запрашивает разрешение, получает Expo push-токен и отправляет его на бэкенд.
 * Вызывать после входа. Тихо ничего не делает, если разрешение не дали.
 */
export async function registerPush() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Arra',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const settings = await Notifications.getPermissionsAsync();
    let status = settings.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID })).data;
    if (token) await api('/push/token', { method: 'POST', body: { token, platform: Platform.OS } }).catch(() => {});
  } catch {
    // нет сети / не поддерживается — не критично
  }
}
