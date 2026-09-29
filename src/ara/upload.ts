import { File } from 'expo-file-system';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';

import { API_URL, getToken } from '@/lib/api';

export type LocalPhoto = { uri: string; name: string; mime: string };
const attachmentMime = new Map<string, string>();
export function rememberAttachment(file: LocalPhoto) {
  attachmentMime.set(file.uri, file.mime);
  return file;
}
export function isVideoAttachment(path: string) {
  return attachmentMime.get(path)?.startsWith('video/') || /\.(mp4|mov|m4v|webm)(?:[?#]|$)/i.test(path);
}

// Пока приложение открыто, сохраняем связь между путём на компьютере и
// оригиналом на телефоне. Тогда отправленное фото не превращается в пустую
// удалённую плитку в момент, когда сообщение появляется в расшифровке агента.
const localPhotoByPath = new Map<string, string>();

export function localPhotoUri(path: string) {
  return localPhotoByPath.get(path);
}

async function viaUploadAsync(path: string, uri: string, mime: string, token: string | null) {
  const res = await uploadAsync(`${API_URL}${path}`, uri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: mime,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return { status: res.status, body: res.body };
}

// Запасной путь: файл из expo-file-system — это Blob, его понимает fetch любого вида
async function viaFetch(path: string, uri: string, name: string, token: string | null) {
  const form = new FormData();
  form.append('file', new File(uri) as unknown as Blob, name);
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  return { status: res.status, body: await res.text() };
}

function withTimeout<T>(run: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Сервер не отвечает. Попробуй ещё раз.')), ms);
  });
  return Promise.race([run, timeout]).finally(() => clearTimeout(timer));
}

// Файлы — через uploadAsync, как в прежней «Ноде», а если он упал — через fetch.
// В ошибке показываем настоящую причину, чтобы её было видно на телефоне.
async function upload<T>(path: string, uri: string, name: string, mime: string, timeoutMs: number): Promise<T> {
  const token = await getToken();
  let res: { status: number; body: string } | null = null;
  const reasons: string[] = [];
  for (const attempt of [
    () => viaUploadAsync(path, uri, mime, token),
    () => viaFetch(path, uri, name, token),
  ]) {
    try {
      res = await withTimeout(attempt(), timeoutMs);
      break;
    } catch (e: any) {
      reasons.push(String(e?.message || e).slice(0, 120));
    }
  }
  if (!res) throw new Error(`Нет связи с сервером: ${reasons.join(' / ')}`);
  let data: any = null;
  try {
    data = res.body ? JSON.parse(res.body) : null;
  } catch {
    data = null;
  }
  if (res.status >= 400) {
    // Текст сервера как есть («Не распознал: …»); не JSON — хотя бы начало ответа
    const plain = !data && res.body ? res.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) : '';
    throw new Error(data?.error || data?.message || plain || `Ошибка сервера (${res.status})`);
  }
  return data as T;
}

/** Фото с телефона → файл на компьютере агента. Возвращает путь на компьютере. */
export async function uploadPhoto(photo: LocalPhoto, target: { agentKey: string } | { device: string }) {
  const query = 'agentKey' in target
    ? `agentKey=${encodeURIComponent(target.agentKey)}`
    : `device=${encodeURIComponent(target.device)}`;
  const res = await upload<{ path: string }>(`/ara/upload?${query}`, photo.uri, photo.name, photo.mime, photo.mime.startsWith('video/') ? 600_000 : 180_000);
  localPhotoByPath.set(res.path, photo.uri);
  attachmentMime.set(res.path, photo.mime);
  return res.path;
}

/** Голос → текст (Whisper на сервере). */
export async function transcribe(uri: string) {
  const res = await upload<{ text: string }>('/ai/transcribe', uri, 'voice.m4a', 'audio/m4a', 90_000);
  return (res.text || '').trim();
}
