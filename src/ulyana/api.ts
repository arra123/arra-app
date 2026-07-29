import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';

import { API_URL, api, getToken } from '@/lib/api';

// ---------- Типы ----------
export type Cry = {
  id: string;
  intensity: number;
  reason: string | null;
  duration_min: number;
  napkins: number;
  mood_before: string | null;
  mood_after: string | null;
  score: number;
  verdict: string | null;
  recommendation: string | null;
  note: string | null;
  media_kind: 'image' | 'video' | 'audio' | 'file' | null;
  media_mime: string | null;
  has_media: boolean;
  created_at: string;
};

export type CryStats = {
  total: number;
  avg_intensity: number;
  total_minutes: number;
  total_napkins: number;
  max_intensity: number;
  liters: number;
  top_reason: string | null;
  top_reason_n: number;
};

export type PingMatch = {
  id: string;
  player_a: string;
  player_b: string;
  sets_a: number;
  sets_b: number;
  sets: { a: number; b: number }[];
  winner: 'a' | 'b' | null;
  best_of: number;
  created_at: string;
};

// ---------- Слёзометр ----------
export async function createCry(body: Partial<Cry>) {
  const { cry } = await api<{ cry: Cry }>('/cry', { body });
  return cry;
}

export async function uploadCryMedia(cryId: string, uri: string, name: string) {
  const token = await getToken();
  const res = await uploadAsync(`${API_URL}/cry/${cryId}/media`, uri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (res.status >= 400) throw new Error('Не удалось загрузить медиа (' + res.status + ')');
}

export async function listCries() {
  const { cries } = await api<{ cries: Cry[] }>('/cry');
  return cries;
}

export async function deleteCry(id: string) {
  await api(`/cry/${id}`, { method: 'DELETE' });
}

export async function cryStats() {
  const { stats } = await api<{ stats: CryStats }>('/cry/stats');
  return stats;
}

export function cryMediaUrl(id: string) {
  return `${API_URL}/cry/${id}/media`;
}

// ---------- Пинг-Контроль ----------
export async function savePingMatch(body: Partial<PingMatch>) {
  const { match } = await api<{ match: PingMatch }>('/pingpong', { body });
  return match;
}

export async function listPingMatches() {
  const { matches } = await api<{ matches: PingMatch[] }>('/pingpong');
  return matches;
}

export async function deletePingMatch(id: string) {
  await api(`/pingpong/${id}`, { method: 'DELETE' });
}

// ---------- ИИ-Ульяна ----------
export async function aiDiagnose(input: {
  intensity: number;
  reason: string | null;
  duration: number;
  note?: string | null;
  mood_before?: string | null;
  mood_after?: string | null;
  score?: number;
}) {
  return api<{ verdict: string | null; recommendation: string | null }>('/ulyana/diagnose', {
    body: input,
  });
}

export type ChatMsg = { role: 'user' | 'assistant'; content: string };

export async function aiChat(messages: ChatMsg[]) {
  const { reply } = await api<{ reply: string }>('/ulyana/chat', { body: { messages } });
  return reply;
}
