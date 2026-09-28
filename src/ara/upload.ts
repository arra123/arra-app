import { api } from '@/lib/api';

export type LocalPhoto = { uri: string; name: string; mime: string };

/** Фото с телефона → файл на компьютере агента. Возвращает путь на компьютере. */
export async function uploadPhoto(photo: LocalPhoto, target: { agentKey: string } | { device: string }) {
  const form = new FormData();
  form.append('file', { uri: photo.uri, name: photo.name, type: photo.mime } as unknown as Blob);
  const query = 'agentKey' in target
    ? `agentKey=${encodeURIComponent(target.agentKey)}`
    : `device=${encodeURIComponent(target.device)}`;
  const res = await api<{ path: string }>(`/ara/upload?${query}`, { method: 'POST', form, timeoutMs: 180_000 });
  return res.path;
}

/** Голос → текст (Whisper на сервере). */
export async function transcribe(uri: string) {
  const form = new FormData();
  form.append('file', { uri, name: 'voice.m4a', type: 'audio/m4a' } as unknown as Blob);
  const res = await api<{ text: string }>('/ai/transcribe', { method: 'POST', form, timeoutMs: 90_000 });
  return (res.text || '').trim();
}
