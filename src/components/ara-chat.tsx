import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { chats, useChat, type AskModel, type ChatMessage } from '@/ara/chats';
import { mediaPaths } from '@/ara/format';
import { useAra } from '@/ara/hooks';
import { uploadPhoto, type LocalPhoto } from '@/ara/upload';
import { AraMascot } from '@/components/ara-mascot';
import { ChatLayout, useFreshKeys } from '@/components/chat-layout';
import { Composer } from '@/components/composer';
import { MenuTrigger, type MenuSection } from '@/components/glass-menu';
import { LimitsInline } from '@/components/limits';
import { AssistantMessage, UserBubble } from '@/components/transcript';
import { Chip, Glass, Press, T } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';

const MODELS: { value: AskModel; label: string; hint: string }[] = [
  { value: 'haiku', label: 'Haiku', hint: 'самая быстрая' },
  { value: 'sonnet', label: 'Sonnet', hint: 'баланс скорости и ума' },
  { value: 'opus', label: 'Opus', hint: 'самая умная' },
];

function AraAnswer({ message, chatId, onRetry }: { message: ChatMessage; chatId: string; onRetry?: () => void }) {
  const media = useMemo(() => mediaPaths(message.text), [message.text]);
  return (
    <AssistantMessage
      text={message.text}
      images={media.images}
      videos={media.videos}
      scope={{ chatId }}
      footer={
        <>
          {message.actions?.length ? (
            <View style={styles.actions}>
              {message.actions.map((a, i) => (
                <Chip key={i}>
                  <SymbolView name="arrow.turn.down.right" size={10} tintColor={Colors.textSecondary} />
                  <T v="tiny" color={Colors.textSecondary} numberOfLines={2}>{a}</T>
                </Chip>
              ))}
            </View>
          ) : null}
          {message.streaming && !message.text ? <AraMascot size={34} mood="thinking" /> : null}
          {message.error ? (
            <View style={styles.error}>
              <SymbolView name="exclamationmark.triangle" size={13} tintColor={Colors.error} />
              <T v="footnote" color={Colors.error} style={{ flex: 1 }}>{message.error}</T>
              {onRetry ? (
                <Press onPress={onRetry} accessibilityLabel="Повторить вопрос" hitSlop={8}>
                  <T v="footnote" weight="600" color={Colors.text}>Повторить</T>
                </Press>
              ) : null}
            </View>
          ) : null}
        </>
      }
    />
  );
}

/**
 * Диалог с Арой на весь экран: компактная шапка (‹, название, «⋯» со стилем,
 * моделью, новым диалогом и удалением), лента и поле ввода.
 */
export function AraChat({ id }: { id: string }) {
  const chat = useChat(id);
  const state = useAra();
  const messages = useMemo(() => chat?.messages || [], [chat]);
  const keys = useMemo(() => messages.map((m) => m.id), [messages]);
  const isFresh = useFreshKeys(keys);

  if (!chat) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  const online = state.devices.laptop.online || state.devices.pc.online;
  const busy = messages.some((m) => m.streaming);

  async function send(text: string, photos: LocalPhoto[]) {
    const device = state.devices.laptop.online ? 'laptop' : 'pc';
    const paths: string[] = [];
    for (const photo of photos) paths.push(await uploadPhoto(photo, { device }));
    // Ответ идёт потоком — не ждём его, чтобы поле ввода сразу освободилось
    chats.send(id, text, paths, photos.filter((p) => p.mime.startsWith('image/')).map((p) => p.uri));
  }

  function retry(answerIndex: number) {
    const question = messages[answerIndex - 1];
    const answer = messages[answerIndex];
    if (question?.role !== 'user' || !answer) return;
    // Иначе неудавшийся вопрос попал бы в историю и Ара увидела бы его дважды
    chats.dropExchange(id, answer.id);
    chats.send(id, question.text, question.images || [], question.localImages || []);
  }

  function remove() {
    Alert.alert('Удалить диалог?', chat?.title || '', [
      { text: 'Отмена', style: 'cancel' },
      // Экран диалога сам закроется, когда диалога не станет
      { text: 'Удалить', style: 'destructive', onPress: () => chats.remove(id) },
    ]);
  }

  function startNew() {
    const next = chats.startNew();
    if (next !== id) router.replace({ pathname: '/chat/[id]', params: { id: next } });
  }

  const status = !online ? 'Компьютер не в сети — Ара не ответит' : busy ? 'печатает…' : null;

  const menu: MenuSection[] = [
    {
      title: 'Стиль',
      items: [
        { label: 'Чётко', checked: chat.style === 'brief', onPress: () => chats.setOptions(id, { style: 'brief' }) },
        { label: 'Поговорить', checked: chat.style === 'talk', onPress: () => chats.setOptions(id, { style: 'talk' }) },
      ],
    },
    {
      title: 'Модель',
      items: MODELS.map((m) => ({
        label: m.label,
        subtitle: m.hint,
        checked: m.value === chat.model,
        onPress: () => chats.setOptions(id, { model: m.value }),
      })),
    },
    messages.length ? [{ label: 'Новый диалог', icon: 'square.and.pencil', onPress: startNew }] : [],
    messages.length ? [{ label: 'Удалить диалог', icon: 'trash', destructive: true, onPress: remove }] : [],
  ];

  const title = (
    <View style={styles.title}>
      <View style={styles.avatar}>
        <AraMascot size={22} mood={busy ? 'thinking' : 'idle'} interactive />
      </View>
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <T v="subhead" weight="700" numberOfLines={1}>{messages.length ? chat.title : 'Новый диалог'}</T>
        {status || !state.limits?.claude ? (
          <T v="caption" color={online ? Colors.textSecondary : Colors.error} numberOfLines={1}>{status || 'Ара'}</T>
        ) : (
          <LimitsInline title="Claude" limit={state.limits.claude} v="tiny" />
        )}
      </View>
    </View>
  );

  const right = (
    <MenuTrigger label="Стиль, модель и действия" sections={menu}>
      <Glass radius={22} backing style={styles.more}>
        <SymbolView name="ellipsis" size={18} tintColor={Colors.text} weight="semibold" />
      </Glass>
    </MenuTrigger>
  );

  return (
    <ChatLayout
      title={title}
      right={right}
      data={messages}
      keyOf={(m) => m.id}
      renderItem={({ item, index }) => {
        // список перевёрнут: index считается от последнего сообщения
        const realIndex = messages.length - 1 - index;
        return (
          <Animated.View entering={isFresh(item.id) ? FadeInDown.duration(260) : undefined} style={styles.row}>
            {item.role === 'user' ? (
              <UserBubble text={item.text} images={item.localImages?.length ? [] : item.images} localImages={item.localImages} scope={{ chatId: id }} />
            ) : (
              <AraAnswer message={item} chatId={id} onRetry={busy ? undefined : () => retry(realIndex)} />
            )}
          </Animated.View>
        );
      }}
      empty={
        <Animated.View key={id} entering={FadeIn.duration(300)} style={styles.empty}>
          <AraMascot size={52} interactive mood={busy ? 'thinking' : 'idle'} />
        </Animated.View>
      }
      composer={(onHeight) => (
        <Composer
          placeholder={busy ? 'Ара отвечает…' : 'Спроси Ару…'}
          onSend={send}
          onHeight={onHeight}
          autoFocus={false}
          disabled={busy}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { paddingHorizontal: Spacing.lg, paddingVertical: 7 },
  avatar: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cardRaised },
  more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empty: { alignItems: 'center' },
});
