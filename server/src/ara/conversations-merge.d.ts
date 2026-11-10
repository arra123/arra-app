import type { Chat } from '../../../src/ara/chats';
export type ConversationData = { chats: Chat[]; deleted: Record<string, number> };
export function normalizeChat(raw: unknown): Chat | null;
export function mergeConversations(previous?: Partial<ConversationData>, incoming?: Partial<ConversationData>): ConversationData;
