import { Redirect } from 'expo-router';

import { chats } from '@/ara/chats';

/** Быстрый вход из Команд iOS и кнопки действия: arra://ask. */
export default function QuickAsk() {
  const id = chats.ensureCurrent();
  return <Redirect href={{ pathname: '/chat/[id]', params: { id, ask: '1' } }} />;
}
