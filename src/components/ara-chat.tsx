import { SymbolView } from 'expo-symbols';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chats, useChat, useChats, type AskModel, type Chat, type ChatMessage } from '@/ara/chats';
import { ago, mediaPaths } from '@/ara/format';
import { useAra, useNow } from '@/ara/hooks';
import { uploadPhoto, type LocalPhoto } from '@/ara/upload';
import { AraMascot } from '@/components/ara-mascot';
import { LimitsInline } from '@/components/limits';
import { ChatLayout, useFreshKeys } from '@/components/chat-layout';
import { Composer } from '@/components/composer';
import { MenuTrigger, type MenuAnchor } from '@/components/glass-menu';
import { Segmented } from '@/components/segmented';
import { AssistantMessage, UserBubble } from '@/components/transcript';
import { Chip, Glass, Press, T } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

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
 * Диалог с Арой. Один и тот же на вкладке «Разговор» (embedded: сверху выбор
 * диалога, над ним — шапка главного экрана) и на отдельном экране (со «‹»).
 */
export function AraChat({ id, embedded = false, headerTop = 0 }: { id: string; embedded?: boolean; headerTop?: number }) {
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
  const status = !online ? 'Компьютер не в сети — Ара не ответит' : busy ? 'печатает…' : null;

  const styleToggle = (
    <Segmented
      size="small"
      value={chat.style}
      onChange={(style) => chats.setOptions(id, { style })}
      style={embedded ? styles.styleCompact : undefined}
      options={[
        { value: 'brief', label: 'Чётко' },
        { value: 'talk', label: 'Поговорить' },
      ]}
    />
  );

  const title = embedded ? (
    <ChatPicker current={chat} status={status} limits={<LimitsInline title="Claude" limit={state.limits?.claude || null} v="tiny" />} />
  ) : (
    <View style={styles.title}>
      <View style={styles.avatar}>
        <AraMascot size={26} mood={busy ? 'thinking' : 'idle'} interactive />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="headline" weight="700" numberOfLines={1}>{messages.length ? chat.title : 'Ара'}</T>
        {status || !state.limits?.claude ? (
          <T v="caption" color={online ? Colors.textSecondary : Colors.error} numberOfLines={1}>{status || 'на связи'}</T>
        ) : (
          <LimitsInline title="Claude" limit={state.limits.claude} v="tiny" />
        )}
      </View>
    </View>
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
      back={!embedded}
      headerTop={headerTop}
      title={title}
      right={embedded ? styleToggle : undefined}
      below={embedded ? undefined : styleToggle}
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
          accessory={modelPicker}
          autoFocus={false}
          disabled={busy}
        />
      )}
    />
  );
}

// ---------- выбор диалога ----------

const pickerEnter = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -8 }] },
    animations: {
      opacity: withTiming(1, { duration: 160 }),
      transform: [{ translateY: withTiming(0, { duration: 200 }) }],
    },
  };
};

/** Название диалога с шевроном → список прошлых диалогов и «Новый диалог». */
function ChatPicker({ current, status, limits }: { current: Chat; status: string | null; limits?: ReactNode }) {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const list = useChats();
  const now = useNow(30_000);
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  // Пустые диалоги в списке не показываем: пустой открытый — это отмеченный «Новый диалог»
  const items = useMemo(
    () => [...list].filter((c) => c.messages.length).sort((a, b) => b.updatedAt - a.updatedAt),
    [list],
  );
  const title = current.messages.length ? current.title : 'Новый диалог';

  const open = () => {
    haptic.tap();
    ref.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  };
  const close = () => setAnchor(null);

  const pick = (chatId: string) => {
    haptic.select();
    close();
    chats.open(chatId);
  };

  const remove = (chat: Chat) => {
    haptic.press();
    Alert.alert('Удалить диалог?', chat.title, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => chats.remove(chat.id) },
    ]);
  };

  return (
    <>
      <Pressable ref={ref} onPress={open} style={styles.picker} accessibilityRole="button" accessibilityLabel={`Диалог: ${title}. Выбрать другой`}>
        <View style={styles.pickerRow}>
          <T v="headline" weight="700" numberOfLines={1} style={{ flexShrink: 1 }}>{title}</T>
          <SymbolView name="chevron.down" size={11} tintColor={Colors.textSecondary} weight="bold" />
        </View>
        {status ? <T v="caption" color={status.startsWith('Компьютер') ? Colors.error : Colors.textSecondary} numberOfLines={1}>{status}</T> : null}
      </Pressable>
      {!status && limits ? <View style={styles.pickerLimits}>{limits}</View> : null}
      <Modal visible={!!anchor} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: Colors.scrim }]} onPress={close} accessibilityLabel="Закрыть список диалогов" />
        {anchor ? (
          <Animated.View
            entering={pickerEnter}
            exiting={FadeOut.duration(120)}
            style={[styles.sheet, { top: anchor.y + anchor.height + 8, maxHeight: screenH - anchor.y - anchor.height - insets.bottom - 24 }]}>
            <Glass radius={Radius.xl} style={styles.sheetGlass}>
              <PickerRow
                icon="square.and.pencil"
                label="Новый диалог"
                checked={!current.messages.length}
                onPress={() => pick(chats.startNew())}
                strong
              />
              {items.length ? (
                <>
                  <View style={styles.sheetGap} />
                  <ScrollView bounces={false} indicatorStyle="white" contentContainerStyle={{ paddingBottom: 4 }}>
                    {items.map((chat, i) => (
                      <PickerRow
                        key={chat.id}
                        label={chat.title}
                        right={ago(chat.updatedAt, now)}
                        checked={chat.id === current.id}
                        border={i > 0}
                        onPress={() => pick(chat.id)}
                        onLongPress={() => remove(chat)}
                      />
                    ))}
                  </ScrollView>
                </>
              ) : null}
            </Glass>
          </Animated.View>
        ) : null}
      </Modal>
    </>
  );
}

function PickerRow({ label, right, icon, checked, border, strong, onPress, onLongPress }: {
  label: string;
  right?: string;
  icon?: 'square.and.pencil';
  checked?: boolean;
  border?: boolean;
  strong?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="menuitem"
      accessibilityState={{ selected: checked }}
      accessibilityLabel={label}
      accessibilityHint={onLongPress ? 'Долгое нажатие — удалить' : undefined}
      style={({ pressed }) => [styles.pickerItem, border && styles.pickerBorder, pressed && { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
      <View style={styles.pickerIcon}>
        {icon ? (
          <SymbolView name={icon} size={16} tintColor={Colors.text} weight="semibold" />
        ) : checked ? (
          <SymbolView name="checkmark" size={13} tintColor={Colors.text} weight="bold" />
        ) : null}
      </View>
      <T v="callout" weight={strong || checked ? '600' : undefined} numberOfLines={1} style={{ flex: 1 }}>{label}</T>
      {right ? <T v="caption" color={Colors.textTertiary}>{right}</T> : null}
      {icon && checked ? <SymbolView name="checkmark" size={13} tintColor={Colors.textSecondary} weight="bold" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { paddingHorizontal: Spacing.lg, paddingVertical: 7 },
  avatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  modelButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empty: { alignItems: 'center' },
  styleCompact: { width: 200 },
  picker: { paddingLeft: 4, paddingVertical: 2, alignSelf: 'flex-start', maxWidth: '100%' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pickerLimits: { paddingLeft: 4, marginTop: 1 },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
  },
  sheetGlass: { paddingVertical: 4, backgroundColor: Colors.glassFallback },
  sheetGap: { height: 6, backgroundColor: 'rgba(0,0,0,0.25)' },
  pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 46, paddingVertical: 8 },
  pickerBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.separator },
  pickerIcon: { width: 18, alignItems: 'center' },
});
