import { AppState } from 'react-native';
import type { Agent } from '@/ara/types';
import { api } from '@/lib/api';
import { ringsActivity, ringsWidget } from './arra-widgets.ios';

let running = false;
let published = false;
let serverDisabled = false;
let status = 'Новый разговор · кнопка';

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    serverDisabled = false;
    syncWidgets([]);
  }
});

export function widgetStatus() { return status; }

/** Keep the existing widget kind so installed widgets become shortcuts too. */
export function syncWidgets(_agents: Agent[]) {
  if (running || AppState.currentState !== 'active') return;
  running = true;
  (async () => {
    if (!published) {
      ringsWidget.updateSnapshot({ agents: [], working: 0, waiting: 0, updated: 0 });
      published = true;
    }
    // Migration only: never start or update a Live Activity again.
    for (const activity of ringsActivity.getInstances()) await activity.end('immediate');
    if (!serverDisabled) {
      await api('/push/activity', { method: 'DELETE', timeoutMs: 15000 });
      serverDisabled = true;
    }
    status = 'Новый разговор · кнопка; лента отключена';
  })().catch((error) => {
    status = 'Кнопка готова; закрытие старой ленты повторится: ' + String(error);
  }).finally(() => { running = false; });
}

export type { RingsProps } from './arra-widgets.ios';
