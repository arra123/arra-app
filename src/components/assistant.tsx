import { MenuView } from '@expo/ui/community/menu';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

import { AppleButton, AppleIconButton } from '@/components/apple-button';
import { ChatDrawer } from '@/components/chat-drawer';
import { HoldMic } from '@/components/hold-mic';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, API_URL, getToken } from '@/lib/api';
import { haptic } from '@/lib/haptics';

type Msg = { id: string; role: 'user' | 'assistant'; content: string; created_at?: string };
type PresetId = 'finance' | 'general' | 'tech';
type Thread = {
  id: string;
  title: string;
  preset: PresetId;
  count?: number;
  preview?: string | null;
  main?: boolean;
};

const PRESETS: { id: PresetId; title: string; hint: string; icon: SFSymbol }[] = [
  { id: 'finance', title: 'Финансы', hint: 'Записи, долги и возвраты', icon: 'chart.pie.fill' },
  { id: 'general', title: 'Обычный разговор', hint: 'Без финансового режима', icon: 'bubble.left.and.bubble.right.fill' },
  { id: 'tech', title: 'Покупки и техника', hint: 'Компьютеры и выбор устройств', icon: 'desktopcomputer' },
];

const presetInfo = (id?: string) => PRESETS.find((preset) => preset.id === id) || PRESETS[0];
const hhmm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '');

export function Assistant() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState('main');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const feedX = useSharedValue(0);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [undoForTurn, setUndoForTurn] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const [kbHeight, setKbHeight] = useState(0);

  const scrollEnd = useCallback((animated = true) => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated }));
  }, []);

  useFocusEffect(
    useCallback(() => {
      inputRef.current?.blur();
      Keyboard.dismiss();
      return () => { inputRef.current?.blur(); Keyboard.dismiss(); };
    }, []),
  );

  // Единый механизм подъёма над клавиатурой: слушаем высоту клавиатуры и поднимаем
  // только док. БЕЗ KeyboardAvoidingView — иначе два механизма дёргали поле «туда-сюда».
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => {
      Keyboard.scheduleLayoutAnimation(e);
      setKbHeight(e.endCoordinates?.height || 0);
      scrollEnd(false);
    });
    const hide = Keyboard.addListener(hideEvt, (e) => {
      Keyboard.scheduleLayoutAnimation(e);
      setKbHeight(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, [scrollEnd]);

  const activeThread = threads.find((thread) => String(thread.id) === String(threadId))
    || { id: 'main', title: 'Основной', preset: 'finance' as PresetId, main: true };
  const activePreset = presetInfo(activeThread.preset);

  const loadThreads = useCallback(async () => {
    try {
      const r = await api<{ threads: Thread[] }>('/ai/threads');
      const next: Thread[] = r.threads?.length ? r.threads : [{ id: 'main', title: 'Основной', preset: 'finance', main: true }];
      setThreads(next);
      setThreadId((current) => next.some((thread) => String(thread.id) === String(current)) ? current : 'main');
    } catch {
      setThreads([{ id: 'main', title: 'Основной', preset: 'finance', main: true }]);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api<{ messages: Msg[] }>(`/ai/messages?thread=${encodeURIComponent(threadId)}`);
      setMsgs(r.messages);
    } catch {
      /* ignore */
    }
  }, [threadId]);

  useEffect(() => { loadThreads(); }, [loadThreads]);
  useEffect(() => { load(); }, [load]);

  async function createThread(preset: PresetId) {
    try {
      const r = await api<{ thread: Thread }>('/ai/threads', { body: { preset } });
      setThreads((current) => [r.thread, ...current]);
      setThreadId(r.thread.id);
      setMsgs([]);
      setUndoForTurn(null);
      haptic.success();
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (e: any) {
      Alert.alert('Не получилось создать чат', e?.message || '');
    }
  }

  async function changePreset(preset: PresetId) {
    if (activeThread.main || activeThread.preset === preset) return;
    try {
      const r = await api<{ thread: Thread }>(`/ai/threads/${activeThread.id}`, {
        method: 'PATCH',
        body: { preset },
      });
      setThreads((current) => current.map((thread) => thread.id === activeThread.id ? { ...thread, ...r.thread } : thread));
      setUndoForTurn(null);
      haptic.tap();
    } catch (e: any) {
      Alert.alert('Не получилось сменить режим', e?.message || '');
    }
  }

  /** Удаление конкретного чата — из списка переписок (свайпом). */
  async function deleteThreadById(id: string) {
    Alert.alert('Удалить этот чат?', 'Переписка удалится на всех устройствах.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/ai/threads/${id}`, { method: 'DELETE' });
            if (String(id) === String(threadId)) { setThreadId('main'); setMsgs([]); setUndoForTurn(null); }
            await loadThreads();
          } catch (e: any) {
            Alert.alert('Не получилось', e?.message || '');
          }
        },
      },
    ]);
  }

  async function deleteThread() {
    if (activeThread.main) return;
    Alert.alert('Удалить этот чат?', 'Переписка удалится на всех устройствах.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/ai/threads/${activeThread.id}`, { method: 'DELETE' });
            setThreadId('main');
            setMsgs([]);
            setUndoForTurn(null);
            await loadThreads();
          } catch (e: any) {
            Alert.alert('Не получилось', e?.message || '');
          }
        },
      },
    ]);
  }

  async function undoLast() {
    try {
      const r = await api<{ ok: boolean; label?: string }>('/ai/undo', { method: 'POST' });
      if (r.ok) {
        setUndoForTurn(null);
        await load();
        haptic.success();
      } else {
        Alert.alert('Нечего отменять', 'Помощник пока ничего не записывал.');
      }
    } catch (e: any) {
      Alert.alert('Не получилось', e?.message || '');
    }
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || sending) return;
    haptic.tap();
    Keyboard.dismiss();
    setInput('');
    const turnId = `turn-${Date.now()}`;
    setUndoForTurn(null);
    setMsgs((p) => [...p, { id: turnId, role: 'user', content: t }]);
    setSending(true);
    try {
      await api('/ai/assistant', { body: { text: t, thread: threadId } });
      await load();
      await loadThreads();
      setUndoForTurn(turnId);
      haptic.success();
    } catch (e: any) {
      haptic.error();
      Alert.alert('Не получилось', e?.message || '');
    } finally {
      setSending(false);
    }
  }

  /** Готовую запись отправляем на распознавание и подставляем текст в поле. */
  async function transcribe(uri: string) {
    setSending(true);
    try {
      const token = await getToken();
      const res = await uploadAsync(`${API_URL}/ai/transcribe`, uri, {
        httpMethod: 'POST', uploadType: FileSystemUploadType.MULTIPART, fieldName: 'file',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.status >= 400) throw new Error('Ошибка ' + res.status);
      const data = JSON.parse(res.body || '{}');
      setSending(false);
      if (data.text) {
        setInput((prev) => (prev.trim() ? prev.trim() + ' ' : '') + data.text);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    } catch (e: any) {
      setSending(false);
      Alert.alert('Не распознал голос', e?.message || '');
    }
  }

  async function addByImage(fromCamera: boolean) {
    if (sending) return;
    if (activePreset.id !== 'finance') {
      Alert.alert('Скриншоты — в финансовом чате', 'Создай чат с пресетом «Финансы», чтобы записывать операции по изображению.');
      return;
    }
    const ImagePicker = await import('expo-image-picker');
    if (fromCamera) {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) return Alert.alert('Нужен доступ к камере');
    }
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.5, mediaTypes: ['images'] });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    const a = res.assets[0];
    setMsgs((p) => [...p, { id: 'tmp-img-' + p.length, role: 'user', content: 'Скриншот' }]);
    setSending(true);
    try {
      const r = await api<{ saved?: { transaction?: { amount: string; category: string; type: string } } }>('/ai/image', {
        body: { image: `data:${a.mimeType || 'image/jpeg'};base64,${a.base64}` },
      });
      const tx = r.saved?.transaction;
      setMsgs((p) => [...p, { id: 'tmp-r-' + p.length, role: 'assistant', content: tx ? `Записал со скриншота: ${tx.type === 'income' ? 'доход' : 'расход'} ${Math.round(Number(tx.amount))} ₽ · ${tx.category}` : 'Не нашёл операцию на скриншоте' }]);
    } catch (e: any) {
      Alert.alert('Не разобрал скриншот', e?.message || '');
    } finally {
      setSending(false);
    }
  }
  async function clearChat() {
    Alert.alert('Очистить чат?', 'Сообщения удалятся на всех устройствах.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Очистить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/ai/messages?thread=${encodeURIComponent(threadId)}`, { method: 'DELETE' });
            setMsgs([]);
            setUndoForTurn(null);
            haptic.success();
          } catch (e: any) {
            Alert.alert('Не получилось', e?.message || '');
          }
        },
      },
    ]);
  }

  const lastAssistantIndex = msgs.map((message) => message.role).lastIndexOf('assistant');

  // ----- Переключение чатов свайпом -----
  function goThread(direction: 1 | -1) {
    const index = threads.findIndex((thread) => String(thread.id) === String(threadId));
    const next = threads[index + direction];
    if (!next) {
      // Дальше чатов нет — «пружиним» обратно, чтобы жест не выглядел проглоченным.
      feedX.value = withSpring(0, { damping: 20, stiffness: 220 });
      return;
    }
    haptic.select();
    setThreadId(String(next.id));
    setUndoForTurn(null);
    feedX.value = direction === 1 ? screenWidth * 0.32 : -screenWidth * 0.32;
    feedX.value = withSpring(0, { damping: 22, stiffness: 210 });
  }

  const threadSwipe = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .failOffsetY([-24, 24])
    .onUpdate((event) => { feedX.value = event.translationX * 0.32; })
    .onEnd((event) => {
      if (event.translationX < -70 || event.velocityX < -700) runOnJS(goThread)(1);
      else if (event.translationX > 70 || event.velocityX > 700) runOnJS(goThread)(-1);
      else feedX.value = withSpring(0, { damping: 20, stiffness: 220 });
    });

  // Свайп от левого края открывает список переписок.
  const edgeSwipe = Gesture.Pan()
    .hitSlop({ left: 0, width: 34 })
    .activeOffsetX([14, 9999])
    .failOffsetY([-24, 24])
    // Открываем на старте жеста: если ждать отпускания, панель выпрыгивает
    // рывком уже после того, как палец убрали.
    .onStart(() => { runOnJS(setDrawerOpen)(true); });

  const feedGesture = Gesture.Exclusive(edgeSwipe, threadSwipe);

  const feedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: feedX.value }],
    opacity: interpolate(Math.abs(feedX.value), [0, screenWidth * 0.3], [1, 0.45], 'clamp'),
  }));

  return (
    <ThemedView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {/* Шапка как в референсе: круглая кнопка, по центру название чата
            со стрелкой (тап — список чатов), круглая кнопка справа. */}
        <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
          <AppleIconButton
            label="Список чатов"
            systemImage="line.3.horizontal"
            onPress={() => { haptic.tap(); setDrawerOpen(true); }}
            variant="glass"
            tint={theme.text}
            size={40}
          />

          <MenuView
            title="Переписки"
            actions={[
              ...threads.slice(0, 12).map((thread) => ({
                id: `thread:${thread.id}`,
                title: thread.title || 'Новый чат',
                image: (thread.preset === 'tech' ? 'desktopcomputer' : thread.preset === 'general' ? 'bubble.left.and.bubble.right.fill' : 'chart.pie.fill') as SFSymbol,
                state: (String(thread.id) === String(threadId) ? 'on' : 'off') as 'on' | 'off',
              })),
              { id: 'all', title: 'Все чаты', image: 'list.bullet' as SFSymbol },
            ]}
            onPressAction={(event) => {
              const action = event.nativeEvent.event;
              if (action === 'all') { setDrawerOpen(true); return; }
              const id = action.replace(/^thread:/, '');
              if (!id || id === threadId) return;
              haptic.select();
              setThreadId(id);
              setUndoForTurn(null);
            }}
            style={styles.headerTitle}>
            <View style={styles.titleRow}>
              <ThemedText style={styles.title} numberOfLines={1}>{activeThread.title || 'Помощник'}</ThemedText>
              <SymbolView name="chevron.down" tintColor={theme.textSecondary} size={13} />
            </View>
          </MenuView>

          <MenuView
            title="Помощник"
            actions={[
              { id: 'new', title: 'Новый чат', image: 'square.and.pencil' as SFSymbol },
              {
                id: 'preset',
                title: 'Режим',
                image: 'slider.horizontal.3' as SFSymbol,
                attributes: { disabled: !!activeThread.main },
                subactions: PRESETS.map((preset) => ({
                  id: `preset:${preset.id}`,
                  title: preset.title,
                  image: preset.icon,
                  state: activePreset.id === preset.id ? 'on' : 'off',
                })),
              },
              { id: 'clear', title: 'Очистить чат', image: 'trash' as SFSymbol, attributes: { destructive: true } },
              ...(activeThread.main ? [] : [{ id: 'delete', title: 'Удалить чат', image: 'trash.slash' as SFSymbol, attributes: { destructive: true } }]),
            ]}
            onPressAction={(event) => {
              const action = event.nativeEvent.event;
              if (action === 'new') void createThread('general');
              else if (action === 'clear') void clearChat();
              else if (action === 'delete') void deleteThread();
              else if (action.startsWith('preset:')) void changePreset(action.replace('preset:', '') as PresetId);
            }}>
            <AppleIconButton
              label="Ещё"
              systemImage="ellipsis"
              variant="glass"
              tint={theme.text}
              size={40}
              decorative
            />
          </MenuView>
        </View>

        <GestureDetector gesture={feedGesture}>
        <Reanimated.View style={[{ flex: 1 }, feedStyle]}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.feed}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollEnd(false)}>
          {msgs.length === 0 ? (
            <View style={styles.emptyWrap}>
              <SymbolView name="sparkles" tintColor={theme.tint} size={38} />
              <ThemedText style={styles.emptyTitle}>Что нужно сделать?</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                {activePreset.id === 'finance'
                  ? 'Например: «запиши 500 на такси» или «сколько мне должны».'
                  : activePreset.id === 'tech'
                    ? 'Расскажи, что выбираешь, для каких задач и какой примерно бюджет.'
                    : 'Можно обсудить идею, решение, план или просто поговорить.'}
              </ThemedText>
            </View>
          ) : (
            msgs.map((m, index) =>
              m.role === 'user' ? (
                <View key={m.id} style={styles.userRow}>
                  <View style={[styles.userBubble, { backgroundColor: theme.tint }]}>
                    <ThemedText style={{ color: '#fff' }}>{m.content}</ThemedText>
                  </View>
                  {!!hhmm(m.created_at) && <ThemedText type="small" themeColor="textSecondary" style={styles.time}>{hhmm(m.created_at)}</ThemedText>}
                </View>
              ) : (
                <View key={m.id} style={styles.aiRow}>
                  <View style={[styles.aiBubble, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
                    <ThemedText>{m.content}</ThemedText>
                  </View>
                  {!!hhmm(m.created_at) && <ThemedText type="small" themeColor="textSecondary" style={styles.time}>{hhmm(m.created_at)}</ThemedText>}
                  {index === lastAssistantIndex && undoForTurn && activePreset.id === 'finance' ? (
                    <AppleButton
                      label="Отменить действие"
                      systemImage="arrow.uturn.backward"
                      onPress={() => void undoLast()}
                      variant="plain"
                      role="destructive"
                      size="small"
                      style={styles.inlineUndo}
                    />
                  ) : null}
                </View>
              ),
            )
          )}
          {sending && (
            <View style={styles.typingRow}>
              <ActivityIndicator size="small" color={theme.textSecondary} />
            </View>
          )}
        </ScrollView>
        </Reanimated.View>
        </GestureDetector>

        <View style={[styles.dock, { paddingBottom: (kbHeight > 0 ? kbHeight : insets.bottom) + Spacing.two }]}>
          <View style={styles.composer}>
            <View style={[styles.bar, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
              <MenuView
                title="Добавить изображение"
                actions={[
                  { id: 'camera', title: 'Снять фото', image: 'camera.fill' },
                  { id: 'gallery', title: 'Выбрать из галереи', image: 'photo.on.rectangle' },
                ]}
                onPressAction={(event) => {
                  void addByImage(event.nativeEvent.event === 'camera');
                }}>
                {/* Без заливки: белый кружок внутри белой строки не читался. */}
                <AppleIconButton
                  label="Добавить"
                  systemImage="plus"
                  variant="plain"
                  tint={theme.text}
                  size={40}
                />
              </MenuView>
              <TextInput
                ref={inputRef}
                placeholder="Сообщение"
                placeholderTextColor={theme.textSecondary}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => send(input)}
                returnKeyType="send"
                multiline
                maxFontSizeMultiplier={1.18}
                style={[styles.input, { color: theme.text }]}
              />
              <HoldMic onResult={transcribe} disabled={sending} size={40} bottomOffset={62} />
              <AppleIconButton
                label="Отправить"
                systemImage="arrow.up"
                onPress={() => void send(input)}
                disabled={!input.trim() || sending}
                variant="prominent"
                size={40}
              />
            </View>
          </View>
        </View>
      </View>

      <ChatDrawer
        visible={drawerOpen}
        threads={threads}
        activeId={threadId}
        onClose={() => setDrawerOpen(false)}
        onPick={(id) => { setDrawerOpen(false); setThreadId(id); setUndoForTurn(null); }}
        onCreate={() => { setDrawerOpen(false); void createThread('general'); }}
        onDelete={(thread) => { setDrawerOpen(false); void deleteThreadById(String(thread.id)); }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  headerTitle: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 40 },
  title: { fontSize: 17, fontWeight: '700', lineHeight: 22, letterSpacing: -0.2, maxWidth: '82%' },
  threadPicker: { alignSelf: 'flex-start', marginLeft: -8, maxWidth: 250 },
  feed: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.two, flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.four, paddingVertical: Spacing.six, gap: Spacing.two },
  emptyTitle: { fontSize: 20, lineHeight: 26, fontWeight: '700', marginTop: Spacing.two },
  emptyText: { textAlign: 'center', maxWidth: 300 },
  time: { marginTop: 2, marginHorizontal: 6, fontSize: 11 },
  userRow: { alignItems: 'flex-end' },
  userBubble: { maxWidth: '85%', paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Radius.lg, borderBottomRightRadius: 6 },
  aiRow: { alignItems: 'flex-start', gap: 2 },
  aiBubble: { maxWidth: '90%', padding: Spacing.three, borderRadius: Radius.lg, borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  inlineUndo: { alignSelf: 'flex-start', marginTop: 2 },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, paddingHorizontal: 4 },
  dock: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  composer: { flexDirection: 'row', alignItems: 'flex-end' },
  bar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5, paddingVertical: 4, minHeight: 52, borderRadius: 26, borderWidth: 1 },
  input: { flex: 1, minWidth: 0, fontSize: 16, paddingHorizontal: 4, paddingVertical: 7, maxHeight: 100 },
});
