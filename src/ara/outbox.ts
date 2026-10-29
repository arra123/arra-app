import { Directory, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { ara } from '@/ara/client';
import { rememberAttachment, uploadPhoto, type LocalPhoto } from '@/ara/upload';

/**
 * Исходящие сообщения агентам, как в Telegram: фото и текст сначала ложатся
 * в очередь на телефоне (файл + копии фото), потом грузятся и отправляются.
 * Очередь переживает уход с экрана, сворачивание и перезапуск приложения:
 * прерванное дозагружается само, а после нескольких неудач сообщение
 * остаётся с кнопкой «Повторить».
 */
export type OutboxPhoto = LocalPhoto & { path?: string; progress: number };
export type OutboxState = 'uploading' | 'sending' | 'sent' | 'failed';
export type OutboxItem = {
  id: string;
  agentKey: string;
  text: string;
  photos: OutboxPhoto[];
  /** Уже загруженные пути (кадры с рисунком), идут перед фото */
  extra: string[];
  state: OutboxState;
  error?: string;
  attempts: number;
  at: number;
  sentAt?: number;
  /** Сколько сообщений пользователя было в переписке, когда это отправили */
  index: number;
  /** Следующая попытка не раньше */
  retryAt?: number;
};

const FILE_NAME = 'ara-outbox.json';
const MAX_ATTEMPTS = 4;
const BACKOFF = [2_000, 5_000, 12_000, 30_000];
const KEEP_SENT_MS = 120_000;

let items: OutboxItem[] = [];
let loaded = false;
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const waiters = new Map<string, { resolve: () => void; reject: (e: Error) => void }[]>();
const landed = new Set<string>();

function file() {
  return new File(Paths.document, FILE_NAME);
}

function folder() {
  return new Directory(Paths.document, 'outbox');
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const f = file();
    if (f.exists) {
      const saved = JSON.parse(f.textSync()) as OutboxItem[];
      const now = Date.now();
      items = (Array.isArray(saved) ? saved : []).filter((i) => i.state !== 'sent' || now - (i.sentAt || i.at) < KEEP_SENT_MS);
      for (const item of items) for (const photo of item.photos) rememberAttachment(photo);
    }
  } catch {
    items = [];
  }
  cleanFolder();
  AppState.addEventListener('change', (state) => { if (state === 'active') kick(0); });
  kick(500);
}

/** Копии старше суток больше не нужны ни очереди, ни миниатюрам в ленте. */
function cleanFolder() {
  try {
    const dir = folder();
    if (!dir.exists) return;
    const used = new Set(items.flatMap((i) => i.photos.map((p) => p.uri)));
    for (const entry of dir.list()) {
      if (!(entry instanceof File) || used.has(entry.uri)) continue;
      const modified = entry.modificationTime || 0;
      if (modified && Date.now() - modified > 86_400_000) entry.delete();
    }
  } catch {
    /* не страшно: место освободится в следующий раз */
  }
}

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const f = file();
      if (!f.exists) f.create();
      f.write(JSON.stringify(items));
    } catch {
      /* очередь останется в памяти до перезапуска */
    }
  }, 150);
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

function patch(id: string, change: Partial<OutboxItem> | ((item: OutboxItem) => OutboxItem)) {
  items = items.map((i) => (i.id === id ? (typeof change === 'function' ? change(i) : { ...i, ...change }) : i));
  emit();
}

function settle(id: string, error?: Error) {
  for (const w of waiters.get(id) || []) {
    if (error) w.reject(error);
    else w.resolve();
  }
  waiters.delete(id);
}

/** Фото из кэша пикера копируется к себе: iOS может почистить кэш, пока ждём. */
function keepCopy(photo: LocalPhoto, id: string, n: number): LocalPhoto {
  if (Platform.OS === 'web') return photo;
  try {
    const dir = folder();
    if (!dir.exists) dir.create({ intermediates: true });
    const safe = photo.name.replace(/[^\w.\-]+/g, '_').slice(-60) || 'photo.jpg';
    const target = new File(dir, `${id}-${n}-${safe}`);
    if (!target.exists) new File(photo.uri).copy(target);
    return rememberAttachment({ ...photo, uri: target.uri });
  } catch {
    return photo;
  }
}

function kick(delay: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void run(); }, delay);
}

async function run() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      if (AppState.currentState !== 'active' && Platform.OS !== 'web') break;
      const next = items.find((i) => i.state === 'uploading' || i.state === 'sending');
      if (!next) break;
      if (next.retryAt && next.retryAt > Date.now()) { kick(next.retryAt - Date.now()); break; }
      await process(next.id);
    }
  } finally {
    running = false;
    cleanSent();
  }
}

async function process(id: string) {
  let item = items.find((i) => i.id === id);
  if (!item) return;
  try {
    if (item.state === 'sending' && item.attempts > 0) {
      // the send was cut off (app closed): it may already be in the terminal.
      // The open chat marks it as landed when the computer's log shows it.
      await new Promise((r) => setTimeout(r, 4_000));
      if (landed.has(id)) { patch(id, { state: 'sent', sentAt: Date.now(), error: undefined }); settle(id); return; }
    }
    if (item.state === 'uploading') {
      for (let n = 0; n < item.photos.length; n++) {
        const photo = item.photos[n];
        if (photo.path) continue;
        // a cut-off upload starts over: its ring starts over too
        patch(id, (i) => ({ ...i, photos: i.photos.map((p, k) => (k === n ? { ...p, progress: 0 } : p)) }));
        const path = await uploadPhoto(photo, { agentKey: item.agentKey }, (fraction) => {
          patch(id, (i) => ({ ...i, photos: i.photos.map((p, k) => (k === n ? { ...p, progress: Math.max(p.progress, fraction) } : p)) }));
        });
        patch(id, (i) => ({ ...i, photos: i.photos.map((p, k) => (k === n ? { ...p, path, progress: 1 } : p)) }));
      }
      patch(id, { state: 'sending' });
    }
    item = items.find((i) => i.id === id);
    if (!item) return;
    patch(id, (i) => ({ ...i, attempts: i.attempts + 1 }));
    await ara.sendText(item.agentKey, item.text, [...item.extra, ...item.photos.map((p) => p.path!).filter(Boolean)]);
    patch(id, { state: 'sent', sentAt: Date.now(), error: undefined, attempts: 0 });
    settle(id);
  } catch (e: any) {
    const error = String(e?.message || e || 'Не отправилось');
    const current = items.find((i) => i.id === id);
    if (!current) return;
    // the phone went to the background: not a real failure, carry on when it is back
    if (AppState.currentState !== 'active' && Platform.OS !== 'web') return;
    const attempts = current.state === 'uploading' ? current.attempts + 1 : current.attempts;
    if (attempts >= MAX_ATTEMPTS || /закрыт|не найден|пуст/i.test(error)) {
      patch(id, { state: 'failed', error, attempts });
      settle(id, new Error(error));
      return;
    }
    const retryAt = Date.now() + BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)];
    patch(id, { attempts, error, retryAt });
    kick(retryAt - Date.now());
  }
}

let cleanTimer: ReturnType<typeof setTimeout> | null = null;
function cleanSent() {
  if (cleanTimer) { clearTimeout(cleanTimer); cleanTimer = null; }
  const now = Date.now();
  const before = items.length;
  items = items.filter((i) => i.state !== 'sent' || (!landed.has(i.id) && now - (i.sentAt || i.at) < KEEP_SENT_MS));
  if (items.length !== before) emit();
  if (items.some((i) => i.state === 'sent')) cleanTimer = setTimeout(cleanSent, 15_000);
}

export const outbox = {
  /** Поставить сообщение в очередь. Возвращает его id сразу, отправка идёт сама. */
  enqueue(agentKey: string, text: string, photos: LocalPhoto[], extra: string[] = [], index = 0) {
    load();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const kept = photos.map((p, n) => ({ ...keepCopy(p, id, n), progress: 0 }));
    items = [...items, { id, agentKey, text, photos: kept, extra, state: kept.length ? 'uploading' : 'sending', attempts: 0, at: Date.now(), index }];
    emit();
    kick(0);
    return id;
  },
  /** Дождаться, пока сообщение уйдёт (или окончательно не уйдёт). */
  wait(id: string) {
    const item = items.find((i) => i.id === id);
    if (item?.state === 'sent') return Promise.resolve();
    if (item?.state === 'failed') return Promise.reject(new Error(item.error || 'Не отправилось'));
    return new Promise<void>((resolve, reject) => {
      waiters.set(id, [...(waiters.get(id) || []), { resolve, reject }]);
    });
  },
  retry(id: string) {
    patch(id, (i) => ({ ...i, state: i.photos.every((p) => p.path) ? 'sending' : 'uploading', attempts: 0, error: undefined, retryAt: 0 }));
    kick(0);
  },
  remove(id: string) {
    items = items.filter((i) => i.id !== id);
    landed.delete(id);
    settle(id, new Error('Отменено'));
    emit();
  },
  /** Переписка компьютера уже показывает это сообщение: из очереди его можно убрать. */
  landed(id: string) {
    if (landed.has(id)) return;
    landed.add(id);
    const item = items.find((i) => i.id === id);
    if (item && item.state !== 'uploading' && item.state !== 'failed') {
      items = items.filter((i) => i.id !== id);
      settle(id);
      emit();
    }
  },
  subscribe(listener: () => void) {
    load();
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  snapshot() {
    load();
    return items;
  },
};

/** Очередь одного агента — для его экрана. */
export function useOutbox(agentKey: string) {
  const all = useSyncExternalStore(outbox.subscribe, outbox.snapshot, outbox.snapshot);
  return all.filter((i) => i.agentKey === agentKey);
}

/** Запустить очередь при старте приложения: недоотправленное уйдёт и без открытого чата. */
export function startOutbox() {
  load();
}
