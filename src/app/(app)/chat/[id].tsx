import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { chats, useChat } from '@/ara/chats';
import { AraChat } from '@/components/ara-chat';

/** Диалог с Arra на весь экран; вход — список на вкладке «Разговор». */
export default function ChatScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = String(rawId || '');
  const chat = useChat(id);

  useEffect(() => {
    if (!chat) router.back();
  }, [chat]);

  // Пустой диалог, из которого ушли, не копим в списке
  useEffect(() => () => {
    const current = chats.get(id);
    if (current && !current.messages.length) chats.remove(id);
  }, [id]);

  return <AraChat id={id} />;
}
