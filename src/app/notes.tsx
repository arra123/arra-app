import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassCard } from '@/components/glass-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { haptic } from '@/lib/haptics';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, API_URL, getToken } from '@/lib/api';

type Note = { id: string; title: string | null; body: string; color?: string | null; updated_at: string; created_at: string };
type Editing = Note | 'new' | null;

// Категории-цвета заметок (подсветка)
const NOTE_CATS: { color: string; label: string }[] = [
  { color: '#5B8DEF', label: 'Работа' },
  { color: '#4CB782', label: 'Личное' },
  { color: '#E0A33E', label: 'Идеи' },
  { color: '#E06C75', label: 'Важное' },
  { color: '#9A7BE0', label: 'Учёба' },
];
const catLabel = (c?: string | null) => NOTE_CATS.find((x) => x.color === c)?.label || '';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function NotesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const dictStart = useRef(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  async function toggleDictate() {
    if (!dictating) {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return Alert.alert('Нужен доступ к микрофону');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      dictStart.current = Date.now();
      setDictating(true);
      return;
    }
    setDictating(false);
    const tooShort = Date.now() - dictStart.current < 1200;
    try {
      await recorder.stop();
    } catch {
      /* ignore */
    }
    const uri = recorder.uri;
    if (!uri || tooShort) return; // ничего не наговорил — не распознаём
    setTranscribing(true);
    try {
      const token = await getToken();
      const res = await uploadAsync(`${API_URL}/ai/transcribe`, uri, {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.status >= 400) throw new Error('Ошибка ' + res.status);
      const data = JSON.parse(res.body || '{}');
      if (data.text) setBody((b) => (b.trim() ? b.trim() + ' ' : '') + data.text);
    } catch (e: any) {
      Alert.alert('Не распознал', e?.message || '');
    } finally {
      setTranscribing(false);
    }
  }

  const load = useCallback(async () => {
    try {
      const r = await api<{ notes: Note[] }>('/notes');
      setNotes(r.notes);
    } catch (e: any) {
      Alert.alert('Ошибка загрузки', e?.message || '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openNew() {
    setTitle('');
    setBody('');
    setColor(null);
    setEditing('new');
  }
  function openNote(n: Note) {
    setTitle(n.title || '');
    setBody(n.body);
    setColor(n.color || null);
    setEditing(n);
  }
  function close() {
    setEditing(null);
  }

  async function save() {
    if (saving) return;
    if (!title.trim() && !body.trim()) {
      close();
      return;
    }
    setSaving(true);
    try {
      if (editing === 'new') {
        await api('/notes', { body: { title: title.trim(), body, color } });
      } else if (editing) {
        await api(`/notes/${editing.id}`, { method: 'PUT', body: { title: title.trim(), body, color } });
      }
      haptic.success();
      close();
      await load();
    } catch (e: any) {
      Alert.alert('Не сохранилось', e?.message || '');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (editing === 'new' || !editing) {
      close();
      return;
    }
    const id = editing.id;
    Alert.alert('Удалить заметку?', '', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          close();
          try {
            await api(`/notes/${id}`, { method: 'DELETE' });
            await load();
          } catch (e: any) {
            Alert.alert('Ошибка', e?.message || '');
          }
        },
      },
    ]);
  }

  // Удаление свайпом из списка (как в Apple)
  async function deleteNote(id: string) {
    setNotes((p) => p.filter((n) => n.id !== id));
    try { await api(`/notes/${id}`, { method: 'DELETE' }); } catch { load(); }
  }

  // Свайп вправо — выйти из заметки (с сохранением)
  const exitGesture = Gesture.Pan()
    .activeOffsetX(24)
    .onEnd((e) => {
      if (e.translationX > 80) runOnJS(save)();
    });

  // ----- Редактор -----
  if (editing) {
    return (
      <ThemedView style={styles.container}>
        <GestureDetector gesture={exitGesture}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.editorBar, { paddingTop: insets.top + Spacing.two }]}>
            <TouchableOpacity onPress={save} hitSlop={10} style={styles.barBtn}>
              <SymbolView name="chevron.left" tintColor={theme.tint} size={22} />
              <ThemedText style={{ color: theme.tint }}>Готово</ThemedText>
            </TouchableOpacity>
            <View style={styles.barRight}>
              <TouchableOpacity
                onPress={toggleDictate}
                hitSlop={10}
                disabled={transcribing}
                style={[styles.dictateBtn, { backgroundColor: dictating ? theme.danger : theme.backgroundSelected }]}>
                {transcribing ? (
                  <ActivityIndicator size="small" color={theme.tint} />
                ) : (
                  <SymbolView name={dictating ? 'stop.fill' : 'mic.fill'} tintColor={dictating ? '#fff' : theme.text} size={16} />
                )}
                <ThemedText type="small" style={{ color: dictating ? '#fff' : theme.text, fontWeight: '600' }}>
                  {dictating ? 'Стоп' : transcribing ? 'Распознаю…' : 'Диктовать'}
                </ThemedText>
              </TouchableOpacity>
              {editing !== 'new' && (
                <TouchableOpacity onPress={remove} hitSlop={10}>
                  <SymbolView name="trash" tintColor={theme.danger} size={20} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
            <TextInput
              placeholder="Заголовок"
              placeholderTextColor={theme.textSecondary}
              value={title}
              onChangeText={setTitle}
              style={[styles.titleInput, { color: theme.text }]}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.catRow} keyboardShouldPersistTaps="handled">
              {NOTE_CATS.map((cat) => {
                const on = color === cat.color;
                return (
                  <TouchableOpacity key={cat.color} onPress={() => setColor(on ? null : cat.color)} style={[styles.catChip, { backgroundColor: on ? cat.color : 'rgba(255,255,255,0.06)', borderColor: cat.color }]}>
                    <View style={[styles.catDot, { backgroundColor: cat.color }]} />
                    <ThemedText type="small" style={{ color: on ? '#fff' : theme.text, fontWeight: '600' }}>{cat.label}</ThemedText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TextInput
              placeholder="Текст заметки…"
              placeholderTextColor={theme.textSecondary}
              value={body}
              onChangeText={setBody}
              multiline
              style={[styles.bodyInput, { color: theme.text }]}
            />
          </ScrollView>
          {saving && <ActivityIndicator style={{ marginBottom: insets.bottom + Spacing.two }} color={theme.tint} />}
        </KeyboardAvoidingView>
        </GestureDetector>
      </ThemedView>
    );
  }

  // ----- Список -----
  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textSecondary} />}>
        <View style={styles.headRow}>
          <ThemedText style={styles.h1}>Заметки</ThemedText>
          <TouchableOpacity onPress={openNew} activeOpacity={0.85}>
            <View style={[styles.addBtn, { backgroundColor: theme.tint }]}>
              <SymbolView name="plus" tintColor="#fff" size={20} />
            </View>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: Spacing.five }} />
        ) : notes.length === 0 ? (
          <GlassCard radius={Radius.lg} style={styles.emptyCard}>
            <SymbolView name="note.text" tintColor={theme.textSecondary} size={34} />
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Пусто. Нажми + — заметка появится и на компьютере.
            </ThemedText>
          </GlassCard>
        ) : (
          <View style={{ gap: Spacing.two }}>
            {notes.map((n) => (
              <ReanimatedSwipeable
                key={n.id}
                friction={1.1}
                rightThreshold={30}
                overshootRight={false}
                renderRightActions={() => (
                  <TouchableOpacity onPress={() => { haptic.warning(); deleteNote(n.id); }} activeOpacity={0.8} style={[styles.swipeDelete, { backgroundColor: theme.danger }]}>
                    <SymbolView name="trash.fill" tintColor="#fff" size={22} />
                  </TouchableOpacity>
                )}>
                <Pressable onPress={() => openNote(n)}>
                  {/* Плоская карточка (без блюра) — иначе свайп дёргался */}
                  <View style={[styles.noteCard, n.color ? { borderLeftWidth: 4, borderLeftColor: n.color } : null]}>
                    <View style={styles.noteTitleRow}>
                      {!!n.color && <View style={[styles.catDot, { backgroundColor: n.color }]} />}
                      <ThemedText type="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                        {n.title?.trim() || 'Без названия'}
                      </ThemedText>
                      {!!catLabel(n.color) && <ThemedText type="small" style={{ color: n.color || theme.textSecondary, fontWeight: '600' }}>{catLabel(n.color)}</ThemedText>}
                    </View>
                    {!!n.body.trim() && (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={{ marginTop: 3 }}>
                        {n.body.trim()}
                      </ThemedText>
                    )}
                    <ThemedText type="small" themeColor="textSecondary" style={styles.noteTime}>
                      {fmtTime(n.updated_at)}
                    </ThemedText>
                  </View>
                </Pressable>
              </ReanimatedSwipeable>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // Фон в стиле Telegram (тёмно-синий графит)
  container: { flex: 1, backgroundColor: '#0E1621' },
  content: { paddingHorizontal: Spacing.three, paddingBottom: BottomTabInset + Spacing.five, gap: Spacing.three },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontSize: 34, fontWeight: '700', lineHeight: 40, marginTop: Spacing.one },
  addBtn: { width: 42, height: 42, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { paddingVertical: Spacing.five, alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  noteCard: { padding: Spacing.three, backgroundColor: '#17212B', borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.07)' },
  noteTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  noteTime: { marginTop: Spacing.two, fontSize: 12 },
  catRow: { gap: 8, paddingVertical: Spacing.two, paddingRight: Spacing.three },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  catDot: { width: 9, height: 9, borderRadius: 5 },
  swipeDelete: { width: 76, marginLeft: Spacing.two, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  editorBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  barBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  dictateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: Radius.pill },
  editorContent: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.five, gap: Spacing.two },
  titleInput: { fontSize: 26, fontWeight: '700', fontFamily: 'Inter_700Bold', paddingVertical: Spacing.two },
  bodyInput: { fontSize: 17, lineHeight: 25, fontFamily: 'Inter_400Regular', minHeight: 300, textAlignVertical: 'top' },
});
