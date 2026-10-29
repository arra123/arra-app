import { File, Paths } from 'expo-file-system';
import { useCallback, useSyncExternalStore } from 'react';

import type { LocalPhoto } from './upload';
import type { DeviceId } from './types';
import { ara } from './client';
import { api } from '@/lib/api';
import { mergeConversations, type ConversationData } from '../../server/src/ara/conversations-merge';

export type AskStyle = 'brief' | 'talk';
export type AskModel = 'haiku' | 'sonnet' | 'opus';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: number;
  /** Пути к фото на компьютере (после загрузки) */
  images?: string[];
  attachments?: LocalPhoto[];
  device?: DeviceId;
  /** Те же фото на телефоне — чтобы показать без сети */
  localImages?: string[];
  /** Что Arra сделала по ходу ответа (передала задачу агенту и т.п.) */
  actions?: string[];
  error?: string;
  streaming?: boolean;
  updatedAt?: number;
  desktop?: Record<string, unknown>;
};

export type Chat = {
  id: string;
  title: string;
  titleManual?: boolean;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
  style: AskStyle;
  model: AskModel;
  messages: ChatMessage[];
  deletedMessages?: Record<string, number>;
};

type Saved = { deleted?: Record<string, number>; chats: Chat[]; style: AskStyle; model: AskModel; current?: string | null };

const FILE_NAME = 'ara-chats.json';
const id = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function actionText(action: Record<string, unknown>): string {
  const text = action.text ?? action.title ?? action.summary;
  if (typeof text === 'string' && text.trim()) return text.trim();
  const kind = typeof action.kind === 'string' ? action.kind : typeof action.type === 'string' ? action.type : '';
  return kind ? `Действие: ${kind}` : 'Arra выполнила действие';
}

/**
 * Разговоры общие через сервер; файл приложения — резервная копия без сети.
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
  private deleted: Record<string, number> = {};
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private syncing = false;
  private dirty = true;
  private sharedLoaded = false;

  constructor() {
    ara.subscribeConversations((data) => { this.load(); this.applyShared(data); });
    let connected = false;
    ara.subscribeState(() => {
      const next = ara.getState().connected;
      if (next && !connected) { this.load(); this.dirty = true; this.queueSync(); }
      connected = next;
    });
  }

  private applyShared(data: ConversationData) {
    const local = new Map(this.chats.map(chat => [chat.id, chat]));
    const merged = mergeConversations({ chats: this.chats, deleted: this.deleted }, data);
    this.deleted = merged.deleted;
    this.chats = merged.chats.map(chat => ({ ...chat, messages: chat.messages.map(message => {
      const cached = local.get(chat.id)?.messages.find(m => m.id === message.id);
      return { ...message, ...(cached?.localImages ? { localImages: cached.localImages } : {}),
        ...(cached?.attachments ? { attachments: cached.attachments } : {}) };
    }) }));
    if (!this.sharedLoaded && !this.chats.find(chat => chat.id === this.currentId)?.messages.length) {
      const latest = this.chats.find(chat => chat.messages.length);
      if (latest) this.currentId = latest.id;
    }
    this.sharedLoaded = true;
    this.listeners.forEach(listener => listener());
    this.persist();
  }

  private queueSync() {
    if (this.syncTimer || this.syncing || !ara.getState().connected) return;
    this.syncTimer = setTimeout(() => { this.syncTimer = null; void this.sync(); }, 400);
  }

  private async sync() {
    if (this.syncing || !this.dirty || !ara.getState().connected) return;
    this.syncing = true;
    this.dirty = false;
    try {
      const data = await api<ConversationData>('/ara/conversations', { body: { chats: this.chats, deleted: this.deleted }, timeoutMs: 12000 });
      this.applyShared(data);
    } catch {
      this.dirty = true; // A failed request never clears local conversations.
      if (!this.syncTimer) this.syncTimer = setTimeout(() => { this.syncTimer = null; void this.sync(); }, 3000);
    } finally { this.syncing = false; if (this.dirty) this.queueSync(); }
  }


  private file() {
    return new File(Paths.document, FILE_NAME);
  }

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const file = this.file();
      if (!file.exists) return;
      const backup = new File(Paths.document, 'ara-chats-before-shared.json');
      if (!backup.exists) file.copy(backup);
      const saved = JSON.parse(file.textSync()) as Saved;
      this.deleted = saved.deleted || {};
      this.chats = (saved.chats || []).map((chat) => ({
        ...chat,
        // Ответ, оборванный закрытием приложения, больше не «печатается»
        messages: chat.messages.map((m) => (m.streaming ? { ...m, streaming: false, error: m.text ? undefined : 'Ответ прервался' } : m)),
      }));
      this.style = saved.style || 'brief';
      this.model = saved.model || 'sonnet';
      this.currentId = saved.current || null;
      this.queueSync();
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
        file.write(JSON.stringify({ chats: this.chats, deleted: this.deleted, style: this.style, model: this.model, current: this.currentId } satisfies Saved));
      } catch {
        /* нет места — чаты останутся в памяти до перезапуска */
      }
    }, 400);
  }

  private emit() {
    this.dirty = true;
    this.queueSync();
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
    const chat = this.get(chatId);
    if (chat) { chat.lastOpenedAt = Date.now(); this.dirty = true; this.queueSync(); }
    if (previous === chatId) { this.persist(); return; }
    this.currentId = chatId;
    const left = previous ? this.get(previous) : null;
    if (left && !left.messages.length) {
      this.deleted[left.id] = Date.now();
      this.chats = this.chats.filter((c) => c.id !== left.id);
    }
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
      const deletedMessages = { ...chat.deletedMessages };
      for (const message of chat.messages.slice(from, i + 1)) deletedMessages[message.id] = Date.now();
      return { ...chat, deletedMessages, messages: [...chat.messages.slice(0, from), ...chat.messages.slice(i + 1)] };
    });
  }

  remove(chatId: string) {
    this.deleted[chatId] = Date.now();
    this.chats = this.chats.filter((c) => c.id !== chatId);
    if (this.currentId === chatId) this.currentId = null;
    this.emit();
  }

  clearAll() {
    for (const chat of this.chats) this.deleted[chat.id] = Date.now();
    this.chats = [];
    this.currentId = null;
    this.emit();
  }

  private update(chatId: string, fn: (chat: Chat) => Chat) {
    this.chats = this.chats.map((c) => (c.id === chatId ? { ...fn(c), updatedAt: Date.now() } : c));
    this.emit();
  }

  private updateMessage(chatId: string, messageId: string, fn: (m: ChatMessage) => ChatMessage) {
    this.update(chatId, (chat) => ({ ...chat, messages: chat.messages.map((m) => (m.id === messageId ? { ...fn(m), updatedAt: Date.now() } : m)) }));
  }

  setOptions(chatId: string, options: Partial<Pick<Chat, 'style' | 'model'>>) {
    if (options.style) this.style = options.style;
    if (options.model) this.model = options.model;
    this.update(chatId, (chat) => ({ ...chat, ...options }));
  }

  /**
   * Отправить вопрос Arra. Локальный пузырь появляется сразу, пока фото ещё
   * загружаются; после загрузки пути добавляются в вопрос для Claude.
   */
  async send(chatId: string, text: string, images: string[] | Promise<string[]> = [], localImages: string[] = [], options: { device?: DeviceId; attachments?: LocalPhoto[] } = {}) {
    const chat = this.get(chatId);
    if (!chat) return;
    if (!text.trim() && !localImages.length && Array.isArray(images) && !images.length) return;
    const history = chat.messages
      .filter((m) => !m.error && !m.streaming && m.text)
      .map((m) => ({ role: m.role, text: [m.text, ...(m.images || [])].join('\n') }));

    const now = Date.now();
    const question: ChatMessage = { id: id(), role: 'user', text: text.trim(), images: Array.isArray(images) ? images : [], localImages, device: options.device, attachments: options.attachments, at: now };
    const answer: ChatMessage = { id: id(), role: 'assistant', text: '', at: now, streaming: true };
    this.update(chatId, (c) => ({
      ...c,
      title: c.titleManual || c.messages.length ? c.title : (text.trim() || 'Фото').replace(/\s+/g, ' ').slice(0, 80),
      updatedAt: now,
      messages: [...c.messages, question, answer],
    }));

    try {
      const uploaded = await images;
      const prompt = [text.trim(), ...uploaded].filter(Boolean).join('\n');
      this.updateMessage(chatId, question.id, (m) => ({ ...m, images: uploaded }));
      await ara.ask(
        { chatId, prompt, history, device: options.device, attachments: uploaded, style: chat.style, model: chat.model },
        (delta) => this.updateMessage(chatId, answer.id, (m) => ({ ...m, text: m.text + delta })),
        (action) => this.updateMessage(chatId, answer.id, (m) => ({ ...m, actions: [...(m.actions || []), actionText(action)] })),
      );
      this.updateMessage(chatId, answer.id, (m) => ({ ...m, streaming: false }));
    } catch (error: any) {
      this.updateMessage(chatId, answer.id, (m) => ({ ...m, streaming: false, error: error?.message || 'Arra не ответила' }));
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
