import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { useWorkspace } from '@/lib/workspace';

type Msg = { id: string; role: 'user' | 'assistant'; content: string; created_at?: string };
type Attachment = { uri: string; data: string };

const hhmm = (iso?: string) => iso
  ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  : '';

export function Assistant({ embedded = false }: { embedded?: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const workspace = useWorkspace();
  const [messages, setMessages] = useState<Msg[]>([]);
  const messagesRef = useRef<Msg[]>([]);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList<Msg>>(null);
  const inputRef = useRef<TextInput>(null);
  const localMode = workspace.selectedModel.startsWith('local:');

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useFocusEffect(useCallback(() => {
    inputRef.current?.blur();
    Keyboard.dismiss();
    return () => { inputRef.current?.blur(); Keyboard.dismiss(); };
  }, []));

  const load = useCallback(async () => {
    try {
      const result = await api<{ messages: Msg[] }>(`/ai/messages?thread=${encodeURIComponent(workspace.threadKey)}`);
      setMessages(result.messages || []);
    } catch {
      // История не блокирует экран.
    }
  }, [workspace.threadKey]);

  useEffect(() => {
    setMessages([]);
    setInput('');
    setAttachment(null);
    setError('');
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load, workspace.activeProject?.name, workspace.threadKey]);

  async function send(value: string, forcedAttachment = attachment) {
    const text = value.trim();
    if ((!text && !forcedAttachment) || sending) return;
    if (localMode && forcedAttachment) {
      setError('Фото пока обрабатывает облачная модель. Переключи модель или убери вложение.');
      return;
    }
    Keyboard.dismiss();
    setInput('');
    setAttachment(null);
    setError('');
    const optimistic = forcedAttachment ? `📷 ${text || 'Фото'}` : text;
    const userMessage: Msg = { id: `user-${Date.now()}`, role: 'user', content: optimistic };
    const outgoing = [...messagesRef.current, userMessage];
    setMessages(outgoing);
    setSending(true);
    haptic.tap();
    try {
      if (localMode) {
        const project = workspace.activeProject;
        const system = project ? [{
          role: 'system' as const,
          content: `Ты работаешь в Noda над проектом «${project.label || project.name}». Локальный путь: ${project.path || 'не указан'}. Не утверждай, что прочитал файлы, если их содержимое не передано в диалог.`,
        }] : [];
        const answer = await workspace.localChat([
          ...system,
          ...outgoing.map((message) => ({ role: message.role, content: message.content })),
        ]);
        const assistantMessage: Msg = { id: `local-assistant-${Date.now()}`, role: 'assistant', content: answer.content };
        setMessages((current) => [...current, assistantMessage]);
        await api('/ai/messages/sync', {
          body: {
            threadKey: workspace.threadKey,
            project: project ? { name: project.label || project.name, path: project.path, device: project.deviceName } : null,
            messages: [userMessage, assistantMessage],
          },
        }).catch(() => {});
      } else {
        const project = workspace.activeProject;
        await api('/ai/assistant', {
          body: {
            text,
            image: forcedAttachment?.data,
            threadKey: workspace.threadKey,
            project: project ? { name: project.label || project.name, path: project.path, device: project.deviceName } : null,
          },
        });
        await load();
      }
      workspace.refreshThreads();
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
    Alert.alert('Добавить фото', '', [
      { text: 'Камера', onPress: () => chooseImage(true) },
      { text: 'Галерея', onPress: () => chooseImage(false) },
      { text: 'Отмена', style: 'cancel' },
    ]);
  }

  function pickModel() {
    const actions: any[] = [
      { text: 'Noda Cloud', onPress: () => workspace.setSelectedModel('cloud') },
      ...workspace.models.map((model) => ({ text: `${model.name} · локально`, onPress: () => workspace.setSelectedModel(`local:${model.name}`) })),
      { text: 'Обновить список', onPress: workspace.refresh },
      { text: 'Отмена', style: 'cancel' },
    ];
    Alert.alert('Модель', workspace.devices.find((device) => device.id === workspace.activeDeviceId)?.name || '', actions);
  }

  function clearHistory() {
    if (!messages.length) return;
    Alert.alert('Очистить диалог?', '', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Очистить', style: 'destructive', onPress: async () => {
          if (!localMode) await api(`/ai/messages?thread=${encodeURIComponent(workspace.threadKey)}`, { method: 'DELETE' });
          setMessages([]);
        },
      },
    ]);
  }

  const renderMessage = ({ item }: { item: Msg }) => (
    <View style={item.role === 'user' ? styles.userRow : styles.aiRow}>
      {item.role === 'assistant' && (
        <View style={styles.aiMark}><SymbolView name="sparkles" tintColor={theme.text} size={15} /></View>
      )}
      <View style={item.role === 'user' ? styles.userBubble : styles.aiBubble}>
        <ThemedText style={styles.messageText}>{item.content}</ThemedText>
        {!!hhmm(item.created_at) && <ThemedText style={styles.time}>{hhmm(item.created_at)}</ThemedText>}
      </View>
    </View>
  );

  const empty = (
    <View style={styles.empty}>
      <ThemedText style={styles.emptyTitle}>{workspace.activeProject ? `Что делаем в ${workspace.activeProject.label || workspace.activeProject.name}?` : 'С чего начнём?'}</ThemedText>
      {workspace.activeProject && <ThemedText style={styles.emptyCopy}>Задача сохранится внутри проекта</ThemedText>}
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 48 : 0}>
        <View style={styles.contextBar}>
          <View style={styles.projectContext}>
            <View style={[styles.contextDot, workspace.activeProject && styles.contextDotActive]} />
            <ThemedText type="smallBold" numberOfLines={1} style={{ flex: 1 }}>
              {workspace.activeProject?.label || workspace.activeProject?.name || 'Новая задача'}
            </ThemedText>
          </View>
          <Pressable onPress={pickModel} style={({ pressed }) => [styles.modelButton, pressed && styles.pressed]}>
            <View style={[styles.modelDot, localMode && styles.modelDotLocal]} />
            <ThemedText style={styles.modelLabel} numberOfLines={1}>
              {localMode ? workspace.selectedModel.slice(6) : 'Noda Cloud'}
            </ThemedText>
            <SymbolView name="chevron.down" tintColor={theme.textSecondary} size={10} />
          </Pressable>
          {!!workspace.activeProject?.path && (
            <Pressable accessibilityLabel="Открыть проект на компьютере" onPress={() => router.push('/pc')} hitSlop={8} style={styles.clearButton}>
              <SymbolView name="terminal" tintColor={theme.textSecondary} size={15} />
            </Pressable>
          )}
          <Pressable onPress={clearHistory} hitSlop={8} style={styles.clearButton}>
            <SymbolView name="trash" tintColor={theme.textSecondary} size={15} />
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          style={styles.feed}
          contentContainerStyle={[styles.feedContent, !messages.length && styles.feedEmpty]}
          ListEmptyComponent={empty}
          ListFooterComponent={sending ? (
            <View style={styles.thinking}><ActivityIndicator size="small" color={theme.textSecondary} /><ThemedText style={styles.thinkingText}>Думаю…</ThemedText></View>
          ) : error ? (
            <View style={styles.error}><SymbolView name="exclamationmark.triangle.fill" tintColor={theme.danger} size={15} /><ThemedText style={[styles.errorText, { color: theme.danger }]}>{error}</ThemedText></View>
          ) : null}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        <View style={[styles.dock, { paddingBottom: Math.max(embedded ? 8 : insets.bottom, 8) }]}>
          {!!attachment && (
            <View style={styles.attachment}>
              <Image source={{ uri: attachment.uri }} style={{ width: 41, height: 41, borderRadius: 9 }} />
              <ThemedText type="small" style={{ flex: 1 }}>Фото добавлено</ThemedText>
              <TouchableOpacity onPress={() => setAttachment(null)}><SymbolView name="xmark.circle.fill" tintColor={theme.textSecondary} size={23} /></TouchableOpacity>
            </View>
          )}
          <View style={styles.composer}>
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              placeholder="Спросить Noda"
              placeholderTextColor={theme.textSecondary}
              multiline
              returnKeyType="default"
              style={[styles.input, { color: theme.text }]}
            />
            <View style={styles.composerActions}>
              <TouchableOpacity accessibilityLabel="Добавить" onPress={pickImage} style={styles.iconButton}>
                <SymbolView name="plus" tintColor={theme.textSecondary} size={20} />
              </TouchableOpacity>
              <ThemedText style={styles.composerContext} numberOfLines={1}>{workspace.activeProject?.label || 'Общий чат'}</ThemedText>
              {(input.trim() || attachment) ? (
                <TouchableOpacity accessibilityLabel="Отправить" disabled={sending} onPress={() => send(input)} style={styles.sendButton}>
                  <SymbolView name="arrow.up" tintColor="#171717" size={19} />
                </TouchableOpacity>
              ) : (
                <VoiceRecorder disabled={sending} onTranscript={(text) => { setInput(text); inputRef.current?.focus(); }} />
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, overflow: 'hidden' },
  contextBar: { minHeight: 45, paddingHorizontal: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)', flexDirection: 'row', alignItems: 'center', gap: 7 },
  projectContext: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  contextDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#666' },
  contextDotActive: { backgroundColor: '#ECECEC' },
  modelButton: { maxWidth: 152, height: 31, paddingHorizontal: 9, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.11)', backgroundColor: '#292929', flexDirection: 'row', alignItems: 'center', gap: 6 },
  modelDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#A0A0A0' },
  modelDotLocal: { backgroundColor: '#2FBF71' },
  modelLabel: { minWidth: 0, flexShrink: 1, color: '#BDBDBD', fontSize: 10 },
  clearButton: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center' },
  feed: { flex: 1, minHeight: 0 },
  feedContent: { paddingHorizontal: Spacing.three, paddingTop: 18, paddingBottom: 18, gap: 22 },
  feedEmpty: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 7, paddingVertical: 92 },
  emptyTitle: { fontSize: 23, lineHeight: 29, fontWeight: '600', letterSpacing: -0.7 },
  emptyCopy: { marginTop: 7, color: '#818181', fontSize: 13 },
  pressed: { opacity: 0.68 },
  userRow: { alignItems: 'flex-end', paddingLeft: 44 },
  aiRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingRight: 12 },
  aiMark: { width: 28, height: 28, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: '#292929', alignItems: 'center', justifyContent: 'center' },
  userBubble: { maxWidth: '94%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#303030' },
  aiBubble: { flex: 1, paddingTop: 3 },
  messageText: { fontSize: 15, lineHeight: 22 },
  time: { marginTop: 4, color: '#777', fontSize: 9, textAlign: 'right' },
  thinking: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 38 },
  thinkingText: { color: '#898989', fontSize: 12 },
  error: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(239,100,100,0.4)', borderRadius: 11, padding: 11, flexDirection: 'row', gap: 8, alignItems: 'center' },
  errorText: { flex: 1, fontSize: 12 },
  dock: { paddingHorizontal: Spacing.three, paddingTop: 7, gap: 7, backgroundColor: '#101010' },
  attachment: { minHeight: 55, borderRadius: 12, padding: 7, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#2B2B2B' },
  composer: { maxHeight: 150, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: '#262626', overflow: 'hidden' },
  input: { minHeight: 49, maxHeight: 105, paddingHorizontal: 15, paddingTop: 14, paddingBottom: 6, fontSize: 16, lineHeight: 21, textAlignVertical: 'top' },
  composerActions: { minHeight: 43, paddingHorizontal: 6, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  composerContext: { flex: 1, paddingHorizontal: 5, color: '#777', fontSize: 10 },
  sendButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#ECECEC', alignItems: 'center', justifyContent: 'center' },
});
