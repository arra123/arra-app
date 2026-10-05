import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

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

let registration: Promise<boolean> | null = null;
let registeredToken = '';
let status = 'Подключаем уведомления…';
export function pushRegistrationStatus() { return status; }

/** Permission and server registration are separate: retry transient failures. */
export function registerForPush(requestPermission = true): Promise<boolean> {
  if (!Device.isDevice || Platform.OS === 'web') return Promise.resolve(false);
  if (registration) return registration;
  registration = (async () => {
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain && requestPermission) {
      permission = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: true } });
    }
    const allowed = permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!allowed) { status = 'Уведомления выключены в iOS'; return false; }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (data !== registeredToken) {
      await api('/push/token', { body: { token: data, platform: Platform.OS }, timeoutMs: 15000 });
      registeredToken = data;
    }
    status = permission.ios?.allowsAlert === false ? 'Доставка подключена · баннеры выключены в iOS' : 'Доставка подключена';
    return true;
  })().catch((error) => {
    status = 'Не удалось подключить доставку · повторим при восстановлении связи';
    throw error;
  }).finally(() => { registration = null; });
  return registration;
}

export function watchPushRegistration() {
  if (!Device.isDevice || Platform.OS === 'web') return () => {};
  const retry = () => { registerForPush(false).catch(() => {}); };
  registeredToken = '';
  registerForPush().catch(() => {});
  const appState = AppState.addEventListener('change', state => {
    if (state === 'active') { registeredToken = ''; retry(); }
  });
  const token = Notifications.addPushTokenListener(() => { registeredToken = ''; retry(); });
  const timer = setInterval(() => {
    if (AppState.currentState === 'active' && !registeredToken) retry();
  }, 30000);
  return () => { appState.remove(); token.remove(); clearInterval(timer); registeredToken = ''; };
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
