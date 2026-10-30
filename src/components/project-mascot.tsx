import { AraMascot, type MascotBadge, type MascotMood } from './ara-mascot';
import { T } from './ui';

/** One ball, one colour per project — the same palette as in tito on the computer. */
export const MASCOT_COLORS: Record<number, string> = {
  0: '#ffffff', 3: '#ffd23f', 4: '#a887f5', 5: '#5cc4f5', 6: '#ff7aa8', 8: '#7ed35f', 11: '#f4505f',
  12: '#ff9442', 13: '#38d6bd', 14: '#5b8cff', 15: '#ff7aa8', 16: '#c9c2b6', 19: '#a887f5',
};

export function AgentNumber({ number, mascotId = 0 }: { number: number; mascotId?: number }) {
  return <T v="subhead" weight="700" color={MASCOT_COLORS[mascotId] || '#ffffff'} style={{ minWidth: 18, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{number || '—'}</T>;
}

/** How the ball shows an agent's state in lists: it thinks, it is stuck, it sleeps. */
export function stateLook(state?: string): { mood: MascotMood; badge?: MascotBadge; still: boolean } {
  if (state === 'working') return { mood: 'thinking', still: false };
  if (state === 'error') return { mood: 'sad', badge: 'error', still: false };
  if (state === 'old') return { mood: 'sleepy', still: false };
  return { mood: 'idle', still: true };
}

export function ProjectMascot({ id = 0, size = 40, still = false, mood = 'idle', interactive = false, badge }: {
  id?: number; size?: number; still?: boolean; mood?: MascotMood; interactive?: boolean; badge?: MascotBadge;
}) {
  return <AraMascot size={size} still={still} mood={mood} interactive={interactive} badge={badge} color={MASCOT_COLORS[id] || '#ffffff'} />;
}
