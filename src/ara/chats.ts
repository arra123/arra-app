import { File, Paths } from 'expo-file-system';
import { useCallback, useSyncExternalStore } from 'react';

import { ara } from './client';

export type AskStyle = 'brief' | 'talk';
export type AskModel = 'haiku' | 'sonnet' | 'opus';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: number;
  /** Пути к фото на компьютере (после загрузки) */
  images?: string[];
  /** Те же фото на телефоне — чтобы показать без сети */
  localImages?: string[];
  /** Что Ара сделала по ходу ответа (передала задачу агенту и т.п.) */
  actions?: string[];
  error?: string;
  streaming?: boolean;
};

export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  style: AskStyle;
  model: AskModel;
  messages: ChatMessage[];
};

type Saved = { chats: Chat[]; style: AskStyle; model: AskModel; current?: string | null };

const FILE_NAME = 'ara-chats.json';
const id = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function actionText(action: Record<string, unknown>): string {
  const text = action.text ?? action.title ?? action.summary;
  if (typeof text === 'string' && text.trim()) return text.trim();
  const kind = typeof action.kind === 'string' ? action.kind : typeof action.type === 'string' ? action.type : '';
  return kind ? `Действие: ${kind}` : 'Ара выполнила действие';
}

/**
 * Чаты с Арой живут на телефоне (файл в документах приложения).
 * Ответ приходит потоком с компьютера: ara.ask → ara.ask.delta → ara.ask.done.
 */
class ChatStore {
  private chats: Chat[] = [];
  private style: AskStyle = 'brief';
  private model: AskModel = 'sonnet';
  /** Диалог, открытый на вкладке «Разговор» */
  private currentId: string | null = null;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;

  private file() {
    return new File(Paths.document, FILE_NAME);
  }

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const file = this.file();
      if (!file.exists) return;
      const saved = JSON.parse(file.textSync()) as Saved;
      this.chats = (saved.chats || []).map((chat) => ({
        ...chat,
        // Ответ, оборванный закрытием приложения, больше не «печатается»
        messages: chat.messages.map((m) => (m.streaming ? { ...m, streaming: false, error: m.text ? undefined : 'Ответ прервался' } : m)),
      }));
      this.style = saved.style || 'brief';
      this.model = saved.model || 'sonnet';
      this.currentId = saved.current || null;
    } catch {
      this.chats = [];
    }
  }

  private persist() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const file = this.file();
        if (!file.exists) file.create();
        file.write(JSON.stringify({ chats: this.chats, style: this.style, model: this.model, current: this.currentId } satisfies Saved));
      } catch {
        /* нет места — чаты останутся в памяти до перезапуска */
      }
    }, 400);
  }

  private emit() {
    this.listeners.forEach((l) => l());
    this.persist();
  }

  subscribe = (listener: () => void) => {
    this.load();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getChats = () => {
    this.load();
    return this.chats;
  };

  get(chatId: string) {
    this.load();
    return this.chats.find((c) => c.id === chatId) || null;
  }

  defaults() {
    this.load();
    return { style: this.style, model: this.model };
  }

  create(): string {
    this.load();
    const now = Date.now();
    const chat: Chat = { id: id(), title: 'Новый чат', createdAt: now, updatedAt: now, style: this.style, model: this.model, messages: [] };
    this.chats = [chat, ...this.chats];
    this.emit();
    return chat.id;
  }

  getCurrentId = () => {
    this.load();
    return this.currentId && this.chats.some((c) => c.id === this.currentId) ? this.currentId : null;
  };

  /** Текущий диалог вкладки «Разговор»: последний открытый, иначе самый свежий, иначе новый пустой. */
  ensureCurrent(): string {
    const current = this.getCurrentId();
    if (current) return current;
    const latest = [...this.chats].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (latest) {
      this.currentId = latest.id;
      this.emit();
      return latest.id;
    }
    const created = this.create();
    this.currentId = created;
    this.emit();
    return created;
  }

  /** Переключиться на диалог; пустой диалог, из которого ушли, не копим. */
  open(chatId: string) {
    const previous = this.getCurrentId();
    if (previous === chatId) return;
    this.currentId = chatId;
    const left = previous ? this.get(previous) : null;
    if (left && !left.messages.length) this.chats = this.chats.filter((c) => c.id !== left.id);
    this.emit();
  }

  /** Новый диалог; если текущий и так пустой — остаёмся в нём. */
  startNew(): string {
    const current = this.getCurrentId();
    if (current && !this.get(current)?.messages.length) return current;
    const created = this.create();
    this.open(created);
    return created;
  }

  /** Убрать неудавшийся вопрос с ответом-ошибкой (перед повтором). */
  dropExchange(chatId: string, answerId: string) {
    this.update(chatId, (chat) => {
      const i = chat.messages.findIndex((m) => m.id === answerId);
      if (i < 0) return chat;
      const from = i > 0 && chat.messages[i - 1].role === 'user' ? i - 1 : i;
      return { ...chat, messages: [...chat.messages.slice(0, from), ...chat.messages.slice(i + 1)] };
    });
  }

  remove(chatId: string) {
    this.chats = this.chats.filter((c) => c.id !== chatId);
    if (this.currentId === chatId) this.currentId = null;
    this.emit();
  }

  clearAll() {
    this.chats = [];
    this.currentId = null;
    this.emit();
  }

  private update(chatId: string, fn: (chat: Chat) => Chat) {
    this.chats = this.chats.map((c) => (c.id === chatId ? fn(c) : c));
    this.emit();
  }

  private updateMessage(chatId: string, messageId: string, fn: (m: ChatMessage) => ChatMessage) {
    this.update(chatId, (chat) => ({ ...chat, messages: chat.messages.map((m) => (m.id === messageId ? fn(m) : m)) }));
  }

  setOptions(chatId: string, options: Partial<Pick<Chat, 'style' | 'model'>>) {
    if (options.style) this.style = options.style;
    if (options.model) this.model = options.model;
    this.update(chatId, (chat) => ({ ...chat, ...options }));
  }

  /** Отправить вопрос Аре. images — пути на компьютере (фото уже загружены). */
  async send(chatId: string, text: string, images: string[] = [], localImages: string[] = []) {
    const chat = this.get(chatId);
    if (!chat) return;
    const prompt = [text.trim(), ...images].filter(Boolean).join('\n');
    if (!prompt) return;
    const history = chat.messages
      .filter((m) => !m.error && !m.streaming && m.text)
      .map((m) => ({ role: m.role, text: [m.text, ...(m.images || [])].join('\n') }));

    const now = Date.now();
    const question: ChatMessage = { id: id(), role: 'user', text: text.trim(), images, localImages, at: now };
    const answer: ChatMessage = { id: id(), role: 'assistant', text: '', at: now, streaming: true };
    this.update(chatId, (c) => ({
      ...c,
      title: c.messages.length ? c.title : (text.trim() || 'Фото').replace(/\s+/g, ' ').slice(0, 80),
      updatedAt: now,
      messages: [...c.messages, question, answer],
    }));

    try {
      await ara.ask(
        { chatId, prompt, history, style: chat.style, model: chat.model },
        (delta) => this.updateMessage(chatId, answer.id, (m) => ({ ...m, text: m.text + delta })),
        (action) => this.updateMessage(chatId, answer.id, (m) => ({ ...m, actions: [...(m.actions || []), actionText(action)] })),
      );
      this.updateMessage(chatId, answer.id, (m) => ({ ...m, streaming: false }));
    } catch (error: any) {
      this.updateMessage(chatId, answer.id, (m) => ({ ...m, streaming: false, error: error?.message || 'Ара не ответила' }));
    }
    this.update(chatId, (c) => ({ ...c, updatedAt: Date.now() }));
  }
}

export const chats = new ChatStore();

export function useChats() {
  return useSyncExternalStore(chats.subscribe, chats.getChats);
}

export function useChat(chatId: string) {
  const get = useCallback(() => chats.get(chatId), [chatId]);
  return useSyncExternalStore(chats.subscribe, get);
}

/** Какой диалог открыт на вкладке «Разговор». */
export function useCurrentChatId() {
  return useSyncExternalStore(chats.subscribe, chats.getCurrentId);
}
