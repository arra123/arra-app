import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import type { FileScope } from './types';
import { uploadPhoto } from './upload';

export type VideoReview = { id: string; source: string; seconds: number; size: [number, number]; strokes: [number, number][][] };
const drafts = new Map<string, VideoReview[]>();
const listeners = new Set<() => void>();
const empty: VideoReview[] = [];
const keyFor = (scope: FileScope) => 'agentKey' in scope ? scope.agentKey : `chat:${scope.chatId}`;
let loaded = false;
function storageFile() { return new File(Paths.document, 'video-review-drafts.json'); }
function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = Platform.OS === 'web' ? localStorage.getItem('video-review-drafts') : storageFile().exists ? storageFile().textSync() : null;
    if (raw) for (const [key, value] of Object.entries(JSON.parse(raw))) drafts.set(key, value as VideoReview[]);
  } catch { /* A corrupt old draft must not stop the player. */ }
}
function persist() {
  const raw = JSON.stringify(Object.fromEntries(drafts));
  if (Platform.OS === 'web') localStorage.setItem('video-review-drafts', raw);
  else { const file = storageFile(); file.create({ overwrite: true }); file.write(raw); }
}
export function setVideoReview(scope: FileScope, review: VideoReview) {
  load();
  const key = keyFor(scope);
  const next = (drafts.get(key) || []).filter(r => r.id !== review.id);
  drafts.set(key, review.strokes.length ? [...next, review] : next);
  persist();
  listeners.forEach(fn => fn());
}
export function useVideoReviews(scope?: FileScope) {
  load();
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => scope ? drafts.get(keyFor(scope)) || empty : empty, () => empty);
}
export function clearVideoReviews(scope: FileScope, reviews: VideoReview[]) {
  const key = keyFor(scope);
  drafts.set(key, (drafts.get(key) || []).filter(r => !reviews.includes(r)));
  persist();
  listeners.forEach(fn => fn());
}
export async function uploadVideoReviews(scope: FileScope, reviews: VideoReview[], device: 'pc' | 'laptop' = 'laptop') {
  const paths: string[] = [];
  for (const review of reviews) {
    const name = `${review.id}.ara-review.json`;
    const json = JSON.stringify(review);
    let uri: string;
    if (Platform.OS === 'web') uri = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    else {
      const file = new File(Paths.cache, name);
      file.create({ overwrite: true }); file.write(json); uri = file.uri;
    }
    try {
      paths.push(await uploadPhoto({ uri, name, mime: 'application/json' },
        'agentKey' in scope ? scope : { device, ...('chatId' in scope ? { chatId: scope.chatId } : {}) }));
    } finally { if (Platform.OS === 'web') URL.revokeObjectURL(uri); }
  }
  return paths;
}
export function videoReviewText(reviews: VideoReview[]) {
  return reviews.map(r => `Правка видео: ${r.source}\nТаймкод: ${r.seconds.toFixed(3)} с. Рисунок на кадре приложен.`).join('\n\n');
}
