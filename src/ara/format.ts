import type { SFSymbol } from 'sf-symbols-typescript';

import { Colors } from '@/constants/theme';

import type { Agent, AgentKind, AgentState, DeviceId, Limit, Limits, SubAgent, Transcript } from './types';

export const STATE_META: Record<AgentState, { label: string; color: string }> = {
  working: { label: 'работает', color: Colors.working },
  waiting: { label: 'ждёт ответа', color: Colors.waiting },
  error: { label: 'прервался', color: Colors.error },
  old: { label: 'давно', color: Colors.old },
};

export const DEVICE_META: Record<DeviceId, { label: string; icon: SFSymbol }> = {
  laptop: { label: 'Ноутбук', icon: 'laptopcomputer' },
  pc: { label: 'ПК', icon: 'desktopcomputer' },
};

export const AGENT_LABEL = { claude: 'Claude', codex: 'Codex' } as const;

/** Диалоги нумеруются внутри проекта, независимо от поиска и закрепления. */
export function agentNumber(agent: Agent, agents: Agent[]): number {
  return agents.filter((item) => item.device === agent.device && item.cwd === agent.cwd)
    .findIndex((item) => item.key === agent.key) + 1;
}

/** «3 мин», «2 ч 5 мин», «4 дн» */
export function duration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return 'меньше минуты';
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 && hours < 6 ? `${hours} ч ${minutes % 60} мин` : `${hours} ч`;
  return `${Math.floor(hours / 24)} дн`;
}

/** Коротко для шапки: «40 с», «4 мин», «2 ч 5 мин». */
export function shortAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} с`;
  return duration(ms);
}

/** «только что», «5 мин», «3 ч», «2 дн» — для списков */
export function ago(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return '';
  const diff = now - ms;
  if (diff < 60_000) return 'сейчас';
  return duration(diff);
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Время сообщения: «12:40», «вчера 12:40», «28 сен 12:40». ts — секунды unix. */
export function messageTime(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (days <= 0) return hm;
  if (days === 1) return `вчера ${hm}`;
  const year = d.getFullYear() !== today.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year} ${hm}`;
}

/** Сколько агент думал: «14 с», «2 мин 14 с», «1 ч 5 мин». */
export function tookLabel(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds || 0));
  if (!s) return '';
  if (s < 60) return `${s} с`;
  if (s < 3600) return `${Math.floor(s / 60)} мин ${s % 60} с`;
  return `${Math.floor(s / 3600)} ч ${Math.floor((s % 3600) / 60)} мин`;
}

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** Когда обновится лимит: «в 16:40», «завтра в 9:00», «в чт 21:00», «3 окт в 21:00». ts — секунды unix. */
export function resetLabel(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return `в ${hm}`;
  if (days === 1) return `завтра в ${hm}`;
  if (days < 7) return `в ${WEEKDAYS[d.getDay()]} ${hm}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} в ${hm}`;
}

/** Сколько процентов лимита осталось (с компьютера приходит израсходованное). */
export function limitLeft(used: number): number {
  return Math.max(0, Math.min(100, 100 - used));
}

/** Цвет по остатку: обычный, меньше 15% — жёлтый, меньше 5% — красный. */
export function limitColor(left: number | undefined, normal: string = Colors.textSecondary): string {
  if (left == null) return normal;
  if (left < 5) return Colors.error;
  if (left < 15) return Colors.waiting;
  return normal;
}

/** Лимит подписки для агента: Claude общий, Codex — того устройства, где агент. */
export function limitFor(limits: Limits | null, agent: AgentKind, device: DeviceId): Limit | null {
  if (!limits) return null;
  if (agent === 'claude') return limits.claude;
  return limits.codex?.[device === 'pc' ? 'pc' : 'laptop'] || null;
}

export function shortPath(path: string): string {
  return path.replace(/^\/home\/[^/]+/, '~');
}

export function baseName(path: string): string {
  return path.split('/').filter(Boolean).pop() || path;
}

/** «claude-opus-5-5» → «Opus 5.5», «claude-sonnet-4-5-20250929» → «Sonnet 4.5». */
export function modelLabel(model?: string | null): string {
  if (!model) return '';
  const claude = /(opus|sonnet|haiku|fable)[-_ ]?(\d+)?(?:[-_.](\d{1,2}))?(?!\d)/i.exec(model);
  if (claude) {
    const name = claude[1][0].toUpperCase() + claude[1].slice(1).toLowerCase();
    return claude[2] ? `${name} ${claude[2]}${claude[3] ? `.${claude[3]}` : ''}` : name;
  }
  return model.replace(/^gpt-/i, 'GPT-');
}

/** Material Symbols из ara-transcript → SF Symbols. */
const ICONS: Record<string, SFSymbol> = {
  description: 'doc.text',
  article: 'doc.text',
  draft: 'doc.text',
  terminal: 'terminal',
  code: 'chevron.left.forwardslash.chevron.right',
  data_object: 'curlybraces',
  edit: 'pencil',
  edit_note: 'square.and.pencil',
  edit_document: 'square.and.pencil',
  search: 'magnifyingglass',
  manage_search: 'doc.text.magnifyingglass',
  find_in_page: 'doc.text.magnifyingglass',
  image: 'photo',
  photo: 'photo',
  photo_camera: 'camera',
  screenshot: 'camera.viewfinder',
  movie: 'film',
  videocam: 'video',
  language: 'globe',
  public: 'globe',
  travel_explore: 'globe',
  web: 'globe',
  link: 'link',
  folder: 'folder',
  folder_open: 'folder',
  build: 'hammer',
  construction: 'hammer',
  handyman: 'wrench.and.screwdriver',
  checklist: 'checklist',
  list: 'list.bullet',
  task_alt: 'checkmark.circle',
  check: 'checkmark',
  check_circle: 'checkmark.circle',
  psychology: 'brain',
  smart_toy: 'cpu',
  memory: 'cpu',
  bolt: 'bolt',
  visibility: 'eye',
  delete: 'trash',
  download: 'arrow.down.circle',
  upload: 'arrow.up.circle',
  play_arrow: 'play',
  settings: 'gearshape',
  tune: 'slider.horizontal.3',
  content_copy: 'doc.on.doc',
  add: 'plus',
  send: 'paperplane',
  chat: 'bubble.left',
  forum: 'bubble.left.and.bubble.right',
  hub: 'point.3.connected.trianglepath.dotted',
  extension: 'puzzlepiece',
  schedule: 'clock',
  timer: 'timer',
  error: 'exclamationmark.triangle',
  warning: 'exclamationmark.triangle',
  info: 'info.circle',
  cloud: 'cloud',
  database: 'cylinder',
  storage: 'externaldrive',
  git: 'arrow.triangle.branch',
  commit: 'arrow.triangle.branch',
  merge: 'arrow.triangle.merge',
  call_split: 'arrow.triangle.branch',
};

export function stepIcon(icon?: string): SFSymbol {
  return (icon && ICONS[icon]) || 'circle.dashed';
}

/** Что агент делает прямо сейчас: последнее действие, иначе последняя просьба. */
export function currentActivity(agent: Agent | null, transcript: Transcript | null): string {
  const messages = transcript?.messages || [];
  const last = messages[messages.length - 1];
  if (last?.role === 'steps' && last.items.length) return last.items[last.items.length - 1].text;
  const inProgress = transcript?.plan?.find((p) => p.status === 'in_progress');
  if (inProgress) return inProgress.text;
  return agent?.title || agent?.task || '';
}

/**
 * Агент числится работающим, но сам давно (~20 с) ничего не пишет, а его
 * помощник жив — значит, агент ждёт помощника. Возвращает этого помощника.
 */
export function awaitedHelper(agent: Agent | null, transcript: Transcript | null, now = Date.now()): SubAgent | null {
  if (agent?.state !== 'working') return null;
  const helper = transcript?.agents?.find((a) => a.active);
  if (!helper) return null;
  const last = transcript?.last ? transcript.last * 1000 : 0;
  return last && now - last > 20_000 ? helper : null;
}

/** Строка «Работает 4 мин · сейчас: …» / «Закончил 3 мин назад · ждёт ответа». */
export function statusLine(agent: Agent | null, transcript: Transcript | null, now = Date.now()): string {
  if (agent?.compacting) return 'Сжатие контекста…';
  if (!agent) {
    const last = transcript?.last ? transcript.last * 1000 : null;
    return last ? `Сессия завершена · ${ago(last, now)} назад` : 'Сессия завершена';
  }
  const lastUser = transcript?.lastUser ? transcript.lastUser * 1000 : null;
  const last = transcript?.last ? transcript.last * 1000 : null;
  switch (agent.state) {
    case 'working': {
      const from = lastUser || agent.since;
      const helper = awaitedHelper(agent, transcript, now);
      if (helper) return `Ждёт помощника · ${helper.description}`;
      const doing = currentActivity(agent, transcript);
      const head = from ? `Работает ${duration(now - from)}` : 'Работает';
      return doing ? `${head} · сейчас: ${doing}` : head;
    }
    case 'waiting': {
      const at = last || agent.since;
      return at ? `Закончил ${ago(at, now) === 'сейчас' ? 'только что' : `${ago(at, now)} назад`} · ждёт ответа` : 'Ждёт ответа';
    }
    case 'error':
      return 'Прервался · напиши, что делать дальше';
    default: {
      const at = last || agent.since;
      return at ? `Последняя активность ${ago(at, now)} назад` : 'Давно без активности';
    }
  }
}

/** Пути к картинкам/видео в тексте (для ответов Arra). */
const MEDIA_RE = /(\/[^\s"'`<>()]+?\.(png|jpe?g|gif|webp|heic|mp4|mov|webm|m4v))(?=$|[\s"'`<>(),;:!?]|\.(?:\s|$))/gi;

export function mediaPaths(text: string): { images: string[]; videos: string[] } {
  const images = new Set<string>();
  const videos = new Set<string>();
  for (const match of text.matchAll(MEDIA_RE)) {
    if (/^(mp4|mov|webm|m4v)$/i.test(match[2])) videos.add(match[1]);
    else images.add(match[1]);
  }
  return { images: [...images], videos: [...videos] };
}
