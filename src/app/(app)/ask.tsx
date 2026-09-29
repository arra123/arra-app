import { Redirect, useLocalSearchParams } from 'expo-router';

import { useState } from 'react';

import { chats } from '@/ara/chats';

/** Быстрый вход из Команд iOS и кнопки действия: arra://ask. */
export default function QuickAsk() {
  const { voice } = useLocalSearchParams<{ voice?: string }>();
  const [request] = useState(() => String(Date.now()));
  const id = chats.ensureCurrent();
  return <Redirect href={{ pathname: '/chat/[id]', params: { id, ask: '1', voice: voice === '1' ? request : '' } }} />;
}
