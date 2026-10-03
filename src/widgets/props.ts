import type { Agent } from '@/ara/types';

import type { RingsProps } from './arra-widgets.ios';

/** Agents → the rings: working and waiting ones, the ones that just finished. */
export function ringsProps(agents: Agent[], now = Date.now()): RingsProps {
  const shown = agents
    .filter((a) => a.state === 'working' || a.state === 'waiting' || a.state === 'error')
    .sort((a, b) => Number(b.state === 'working') - Number(a.state === 'working'));
  return {
    agents: shown.map((a) => ({
      key: a.key,
      mascotId: a.mascotId || 0,
      title: a.title || a.project,
      project: a.project,
      state: a.state === 'working' ? 'work' : a.state === 'waiting' ? 'wait' : 'done',
      min: a.since ? Math.max(0, Math.round((now - a.since) / 60000)) : 0,
      where: a.device === 'pc' ? 'ПК' : 'ноутбук',
      // the task in one short line (the whole state must stay under 4 KB)
      note: (a.task || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    })),
    working: shown.filter((a) => a.state === 'working').length,
    waiting: shown.filter((a) => a.state === 'waiting').length,
    updated: now,
  };
}
