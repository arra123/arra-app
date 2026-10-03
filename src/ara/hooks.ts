import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { ara } from './client';
import type { Agent, RecentSession, Transcript } from './types';

export function useAra() {
  return useSyncExternalStore(ara.subscribeState, ara.getState);
}

/** Живой агент или недавняя сессия по ключу. */
export function useAgentItem(key: string): { agent: Agent | null; recent: RecentSession | null } {
  const state = useAra();
  return {
    agent: state.agents.find((a) => a.key === key) || null,
    recent: state.recent.find((r) => r.key === key) || null,
  };
}

/** Переписка агента; пока экран смонтирован, компьютер присылает изменения. */
export function useTranscript(key: string): Transcript | null {
  useEffect(() => ara.watch(key), [key]);
  const get = useCallback(() => ara.getTranscript(key), [key]);
  return useSyncExternalStore(ara.subscribeTranscripts, get);
}

/** Текущее время, обновляемое раз в interval мс — для «Работает 4 мин». */
export function useNow(interval = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}
