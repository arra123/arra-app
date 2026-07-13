import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, API_URL, getToken } from '@/lib/api';
import { haptic } from '@/lib/haptics';

type Msg = { id: string; role: 'user' | 'assistant'; content: string; created_at?: string };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const hhmm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '');

export function Assistant() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStart = useRef(0); // момент старта записи (реальные часы) — переживает сворачивание
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const pulse = useRef(new Animated.Value(1)).current;
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

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
    const show = Keyboard.addListener(showEvt, (e) => { setKbHeight(e.endCoordinates?.height || 0); scrollEnd(false); });
    const hide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, [scrollEnd]);

  // Запись на iOS продолжается в фоне (UIBackgroundModes: audio + shouldPlayInBackground).
  // JS-таймеры замирают при сворачивании, поэтому счётчик считаем от реального времени старта,
  // а при возврате в приложение сразу подтягиваем актуальную длительность.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && recording && recStart.current) {
        setRecSecs(Math.floor((Date.now() - recStart.current) / 1000));
      }
    });
    return () => sub.remove();
  }, [recording]);

  useEffect(() => {
    if (!recording) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.35, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [recording, pulse]);

  const load = useCallback(async () => {
    try {
      const r = await api<{ messages: Msg[] }>('/ai/messages');
      setMsgs(r.messages);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function undoLast() {
    try {
      const r = await api<{ ok: boolean; label?: string }>('/ai/undo', { method: 'POST' });
      if (r.ok) {
        await load();
        Alert.alert('Отменено', r.label ? `Удалено: ${r.label}` : 'Последняя запись удалена');
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
    setMsgs((p) => [...p, { id: 'tmp-' + p.length, role: 'user', content: t }]);
    setSending(true);
    try {
      await api('/ai/assistant', { body: { text: t } });
      await load();
      haptic.success();
    } catch (e: any) {
      haptic.error();
      Alert.alert('Не получилось', e?.message || '');
    } finally {
      setSending(false);
    }
  }

  async function startVoice() {
    if (sending || recording) return;
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return Alert.alert('Нужен доступ к микрофону');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    haptic.press();
    recStart.current = Date.now();
    setRecSecs(0);
    setRecording(true);
    // Считаем от реального времени старта — счётчик верен даже после сворачивания
    recTimer.current = setInterval(() => setRecSecs(Math.floor((Date.now() - recStart.current) / 1000)), 1000);
  }
  async function stopVoice(doSend: boolean) {
    if (!recording) return;
    haptic.tap();
    if (recTimer.current) clearInterval(recTimer.current);
    setRecording(false);
    try { await recorder.stop(); } catch { /* ignore */ }
    const uri = recorder.uri;
    const elapsed = recStart.current ? (Date.now() - recStart.current) / 1000 : recSecs;
    if (!doSend || !uri || elapsed < 1) return;
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
      if (data.text) setInput((prev) => (prev.trim() ? prev.trim() + ' ' : '') + data.text);
    } catch (e: any) {
      setSending(false);
      Alert.alert('Не распознал голос', e?.message || '');
    }
  }

  async function addByImage(fromCamera: boolean) {
    if (sending) return;
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
  const pickImageSource = () =>
    Alert.alert('Скриншот', 'Откуда взять?', [
      { text: 'Камера', onPress: () => addByImage(true) },
      { text: 'Галерея', onPress: () => addByImage(false) },
      { text: 'Отмена', style: 'cancel' },
    ]);

  return (
    <ThemedView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
          <ThemedText style={styles.title}>Помощник</ThemedText>
          <TouchableOpacity onPress={undoLast} hitSlop={8} style={[styles.undoBtn, { borderColor: theme.separator }]}>
            <SymbolView name="arrow.uturn.backward" tintColor={theme.textSecondary} size={14} />
            <ThemedText type="small" themeColor="textSecondary">Отменить</ThemedText>
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
          {msgs.length === 0 ? (
            <View style={styles.emptyWrap}>
              <SymbolView name="bubble.left.and.bubble.right" tintColor={theme.separator} size={44} />
            </View>
          ) : (
            msgs.map((m) =>
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

        <View style={[styles.dock, { paddingBottom: (kbHeight > 0 ? kbHeight : insets.bottom) + Spacing.two }]}>
          {recording ? (
            <View style={[styles.bar, { backgroundColor: theme.backgroundElement }]}>
              {/* Кнопка «готово» там же, где была кнопка микрофона — слева начал, слева и закончил */}
              <TouchableOpacity onPress={() => stopVoice(true)} activeOpacity={0.85}>
                <View style={[styles.micBig, { backgroundColor: theme.tint }]}><SymbolView name="checkmark" tintColor="#fff" size={22} /></View>
              </TouchableOpacity>
              <Animated.View style={[styles.recDot, { backgroundColor: theme.danger, transform: [{ scale: pulse }] }]} />
              <ThemedText style={{ flex: 1, color: theme.text, fontWeight: '600' }}>Слушаю… {mmss(recSecs)}</ThemedText>
              <TouchableOpacity onPress={() => stopVoice(false)} hitSlop={8} style={styles.mini}>
                <ThemedText type="smallBold" themeColor="textSecondary">Отмена</ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.bar, { backgroundColor: theme.backgroundElement }]}>
              <TouchableOpacity onPress={startVoice} activeOpacity={0.85}>
                <View style={[styles.micBig, { backgroundColor: theme.tint }]}>
                  <SymbolView name="mic.fill" tintColor="#fff" size={22} />
                </View>
              </TouchableOpacity>
              <TextInput
                ref={inputRef}
                placeholder="Сообщение"
                placeholderTextColor={theme.textSecondary}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => send(input)}
                returnKeyType="send"
                multiline
                style={[styles.input, { color: theme.text }]}
              />
              <TouchableOpacity onPress={pickImageSource} hitSlop={10} style={styles.mini}>
                <SymbolView name="camera.fill" tintColor={theme.textSecondary} size={24} />
              </TouchableOpacity>
              {input.trim() ? (
                <TouchableOpacity onPress={() => send(input)} disabled={sending} activeOpacity={0.8}>
                  <View style={[styles.send, { backgroundColor: theme.tint }]}>
                    {sending ? <ActivityIndicator color="#fff" size="small" /> : <SymbolView name="arrow.up" tintColor="#fff" size={22} />}
                  </View>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 34, fontWeight: '800', lineHeight: 40 },
  undoBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  feed: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.two, flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.six },
  time: { marginTop: 2, marginHorizontal: 6, fontSize: 11 },
  userRow: { alignItems: 'flex-end' },
  userBubble: { maxWidth: '85%', paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Radius.lg, borderBottomRightRadius: 6 },
  aiRow: { alignItems: 'flex-start' },
  aiBubble: { maxWidth: '90%', padding: Spacing.three, borderRadius: Radius.lg, borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, paddingHorizontal: 4 },
  dock: { paddingHorizontal: Spacing.three, paddingTop: Spacing.one },
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingLeft: 6, paddingRight: 6, paddingVertical: 5, minHeight: 52, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  input: { flex: 1, fontSize: 16, paddingVertical: Spacing.two, maxHeight: 100 },
  mini: { padding: 6 },
  micBig: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  send: { width: 40, height: 40, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  recDot: { width: 16, height: 16, borderRadius: 8, marginLeft: Spacing.two },
});
