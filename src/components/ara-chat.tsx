import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { chats, useChat, type AskModel, type ChatMessage } from '@/ara/chats';
import { mediaPaths } from '@/ara/format';
import { useAra } from '@/ara/hooks';
import { uploadPhoto, type LocalPhoto } from '@/ara/upload';
import { AraMascot } from '@/components/ara-mascot';
import { ChatLayout, useFreshKeys } from '@/components/chat-layout';
import { ChatSidebar } from '@/components/chat-sidebar';
import { Composer } from '@/components/composer';
import { MenuTrigger, type MenuSection } from '@/components/glass-menu';
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
                <Press onPress={onRetry} accessibilityRole="button" accessibilityLabel="Повторить вопрос" hitSlop={8}>
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

/** Открыть другой диалог на том же экране (без новой анимации перехода). */
function switchTo(next: string) {
  chats.open(next);
  router.setParams({ id: next });
}

/**
 * Диалог с Арой на весь экран, как в ChatGPT: слева кнопка панели диалогов,
 * по центру название, справа капсула «новый чат · ⋯» (стиль, модель, удаление),
 * лента и поле ввода.
 */
export function AraChat({ id }: { id: string }) {
  const chat = useChat(id);
  const state = useAra();
  const [sidebar, setSidebar] = useState(false);
  const messages = useMemo(() => chat?.messages || [], [chat]);
  const keys = useMemo(() => messages.map((m) => m.id), [messages]);
  const isFresh = useFreshKeys(keys);

  if (!chat) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  const online = state.devices.laptop.online || state.devices.pc.online;
  const busy = messages.some((m) => m.streaming);

  async function send(text: string, photos: LocalPhoto[]) {
    const device = state.devices.laptop.online ? 'laptop' : 'pc';
    const uploads = Promise.all(photos.map((photo) => uploadPhoto(photo, { device })));
    // Вопрос и локальные превью появляются сразу; загрузка и ответ идут фоном.
    void chats.send(id, text, uploads, photos.filter((p) => p.mime.startsWith('image/')).map((p) => p.uri));
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
    if (next !== id) switchTo(next);
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
    messages.length ? [{ label: 'Удалить диалог', icon: 'trash', destructive: true, onPress: remove }] : [],
  ];

  const title = (
    <View style={styles.title}>
      <View style={styles.avatar}>
        <AraMascot size={22} mood={busy ? 'thinking' : 'idle'} interactive />
      </View>
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <T v="subhead" weight="700" numberOfLines={1}>{messages.length ? chat.title : 'Ара'}</T>
        {status ? <T v="caption" color={online ? Colors.textSecondary : Colors.error} numberOfLines={1}>{status}</T> : null}
      </View>
    </View>
  );

  const left = (
    <Glass radius={22} backing style={styles.more}>
      <Press onPress={() => setSidebar(true)} feedback="tap" style={styles.more} accessibilityRole="button" accessibilityLabel="Диалоги" accessibilityHint="Список диалогов и новый чат">
        <SymbolView name="line.3.horizontal" size={19} tintColor={Colors.text} weight="semibold" />
      </Press>
    </Glass>
  );

  const right = (
    <Glass radius={22} backing style={styles.rightCapsule}>
      <Press onPress={startNew} disabled={!messages.length} feedback="tap" style={styles.more} accessibilityRole="button" accessibilityLabel="Новый диалог">
        <SymbolView name="square.and.pencil" size={18} tintColor={Colors.text} weight="semibold" />
      </Press>
      <MenuTrigger label="Стиль, модель и действия" sections={menu}>
        <View style={styles.more}>
          <SymbolView name="ellipsis" size={18} tintColor={Colors.text} weight="semibold" />
        </View>
      </MenuTrigger>
    </Glass>
  );

  return (
    <View style={{ flex: 1 }}>
      <ChatLayout
        title={title}
        left={left}
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
      <ChatSidebar
        open={sidebar}
        currentId={id}
        onClose={() => setSidebar(false)}
        onSelect={switchTo}
        onNew={startNew}
        onWork={() => router.dismissTo('/')}
        onTalk={() => setSidebar(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { paddingHorizontal: Spacing.lg, paddingVertical: 7 },
  avatar: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cardRaised },
  more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rightCapsule: { flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empty: { alignItems: 'center' },
});
