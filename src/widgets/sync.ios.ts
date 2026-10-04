import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type { Agent } from '@/ara/types';
import { api } from '@/lib/api';

import { addPushToStartTokenListener } from 'expo-widgets';

import { ringsActivity, ringsWidget, type RingsProps } from './arra-widgets.ios';
import { ringsProps } from './props';
import { compactDialogProps } from '../../shared/dialog-widget';

type Activity = ReturnType<typeof ringsActivity.start>;
let current: Activity | null = null;
let lastActivity = '';
let lastWidget = '';
let lastWidgetAt = 0;
let started = false;
const RENDERER_KEY = 'arra-widget-renderer';
const RENDERER_VERSION = '4';
let serial: Promise<void> = Promise.resolve();
let status = 'ещё не запускался';
let latestAgents: Agent[] | null = null;
let tokenListener: { remove(): void } | null = null;

AppState.addEventListener('change', (state) => {
  if (state === 'active' && latestAgents) {
    // Reconcile OS-ended blocks even when the agent snapshot is unchanged.
    started = false;
    lastActivity = '';
    syncWidgets(latestAgents);
  }
});

/** What the widgets are doing: shown in Settings → Тесты, to see why the lock screen block is missing. */
export function widgetStatus() { return status; }

/**
 * Keeps the home screen widget and the lock screen Live Activity («Кольца»)
 * in step with the agents. The app updates them while it runs; when it is
 * closed the server moves the Live Activity by APNs (its push token is sent
 * to /push/activity).
 */
let startTokenSent = false;
let widgetTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWidget: RingsProps | null = null;

function updateHomeWidget(props: RingsProps) {
  pendingWidget = props;
  if (widgetTimer) return;
  const flush = () => {
    widgetTimer = null;
    const next = pendingWidget;
    if (!next) return;
    const key = JSON.stringify({ ...next, updated: 0 });
    if (key === lastWidget) return;
    ringsWidget.updateSnapshot(next);
    lastWidget = key;
    lastWidgetAt = Date.now();
  };
  const delay = Math.max(0, 5000 - (Date.now() - lastWidgetAt));
  if (!delay) flush();
  else widgetTimer = setTimeout(flush, delay);
}

export function syncWidgets(agents: Agent[]) {
  latestAgents = agents;
  // the server may start the block while the app is closed: it needs this token
  if (!startTokenSent) {
    startTokenSent = true;
    try {
      addPushToStartTokenListener((event) => {
        if (event.activityPushToStartToken) api('/push/activity-start', { body: { token: event.activityPushToStartToken, layoutVersion: 2 } }).catch(() => {});
      });
    } catch { /* an older system: the block starts only from the app */ }
  }
  const all = ringsProps(agents);
  // One persistent card, every open dialog, including idle agents. Its native
  // selection is stored separately, so snapshots and pushes never reset it.
  updateHomeWidget(all);
  const props = compactDialogProps(all);
  const key = JSON.stringify({ ...props, updated: 0 });
  serial = serial.then(async () => {
    if (!started) {
      // Version 130 reused old, sometimes already-ended activities. Replace
      // their archived layout once, while iOS permits starting a fresh block.
      if (AppState.currentState !== 'active') return;
      tokenListener?.remove();
      tokenListener = null;
      const instances = ringsActivity.getInstances();
      if (await SecureStore.getItemAsync(RENDERER_KEY) !== RENDERER_VERSION) {
        for (const instance of instances) await instance.end('immediate');
        current = null;
      } else {
        current = instances[0] ?? null;
        for (const duplicate of instances.slice(1)) await duplicate.end('immediate');
      }
      started = true;
      if (current) watchToken(current);
    }
    if (key === lastActivity) return;
    const live = props.agents.length > 0;
    if (!live) {
      // 'immediate': an ended block used to stay on the lock screen for hours, empty
      if (current) await current.end('immediate', props);
      tokenListener?.remove();
      tokenListener = null;
      current = null;
      lastActivity = key;
      status = 'нет открытых диалогов — блок закрыт';
      return;
    }
    if (current) {
      await current.update(props);
      status = `обновлён: ${props.working} работают, ${props.waiting} ждут`;
    } else if (AppState.currentState === 'active') {
      // iOS lets an app start a Live Activity only while it is on screen
      current = ringsActivity.start(props, 'arra://');
      watchToken(current);
      await SecureStore.setItemAsync(RENDERER_KEY, RENDERER_VERSION);
      status = `запущен: ${props.working} работают, ${props.waiting} ждут`;
    } else { status = 'приложение не на экране — iOS не даёт запустить блок'; return; }
    lastActivity = key;
  }).catch((error) => { status = 'ошибка: ' + String(error); console.warn('Arra widgets:', String(error)); });
}

function watchToken(activity: Activity) {
  const send = (token: string | null) => {
    if (token) api('/push/activity', { body: { token, layoutVersion: 2 } }).then(() => { status += ' · токен на сервере'; }).catch((e) => { status += ' · токен не ушёл: ' + String(e); });
    else status += ' · токена пуша нет';
  };
  tokenListener?.remove();
  tokenListener = activity.addPushTokenListener((event) => send(event.pushToken));
  activity.getPushToken().then(send).catch(() => {});
}

export type { RingsProps };
