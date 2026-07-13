import * as SecureStore from 'expo-secure-store';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://aura.5.42.122.102.sslip.io';

const TOKEN_KEY = 'aura_token';

let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    cachedToken = null; // SecureStore недоступен (напр. web) — не валим приложение
  }
  return cachedToken;
}

export async function setToken(token: string | null) {
  cachedToken = token;
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* SecureStore недоступен — держим токен в памяти */
  }
}

type Options = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  /** Для multipart — передать FormData напрямую */
  form?: FormData;
};

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.auth !== false) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form as unknown as BodyInit;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method || (body ? 'POST' : 'GET'),
      headers,
      body,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    throw new Error(e?.name === 'AbortError' ? 'Сервер не отвечает. Попробуй ещё раз.' : 'Нет связи с сервером');
  }
  clearTimeout(timer);

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Ошибка ${res.status}`);
  }
  return data as T;
}
