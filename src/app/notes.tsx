import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
import { VoiceRecorder } from '@/components/voice-recorder';
import { haptic } from '@/lib/haptics';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';

type Note = { id: string; title: string | null; body: string; structured_body?: string | null; structured_at?: string | null; color?: string | null; updated_at: string; created_at: string };
type Editing = Note | 'new' | null;

// Категории-цвета заметок (подсветка)
const NOTE_CATS: { color: string; label: string }[] = [
  { color: '#7C85FF', label: 'Работа' },
  { color: '#8798B8', label: 'Личное' },
  { color: '#D8B65A', label: 'Идеи' },
  { color: '#E06C75', label: 'Важное' },
  { color: '#6F9AE8', label: 'Учёба' },
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
  // Текст заметки держим в ref (неконтролируемый ввод) — иначе большой текст
  // перерисовывается на каждый символ и всё виснет. bodyKey форсит ремоунт при
  // открытии другой заметки / вставке надиктованного.
  const bodyRef = useRef('');
  const structuredRef = useRef('');
  const titleInputRef = useRef<TextInput>(null);
  const bodyInputRef = useRef<TextInput>(null);
  const [bodyKey, setBodyKey] = useState(0);
  const setBodyText = (t: string) => { bodyRef.current = t; setBodyKey((k) => k + 1); };
  const [color, setColor] = useState<string | null>(null);
  const [version, setVersion] = useState<'original' | 'structured'>('original');
  const [structuring, setStructuring] = useState(false);
  const [saving, setSaving] = useState(false);
  function appendVoice(text: string) {
    bodyRef.current = `${bodyRef.current.trim()}${bodyRef.current.trim() ? '\n\n' : ''}${text.trim()}`;
    setVersion('original');
    setBodyKey((key) => key + 1);
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
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openNew() {
    Keyboard.dismiss();
    setTitle('');
    setBodyText('');
    structuredRef.current = '';
    setVersion('original');
    setColor(null);
    setEditing('new');
  }
  function openNote(n: Note) {
    Keyboard.dismiss();
    setTitle(n.title || '');
    setBodyText(n.body);
    structuredRef.current = n.structured_body || '';
    setVersion('original');
    setColor(n.color || null);
    setEditing(n);
  }
  function close() {
    Keyboard.dismiss();
    setEditing(null);
  }

  async function save() {
    if (saving) return;
    const body = bodyRef.current;
    if (!title.trim() && !body.trim()) {
      close();
      return;
    }
    setSaving(true);
    try {
      if (editing === 'new') {
        await api('/notes', { body: { title: title.trim(), body, structured_body: structuredRef.current.trim() || null, color } });
      } else if (editing) {
        await api(`/notes/${editing.id}`, { method: 'PUT', body: { title: title.trim(), body, structured_body: structuredRef.current.trim() || null, color } });
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

  function switchVersion(next: 'original' | 'structured') {
    if (next === 'structured' && !structuredRef.current.trim()) return;
    titleInputRef.current?.blur(); bodyInputRef.current?.blur(); Keyboard.dismiss();
    setVersion(next);
    setBodyKey((k) => k + 1);
  }

  async function structureCurrent() {
    const source = bodyRef.current.trim();
    if (!source || structuring) return;
    setStructuring(true);
    Keyboard.dismiss();
    try {
      const r = await api<{ structuredBody: string }>('/notes/structure', { body: { text: source } });
      structuredRef.current = r.structuredBody || '';
      setVersion('structured');
      setBodyKey((k) => k + 1);
      haptic.success();
    } catch (e: any) {
      Alert.alert('Не получилось структурировать', e?.message || '');
    } finally {
      setStructuring(false);
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

  // Горизонтальный свайп переключает оригинал и AI-версию. Оригинал не перезаписывается.
  const versionGesture = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-18, 18])
    .onEnd((e) => {
      if (e.translationX < -80) runOnJS(switchVersion)('structured');
      else if (e.translationX > 80) runOnJS(switchVersion)('original');
    });

  // ----- Редактор -----
  if (editing) {
    return (
      <ThemedView style={styles.container}>
        <GestureDetector gesture={versionGesture}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.editorBar, { paddingTop: insets.top + Spacing.two }]}>
            <TouchableOpacity onPress={save} hitSlop={10} style={styles.barBtn}>
              <SymbolView name="chevron.left" tintColor={theme.tint} size={22} />
              <ThemedText style={{ color: theme.tint }}>Готово</ThemedText>
            </TouchableOpacity>
            <View style={styles.barRight}>
              <TouchableOpacity onPress={() => { titleInputRef.current?.blur(); bodyInputRef.current?.blur(); Keyboard.dismiss(); }} hitSlop={10} style={[styles.keyboardDown, { backgroundColor: theme.backgroundSelected }]}>
                <SymbolView name="keyboard.chevron.compact.down" tintColor={theme.textSecondary} size={17} />
              </TouchableOpacity>
              {editing !== 'new' && (
                <TouchableOpacity onPress={remove} hitSlop={10}>
                  <SymbolView name="trash" tintColor={theme.danger} size={20} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.versionBar}>
            <View style={[styles.versionSeg, { backgroundColor: theme.backgroundSelected }]}>
              <TouchableOpacity onPress={() => switchVersion('original')} style={[styles.versionBtn, version === 'original' && { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold" style={{ color: version === 'original' ? theme.text : theme.textSecondary }}>Оригинал</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity disabled={!structuredRef.current.trim()} onPress={() => switchVersion('structured')} style={[styles.versionBtn, version === 'structured' && { backgroundColor: theme.backgroundElement }, !structuredRef.current.trim() && { opacity: 0.45 }]}>
                <ThemedText type="smallBold" style={{ color: version === 'structured' ? theme.text : theme.textSecondary }}>AI-версия</ThemedText>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={structureCurrent} disabled={structuring} style={[styles.structureBtn, { borderColor: theme.separator, opacity: structuring ? 0.55 : 1 }]}>
              {structuring ? <ActivityIndicator size="small" color={theme.tint} /> : <SymbolView name="wand.and.stars" tintColor={theme.tint} size={16} />}
              <ThemedText type="smallBold" style={{ color: theme.tint }}>{structuredRef.current.trim() ? 'Обновить' : 'Структурировать'}</ThemedText>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" onScrollBeginDrag={Keyboard.dismiss}>
            <TextInput
              ref={titleInputRef}
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
              ref={bodyInputRef}
              key={`${bodyKey}-${version}`}
              placeholder={version === 'original' ? 'Текст заметки…' : 'Структурированная AI-версия…'}
              placeholderTextColor={theme.textSecondary}
              defaultValue={version === 'original' ? bodyRef.current : structuredRef.current}
              onChangeText={(t) => { if (version === 'original') bodyRef.current = t; else structuredRef.current = t; }}
              multiline
              scrollEnabled={false}
              style={[styles.bodyInput, { color: theme.text }]}
            />
          </ScrollView>
          <View style={[styles.voiceDock, { paddingBottom: Math.max(insets.bottom, BottomTabInset) + Spacing.two, backgroundColor: theme.background }]}>
            <View style={[styles.voiceComposer, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
              <SymbolView name="waveform" tintColor={theme.textSecondary} size={18} />
              <View style={{ flex: 1 }} />
              <VoiceRecorder onTranscript={appendVoice} />
            </View>
          </View>
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
                      {!!n.structured_body?.trim() && <SymbolView name="wand.and.stars" tintColor={theme.tint} size={13} />}
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
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing.three, paddingBottom: BottomTabInset + Spacing.five, gap: Spacing.three },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontSize: 34, fontWeight: '700', lineHeight: 40, marginTop: Spacing.one },
  addBtn: { width: 42, height: 42, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { paddingVertical: Spacing.five, alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  noteCard: { padding: Spacing.three, backgroundColor: '#242428', borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.07)' },
  noteTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  noteTime: { marginTop: Spacing.two, fontSize: 12 },
  catRow: { gap: 8, paddingVertical: Spacing.two, paddingRight: Spacing.three },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  catDot: { width: 9, height: 9, borderRadius: 5 },
  swipeDelete: { width: 76, marginLeft: Spacing.two, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  editorBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  barBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  keyboardDown: { width: 34, height: 34, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  editorContent: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.five, gap: Spacing.two },
  versionBar: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  versionSeg: { flex: 1, flexDirection: 'row', borderRadius: Radius.md, padding: 3 },
  versionBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.sm },
  structureBtn: { minHeight: 40, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 6 },
  titleInput: { fontSize: 26, fontWeight: '700', fontFamily: 'Inter_700Bold', paddingVertical: Spacing.two },
  bodyInput: { fontSize: 17, lineHeight: 25, fontFamily: 'Inter_400Regular', minHeight: 300, textAlignVertical: 'top' },
  voiceDock: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  voiceComposer: { minHeight: 52, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, padding: 5, paddingLeft: 15, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
