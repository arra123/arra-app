import { AppState } from 'react-native';

import type { Agent } from '@/ara/types';
import { api } from '@/lib/api';

import { addPushToStartTokenListener } from 'expo-widgets';

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
/** An agent «needs you» for this long after it stopped; then the block leaves by itself. */
const FRESH_MS = 15 * 60_000;
let startTokenSent = false;

export function syncWidgets(agents: Agent[]) {
  // the server may start the block while the app is closed: it needs this token
  if (!startTokenSent) {
    startTokenSent = true;
    try {
      addPushToStartTokenListener((event) => {
        if (event.activityPushToStartToken) api('/push/activity-start', { body: { token: event.activityPushToStartToken } }).catch(() => {});
      });
    } catch { /* an older system: the block starts only from the app */ }
  }
  const all = ringsProps(agents);
  // the home screen widget shows everyone; the lock screen block only who needs you now
  const nowMs = Date.now();
  const calling = agents.filter((a) => (a.state === 'waiting' || a.state === 'error') && a.since && nowMs - a.since < FRESH_MS);
  const props: RingsProps = { ...ringsProps(calling), working: all.working };
  const key = JSON.stringify({ ...props, updated: 0, agents: props.agents.map((a) => a.key) });
  serial = serial.then(async () => {
    if (!started) {
      started = true;
      // a Live Activity left from a previous run: pick it up
      current = ringsActivity.getInstances()[0] ?? null;
      if (current) watchToken(current);
    }
    // the home screen widget: at most every 20 s (iOS rations reloads)
    const widgetKey = JSON.stringify({ ...all, updated: 0 });
    if (widgetKey !== lastWidget && Date.now() - lastWidgetAt > 20_000) {
      lastWidget = widgetKey;
      lastWidgetAt = Date.now();
      ringsWidget.updateSnapshot(all);
    }
    if (key === lastActivity) return;
    lastActivity = key;
    const live = props.agents.length > 0;
    if (!live) {
      // 'immediate': an ended block used to stay on the lock screen for hours, empty
      if (current) await current.end('immediate', props);
      current = null;
      status = 'никто не ждёт ответа — блок не показывается';
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
