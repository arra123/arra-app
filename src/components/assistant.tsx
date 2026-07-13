import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VoiceRecorder } from '@/components/voice-recorder';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';

type Msg = { id: string; role: 'user' | 'assistant'; content: string; created_at?: string };
type Attachment = { uri: string; data: string };

const hhmm = (iso?: string) => iso
  ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  : '';

const STARTERS = [
  'Помоги распланировать день',
  'Создай заметку из моих мыслей',
  'Объясни сложное простыми словами',
];

export function Assistant() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const scrollEnd = useCallback((animated = true) => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated }));
  }, []);

  useFocusEffect(useCallback(() => {
    inputRef.current?.blur();
    Keyboard.dismiss();
    return () => { inputRef.current?.blur(); Keyboard.dismiss(); };
  }, []));

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height || 0);
      scrollEnd(false);
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, [scrollEnd]);

  const load = useCallback(async () => {
    try {
      const result = await api<{ messages: Msg[] }>('/ai/messages');
      setMessages(result.messages || []);
    } catch {
      // История не блокирует сам экран: ошибка отправки будет показана отдельно.
    }
  }, []);

  useEffect(() => {
    // История загружается после первого кадра, чтобы открытие вкладки не блокировалось сетью.
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function send(value: string, forcedAttachment = attachment) {
    const text = value.trim();
    if ((!text && !forcedAttachment) || sending) return;
    Keyboard.dismiss();
    setInput('');
    setAttachment(null);
    setError('');
    const optimistic = forcedAttachment ? `📷 ${text || 'Фото'}` : text;
    setMessages((current) => [...current, { id: `tmp-${Date.now()}`, role: 'user', content: optimistic }]);
    setSending(true);
    haptic.tap();
    try {
      await api('/ai/assistant', { body: { text, image: forcedAttachment?.data } });
      await load();
      haptic.success();
    } catch (sendError: any) {
      haptic.error();
      setError(sendError?.message || 'Не удалось получить ответ');
    } finally {
      setSending(false);
    }
  }

  async function chooseImage(fromCamera: boolean) {
    if (sending) return;
    const ImagePicker = await import('expo-image-picker');
    if (fromCamera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return Alert.alert('Нужен доступ к камере');
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.55 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.55, mediaTypes: ['images'] });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset?.base64) return;
    setAttachment({ uri: asset.uri, data: `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` });
  }

  function pickImage() {
    Alert.alert('Фото для Noda', '', [
      { text: 'Снять', onPress: () => chooseImage(true) },
      { text: 'Из галереи', onPress: () => chooseImage(false) },
      { text: 'Отмена', style: 'cancel' },
    ]);
  }

  function clearHistory() {
    if (!messages.length) return;
    Alert.alert('Очистить диалог?', 'Заметки и другие данные не удалятся.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Очистить', style: 'destructive', onPress: async () => { await api('/ai/messages', { method: 'DELETE' }); setMessages([]); } },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View>
          <View style={styles.nameRow}>
            <View style={[styles.liveDot, { backgroundColor: theme.tint }]} />
            <ThemedText style={styles.title}>Noda</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">вопросы, фото и работа с заметками</ThemedText>
        </View>
        <TouchableOpacity onPress={clearHistory} hitSlop={10} style={[styles.clearButton, { borderColor: theme.separator }]}>
          <SymbolView name="trash" tintColor={theme.textSecondary} size={16} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.feed}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollEnd(false)}>
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.orb, { backgroundColor: `${theme.tint}1A`, borderColor: `${theme.tint}45` }]}>
              <SymbolView name="sparkles" tintColor={theme.tint} size={30} />
            </View>
            <ThemedText style={styles.emptyTitle}>Спросите что угодно</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              Noda может отвечать на обычные вопросы, разбирать фото, создавать и редактировать ваши заметки.
            </ThemedText>
            <View style={styles.starters}>
              {STARTERS.map((starter) => (
                <Pressable key={starter} onPress={() => setInput(starter)} style={[styles.starter, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="small">{starter}</ThemedText>
                  <SymbolView name="arrow.up.left" tintColor={theme.textSecondary} size={13} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          messages.map((message) => (
            <View key={message.id} style={message.role === 'user' ? styles.userRow : styles.aiRow}>
              {message.role === 'assistant' && (
                <View style={[styles.aiMark, { backgroundColor: `${theme.tint}1F` }]}>
                  <SymbolView name="sparkles" tintColor={theme.tint} size={14} />
                </View>
              )}
              <View style={message.role === 'user'
                ? [styles.userBubble, { backgroundColor: theme.tint }]
                : [styles.aiBubble, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText style={message.role === 'user' ? { color: '#07120D' } : undefined}>{message.content}</ThemedText>
                {!!hhmm(message.created_at) && (
                  <ThemedText type="small" style={[styles.time, { color: message.role === 'user' ? 'rgba(7,18,13,0.55)' : theme.textSecondary }]}>{hhmm(message.created_at)}</ThemedText>
                )}
              </View>
            </View>
          ))
        )}
        {sending && (
          <View style={styles.aiRow}>
            <View style={[styles.aiMark, { backgroundColor: `${theme.tint}1F` }]}><SymbolView name="sparkles" tintColor={theme.tint} size={14} /></View>
            <View style={[styles.typing, { backgroundColor: theme.backgroundElement }]}>
              <ActivityIndicator size="small" color={theme.tint} /><ThemedText type="small" themeColor="textSecondary">Думаю…</ThemedText>
            </View>
          </View>
        )}
        {!!error && (
          <Pressable onPress={() => send(input)} style={[styles.error, { borderColor: theme.danger }]}>
            <SymbolView name="exclamationmark.triangle.fill" tintColor={theme.danger} size={16} />
            <ThemedText type="small" style={{ color: theme.danger, flex: 1 }}>{error}</ThemedText>
          </Pressable>
        )}
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: (keyboardHeight > 0 ? keyboardHeight : insets.bottom) + Spacing.two }]}>
        <VoiceRecorder disabled={sending} hint="держите · вверх — зафиксировать · влево — отмена" onTranscript={(text) => send(text, null)} />
        {!!attachment && (
          <View style={[styles.attachment, { backgroundColor: theme.backgroundElement }]}>
            <Image source={{ uri: attachment.uri }} style={styles.attachmentImage} />
            <View style={{ flex: 1 }}><ThemedText type="smallBold">Фото прикреплено</ThemedText><ThemedText type="small" themeColor="textSecondary">Добавьте вопрос или отправьте сразу</ThemedText></View>
            <TouchableOpacity onPress={() => setAttachment(null)}><SymbolView name="xmark.circle.fill" tintColor={theme.textSecondary} size={23} /></TouchableOpacity>
          </View>
        )}
        <View style={[styles.composer, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
          <TouchableOpacity onPress={pickImage} style={styles.iconButton}>
            <SymbolView name="plus" tintColor={theme.textSecondary} size={22} />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            placeholder="Сообщение Noda"
            placeholderTextColor={theme.textSecondary}
            multiline
            returnKeyType="default"
            style={[styles.input, { color: theme.text }]}
          />
          {(input.trim() || attachment) ? (
            <TouchableOpacity disabled={sending} onPress={() => send(input)} style={[styles.sendButton, { backgroundColor: theme.tint }]}>
              <SymbolView name="arrow.up" tintColor="#07120D" size={21} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D100F' },
  header: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  title: { fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -1.1 },
  clearButton: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  feed: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.four, gap: 10, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.five },
  orb: { width: 72, height: 72, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.three },
  emptyTitle: { fontSize: 24, lineHeight: 30, fontWeight: '800' },
  emptyText: { maxWidth: 310, textAlign: 'center', marginTop: 6 },
  starters: { width: '100%', gap: 7, marginTop: Spacing.four },
  starter: { minHeight: 46, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  userRow: { alignItems: 'flex-end', paddingLeft: 40 },
  aiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingRight: 30 },
  aiMark: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  userBubble: { maxWidth: '94%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, borderBottomRightRadius: 6 },
  aiBubble: { maxWidth: '94%', paddingVertical: 11, paddingHorizontal: 14, borderRadius: 18, borderBottomLeftRadius: 6 },
  time: { fontSize: 10, lineHeight: 13, textAlign: 'right', marginTop: 3 },
  typing: { minHeight: 44, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  error: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center' },
  dock: { paddingHorizontal: Spacing.three, paddingTop: 7, gap: 7, backgroundColor: '#0D100F' },
  attachment: { minHeight: 58, borderRadius: 14, padding: 7, flexDirection: 'row', alignItems: 'center', gap: 10 },
  attachmentImage: { width: 44, height: 44, borderRadius: 10 },
  composer: { minHeight: 52, maxHeight: 130, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, padding: 5, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 40, maxHeight: 112, paddingVertical: 9, fontSize: 16, lineHeight: 21 },
  sendButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
