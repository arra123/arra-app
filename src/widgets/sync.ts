import type { Agent } from '@/ara/types';

/** Widgets exist on iOS only (sync.ios.ts); elsewhere nothing to do. */
export function syncWidgets(_agents: Agent[]) {}

export function widgetStatus() { return 'только на iPhone'; }
