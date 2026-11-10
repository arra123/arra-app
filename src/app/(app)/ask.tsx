import { Redirect, useLocalSearchParams } from 'expo-router';

import { useState } from 'react';

import { chats } from '@/ara/chats';

/** Быстрый вход из Команд iOS и кнопки действия: arra://ask. */
export default function QuickAsk() {
  const { voice, fresh } = useLocalSearchParams<{ voice?: string; fresh?: string }>();
  const [request] = useState(() => String(Date.now()));
  // arra://ask?fresh=1 (the «+» of the widget): always a new conversation, no choice asked
  const [id] = useState(() => (fresh === '1' ? chats.create() : chats.ensureCurrent()));
  return <Redirect href={{ pathname: '/chat/[id]', params: { id, ask: '1', voice: voice === '1' ? request : '' } }} />;
}
