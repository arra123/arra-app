import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { chats, useChat, type AskModel, type ChatMessage } from '@/ara/chats';
import { mediaPaths } from '@/ara/format';
import { useAra } from '@/ara/hooks';
import { uploadPhoto, type LocalPhoto } from '@/ara/upload';
import { AraMascot } from '@/components/ara-mascot';
import { ChatLayout, useFreshKeys } from '@/components/chat-layout';
import { Composer } from '@/components/composer';
import { MenuTrigger } from '@/components/glass-menu';
import { Segmented } from '@/components/segmented';
import { AssistantMessage, UserBubble } from '@/components/transcript';
import { AgentIcon, Chip, Press, T } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';

const MODELS: { value: AskModel; label: string; hint: string }[] = [
  { value: 'haiku', label: 'Haiku', hint: 'самая быстрая' },
  { value: 'sonnet', label: 'Sonnet', hint: 'баланс скорости и ума' },
  { value: 'opus', label: 'Opus', hint: 'самая умная' },
];

const SUGGESTIONS: { text: string; icon: SFSymbol }[] = [
  { text: 'Что сейчас делают агенты?', icon: 'rectangle.stack' },
  { text: 'Кто из агентов ждёт моего ответа?', icon: 'bell.badge' },
  { text: 'Что сделано за сегодня?', icon: 'checklist' },
  { text: 'Как задеплоить мой сервер?', icon: 'server.rack' },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

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

export default function ChatScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = String(rawId || '');
  const chat = useChat(id);
  const state = useAra();
  const messages = useMemo(() => chat?.messages || [], [chat]);
  const keys = useMemo(() => messages.map((m) => m.id), [messages]);
  const isFresh = useFreshKeys(keys);

  useEffect(() => {
    if (!chat) router.back();
  }, [chat]);

  // Пустой чат, из которого ушли, не копим в списке
  useEffect(() => () => {
    const current = chats.get(id);
    if (current && !current.messages.length) chats.remove(id);
  }, [id]);

  if (!chat) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  const online = state.devices.laptop.online || state.devices.pc.online;
  const busy = messages.some((m) => m.streaming);

  async function send(text: string, photos: LocalPhoto[]) {
    const device = state.devices.laptop.online ? 'laptop' : 'pc';
    const paths: string[] = [];
    for (const photo of photos) paths.push(await uploadPhoto(photo, { device }));
    // Ответ идёт потоком — не ждём его, чтобы поле ввода сразу освободилось
    chats.send(id, text, paths, photos.map((p) => p.uri));
  }

  function retry(answerIndex: number) {
    const question = messages[answerIndex - 1];
    const answer = messages[answerIndex];
    if (question?.role !== 'user' || !answer) return;
    // Иначе неудавшийся вопрос попал бы в историю и Ара увидела бы его дважды
    chats.dropExchange(id, answer.id);
    chats.send(id, question.text, question.images || [], question.localImages || []);
  }

  const model = MODELS.find((m) => m.value === chat.model) || MODELS[1];

  const title = (
    <View style={styles.title}>
      <AgentIcon agent="ara" size={30} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="headline" weight="700" numberOfLines={1}>{messages.length ? chat.title : 'Ара'}</T>
        <T v="caption" color={online ? Colors.textSecondary : Colors.error} numberOfLines={1}>
          {online ? 'Ара · быстрые ответы и задачи агентам' : 'Компьютер не в сети — Ара не ответит'}
        </T>
      </View>
    </View>
  );

  const below = (
    <Segmented
      size="small"
      value={chat.style}
      onChange={(style) => chats.setOptions(id, { style })}
      options={[
        { value: 'brief', label: 'Чётко', icon: 'text.alignleft' },
        { value: 'talk', label: 'Поговорить', icon: 'bubble.left.and.bubble.right' },
      ]}
    />
  );

  const modelPicker = (
    <MenuTrigger
      label="Модель Ары"
      sections={[MODELS.map((m) => ({
        label: m.label,
        subtitle: m.hint,
        checked: m.value === chat.model,
        onPress: () => chats.setOptions(id, { model: m.value }),
      }))]}>
      <View style={styles.modelButton}>
        <SymbolView name="bolt.fill" size={11} tintColor={Colors.textSecondary} />
        <T v="footnote" weight="600" color={Colors.textSecondary} maxFontSizeMultiplier={1.2}>{model.label}</T>
        <SymbolView name="chevron.up.chevron.down" size={9} tintColor={Colors.textSecondary} weight="bold" />
      </View>
    </MenuTrigger>
  );

  return (
    <ChatLayout
      title={title}
      below={below}
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
        <Animated.View entering={FadeIn.duration(300)} style={styles.empty}>
          <AraMascot size={96} interactive mood={busy ? 'thinking' : 'idle'} />
          <T v="title" weight="700" style={{ marginTop: 14 }}>{greeting()}!</T>
          <T v="subhead" color={Colors.textSecondary} style={{ textAlign: 'center' }}>
            Я знаю всех твоих агентов на ноутбуке и ПК. Спроси или дай задачу.
          </T>
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((s, i) => (
              <Animated.View key={s.text} entering={FadeInDown.delay(80 + i * 60).duration(260)} style={styles.suggestionCell}>
                <Press onPress={() => chats.send(id, s.text)} disabled={!online || busy} style={styles.suggestion} feedback="press" accessibilityLabel={s.text}>
                  <SymbolView name={s.icon} size={17} tintColor={Colors.ara} />
                  <T v="footnote" weight="600" numberOfLines={2}>{s.text}</T>
                </Press>
              </Animated.View>
            ))}
          </View>
        </Animated.View>
      }
      composer={(onHeight) => (
        <Composer
          placeholder={busy ? 'Ара отвечает…' : 'Спроси Ару…'}
          onSend={send}
          onHeight={onHeight}
          accessory={modelPicker}
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
  modelButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empty: { alignItems: 'center', gap: 6, alignSelf: 'stretch' },
  suggestions: { marginTop: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignSelf: 'stretch' },
  suggestionCell: { width: '48%', flexGrow: 1 },
  suggestion: {
    gap: 8,
    padding: 14,
    minHeight: 88,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
  },
});
