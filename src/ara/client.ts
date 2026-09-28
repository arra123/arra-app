import { AppState } from 'react-native';

import { API_URL } from '@/lib/api';

import type { AraState, FileScope, RemoteFile, Transcript } from './types';

type Listener = () => void;
type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
type AskHandlers = {
  onDelta: (text: string) => void;
  onAction?: (action: Record<string, unknown>) => void;
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const WS_URL = API_URL.replace(/^http/, 'ws') + '/client';
const EMPTY: AraState = {
  connected: false,
  loaded: false,
  agents: [],
  recent: [],
  devices: { laptop: { online: false, via: null }, pc: { online: false, via: null } },
};

let seq = 0;
const nextId = () => `m${Date.now().toString(36)}${(++seq).toString(36)}`;

/**
 * Один WebSocket на всё приложение: состояние агентов, подписка на переписку,
 * команды с ответами по reqId и поток ответов Ары. Переподключается сам,
 * проверяет живость пингом и при возвращении приложения из фона.
 */
class AraClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private state: AraState = EMPTY;
  private listeners = new Set<Listener>();
  private transcripts = new Map<string, Transcript>();
  private transcriptListeners = new Set<Listener>();
  private pending = new Map<string, Pending>();
  private asks = new Map<string, AskHandlers>();
  private files = new Map<string, Promise<RemoteFile>>();
  private watchers: string[] = [];
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private appStateSub: { remove: () => void } | null = null;

  // ---------- жизненный цикл ----------

  start(token: string) {
    if (this.token === token && this.ws) return;
    this.stop();
    this.token = token;
    this.connect();
    this.appStateSub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !this.token) return;
      // После фона iOS мог тихо убить сокет — проверяем сразу, а не ждём пинга
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || Date.now() - this.lastMessageAt > 30_000) this.reconnectNow();
      else this.send({ type: 'ara.refresh' });
    });
  }

  stop() {
    this.token = null;
    this.appStateSub?.remove();
    this.appStateSub = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.failAll('Нет связи с сервером');
    this.transcripts.clear();
    this.files.clear();
    this.setState(EMPTY);
  }

  private reconnectNow() {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retry = 0;
    this.connect();
  }

  private connect() {
    if (!this.token) return;
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.retry = 0;
      this.lastMessageAt = Date.now();
      this.setState({ ...this.state, connected: true });
      this.send({ type: 'ara.hello' });
      const watch = this.watchers[this.watchers.length - 1];
      if (watch) this.send({ type: 'ara.subscribe', agentKey: watch });
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        if (Date.now() - this.lastMessageAt > 45_000) this.reconnectNow();
        else this.send({ type: 'ping' });
      }, 15_000);
    };
    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      this.lastMessageAt = Date.now();
      let msg: any;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      this.handle(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.failAll('Связь с сервером прервалась');
      this.setState({ ...this.state, connected: false });
      if (!this.token) return;
      const delay = Math.min(15_000, 700 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {
      /* onclose придёт следом */
    };
  }

  private failAll(message: string) {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(message));
      this.pending.delete(id);
    }
    for (const [id, a] of this.asks) {
      clearTimeout(a.timer);
      a.reject(new Error(message));
      this.asks.delete(id);
    }
  }

  private send(msg: Record<string, unknown>): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  private handle(msg: any) {
    switch (msg?.type) {
      case 'ara.state':
        this.setState({
          connected: true,
          loaded: true,
          agents: msg.agents || [],
          recent: msg.recent || [],
          devices: msg.devices || EMPTY.devices,
        });
        return;
      case 'ara.transcript':
        if (msg.agentKey && msg.data) {
          this.transcripts.set(msg.agentKey, msg.data);
          this.transcriptListeners.forEach((l) => l());
        }
        return;
      case 'ara.result': {
        const p = this.pending.get(msg.reqId);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(msg.reqId);
        if (msg.ok === false) p.reject(new Error(msg.error || 'Не получилось'));
        else p.resolve(msg);
        return;
      }
      case 'ara.ask.delta':
      case 'ara.ask.action':
      case 'ara.ask.done':
      case 'ara.ask.error': {
        const a = this.asks.get(msg.reqId);
        if (!a) return;
        if (msg.type === 'ara.ask.delta') a.onDelta(String(msg.text || ''));
        else if (msg.type === 'ara.ask.action') a.onAction?.(msg.action || {});
        else {
          clearTimeout(a.timer);
          this.asks.delete(msg.reqId);
          if (msg.type === 'ara.ask.done') a.resolve();
          else a.reject(new Error(msg.error || msg.text || 'Ара не ответила'));
          return;
        }
        this.armAsk(msg.reqId);
        return;
      }
      default:
    }
  }

  // ---------- состояние для React ----------

  private setState(next: AraState) {
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  subscribeState = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  /** Заголовки для скачивания файлов с сервера (картинки, видео). */
  authHeaders(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  subscribeTranscripts = (listener: Listener) => {
    this.transcriptListeners.add(listener);
    return () => this.transcriptListeners.delete(listener);
  };

  getTranscript = (key: string) => this.transcripts.get(key) || null;

  /** Экран агента открыт — компьютер шлёт переписку при каждом изменении. */
  watch(key: string) {
    this.watchers.push(key);
    this.send({ type: 'ara.subscribe', agentKey: key });
    return () => {
      const i = this.watchers.lastIndexOf(key);
      if (i >= 0) this.watchers.splice(i, 1);
      const top = this.watchers[this.watchers.length - 1];
      this.send(top ? { type: 'ara.subscribe', agentKey: top } : { type: 'ara.unsubscribe' });
    };
  }

  refresh() {
    if (!this.send({ type: 'ara.refresh' })) this.reconnectNow();
  }

  // ---------- команды ----------

  request<T = Record<string, unknown>>(msg: Record<string, unknown>, timeoutMs = 30_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const reqId = nextId();
      if (!this.send({ ...msg, reqId })) {
        reject(new Error('Нет связи с сервером'));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error('Компьютер не ответил'));
      }, timeoutMs);
      this.pending.set(reqId, { resolve, reject, timer });
    });
  }

  sendText(agentKey: string, text: string, images: string[] = []) {
    return this.request({ type: 'ara.send', agentKey, text, images });
  }

  stopAgent(agentKey: string) {
    return this.request({ type: 'ara.stop', agentKey });
  }

  setModel(agentKey: string, model: string) {
    return this.request({ type: 'ara.model', agentKey, model });
  }

  launch(params: { device: string; agent: string; dir: string; task: string; model?: string }) {
    return this.request({ type: 'ara.launch', ...params }, 45_000);
  }

  private armAsk(reqId: string) {
    const a = this.asks.get(reqId);
    if (!a) return;
    clearTimeout(a.timer);
    a.timer = setTimeout(() => {
      this.asks.delete(reqId);
      a.reject(new Error('Ара не ответила'));
    }, 200_000);
  }

  ask(
    params: { chatId: string; prompt: string; history: { role: string; text: string }[]; style: string; model: string },
    onDelta: (text: string) => void,
    onAction?: (action: Record<string, unknown>) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const reqId = nextId();
      if (!this.send({ type: 'ara.ask', reqId, ...params })) {
        reject(new Error('Нет связи с сервером'));
        return;
      }
      this.asks.set(reqId, { onDelta, onAction, resolve, reject, timer: setTimeout(() => {}, 0) });
      this.armAsk(reqId);
    });
  }

  /** Картинка/видео с компьютера → ссылка на сервере (кешируется на сеанс). */
  file(path: string, scope: FileScope): Promise<RemoteFile> {
    const cacheKey = `${'agentKey' in scope ? scope.agentKey : scope.chatId}\n${path}`;
    const cached = this.files.get(cacheKey);
    if (cached) return cached;
    const promise = this.request<RemoteFile>({ type: 'ara.file', path, ...scope }, 150_000).then((res) => ({
      url: `${API_URL}${res.url}`,
      mime: res.mime,
      name: res.name,
      size: res.size,
    }));
    promise.catch(() => this.files.delete(cacheKey));
    this.files.set(cacheKey, promise);
    return promise;
  }
}

export const ara = new AraClient();
