import { AppState } from 'react-native';

import type { Agent } from '@/ara/types';
import { api } from '@/lib/api';

import { ringsActivity, ringsWidget, type RingsProps } from './arra-widgets.ios';
import { ringsProps } from './props';

type Activity = ReturnType<typeof ringsActivity.start>;
let current: Activity | null = null;
let lastActivity = '';
let lastWidget = '';
let lastWidgetAt = 0;
let started = false;
let serial: Promise<void> = Promise.resolve();
let status = 'ещё не запускался';

/** What the widgets are doing: shown in Settings → Тесты, to see why the lock screen block is missing. */
export function widgetStatus() { return status; }

/**
 * Keeps the home screen widget and the lock screen Live Activity («Кольца»)
 * in step with the agents. The app updates them while it runs; when it is
 * closed the server moves the Live Activity by APNs (its push token is sent
 * to /push/activity).
 */
export function syncWidgets(agents: Agent[]) {
  const props = ringsProps(agents);
  const key = JSON.stringify({ ...props, updated: 0 });
  serial = serial.then(async () => {
    if (!started) {
      started = true;
      // a Live Activity left from a previous run: pick it up
      current = ringsActivity.getInstances()[0] ?? null;
      if (current) watchToken(current);
    }
    // the home screen widget: at most every 20 s (iOS rations reloads)
    if (key !== lastWidget && Date.now() - lastWidgetAt > 20_000) {
      lastWidget = key;
      lastWidgetAt = Date.now();
      ringsWidget.updateSnapshot(props);
    }
    if (key === lastActivity) return;
    lastActivity = key;
    const live = props.working + props.waiting > 0;
    if (!live) {
      // 'immediate': an ended block used to stay on the lock screen for hours, empty
      if (current) await current.end('immediate', props);
      current = null;
      status = 'агентов в работе нет — блок не нужен';
      return;
    }
    if (current) {
      await current.update(props);
      status = `обновлён: ${props.working} работают, ${props.waiting} ждут`;
    } else if (AppState.currentState === 'active') {
      // iOS lets an app start a Live Activity only while it is on screen
      current = ringsActivity.start(props, 'arra://');
      watchToken(current);
      status = `запущен: ${props.working} работают, ${props.waiting} ждут`;
    } else status = 'приложение не на экране — iOS не даёт запустить блок';
  }).catch((error) => { status = 'ошибка: ' + String(error); console.warn('Arra widgets:', String(error)); });
}

function watchToken(activity: Activity) {
  const send = (token: string | null) => {
    if (token) api('/push/activity', { body: { token } }).then(() => { status += ' · токен на сервере'; }).catch((e) => { status += ' · токен не ушёл: ' + String(e); });
    else status += ' · токена пуша нет';
  };
  activity.addPushTokenListener((event) => send(event.pushToken));
  activity.getPushToken().then(send).catch(() => {});
}

export type { RingsProps };
