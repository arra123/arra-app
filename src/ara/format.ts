import type { SFSymbol } from 'sf-symbols-typescript';

import { Colors } from '@/constants/theme';

import type { Agent, AgentState, DeviceId, Transcript } from './types';

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

/** «3 мин», «2 ч 5 мин», «4 дн» */
export function duration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return 'меньше минуты';
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 && hours < 6 ? `${hours} ч ${minutes % 60} мин` : `${hours} ч`;
  return `${Math.floor(hours / 24)} дн`;
}

/** «только что», «5 мин», «3 ч», «2 дн» — для списков */
export function ago(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return '';
  const diff = now - ms;
  if (diff < 60_000) return 'сейчас';
  return duration(diff);
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

/** Строка «Работает 4 мин · сейчас: …» / «Закончил 3 мин назад · ждёт ответа». */
export function statusLine(agent: Agent | null, transcript: Transcript | null, now = Date.now()): string {
  if (!agent) {
    const last = transcript?.last ? transcript.last * 1000 : null;
    return last ? `Сессия завершена · ${ago(last, now)} назад` : 'Сессия завершена';
  }
  const lastUser = transcript?.lastUser ? transcript.lastUser * 1000 : null;
  const last = transcript?.last ? transcript.last * 1000 : null;
  switch (agent.state) {
    case 'working': {
      const from = lastUser || agent.since;
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

/** Пути к картинкам/видео в тексте (для ответов Ары). */
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
