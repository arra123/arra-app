import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';

import { API_URL, getToken } from '@/lib/api';

export type LocalPhoto = { uri: string; name: string; mime: string };

// Файлы — через uploadAsync, как в прежней «Ноде»: fetch с FormData на iOS
// падал ещё до отправки («Нет связи с сервером»), сервер запроса не видел.
async function upload<T>(path: string, uri: string, mime: string, timeoutMs: number): Promise<T> {
  const token = await getToken();
  const run = uploadAsync(`${API_URL}${path}`, uri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: mime,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Сервер не отвечает. Попробуй ещё раз.')), timeoutMs);
  });
  let res: Awaited<typeof run>;
  try {
    res = await Promise.race([run, timeout]);
  } catch (e: any) {
    throw new Error(e?.message?.startsWith('Сервер') ? e.message : 'Нет связи с сервером');
  } finally {
    clearTimeout(timer);
  }
  let data: any = null;
  try {
    data = res.body ? JSON.parse(res.body) : null;
  } catch {
    data = null;
  }
  if (res.status >= 400) throw new Error(data?.error || `Ошибка сервера (${res.status})`);
  return data as T;
}

/** Фото с телефона → файл на компьютере агента. Возвращает путь на компьютере. */
export async function uploadPhoto(photo: LocalPhoto, target: { agentKey: string } | { device: string }) {
  const query = 'agentKey' in target
    ? `agentKey=${encodeURIComponent(target.agentKey)}`
    : `device=${encodeURIComponent(target.device)}`;
  const res = await upload<{ path: string }>(`/ara/upload?${query}`, photo.uri, photo.mime, 180_000);
  return res.path;
}

/** Голос → текст (Whisper на сервере). */
export async function transcribe(uri: string) {
  const res = await upload<{ text: string }>('/ai/transcribe', uri, 'audio/m4a', 90_000);
  return (res.text || '').trim();
}
