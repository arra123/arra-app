import { MenuView } from '@expo/ui/community/menu';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassCard } from '@/components/glass-card';
import { AppleButton, AppleIconButton } from '@/components/apple-button';
import { AppleSegmented } from '@/components/apple-segmented';
import { HoldMic } from '@/components/hold-mic';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { haptic } from '@/lib/haptics';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, API_URL, getToken } from '@/lib/api';
import { onQuickAction, takeQuickAction } from '@/lib/quick-action';

type Note = { id: string; title: string | null; body: string; structured_body?: string | null; structured_at?: string | null; color?: string | null; updated_at: string; created_at: string };
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

const noteSection = (iso: string) => {
  const now = new Date();
  const date = new Date(iso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const noteDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.max(0, Math.round((today - noteDay) / 86400000));
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  if (days <= 7) return 'Предыдущие 7 дней';
  if (days <= 30) return 'Предыдущие 30 дней';
  return 'Ранее';
};

export default function NotesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [query, setQuery] = useState('');
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
  const [transcribing, setTranscribing] = useState(false);

  /** Готовую голосовую запись распознаём и дописываем в конец заметки. */
  async function transcribe(uri: string) {
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
      if (data.text) setBodyText((bodyRef.current.trim() ? bodyRef.current.trim() + ' ' : '') + data.text);
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

  // Быстрое действие из виджета: сразу новая заметка.
  useEffect(() => {
    if (takeQuickAction('note')) openNew();
    return onQuickAction((action) => { if (action === 'note') openNew(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function insertBodyTemplate(template: string) {
    if (version !== 'original') return;
    const current = bodyRef.current;
    const separator = current && !current.endsWith('\n') ? '\n' : '';
    setBodyText(`${current}${separator}${template}`);
    requestAnimationFrame(() => bodyInputRef.current?.focus());
  }

  /**
   * Закрываем редактор сразу, а на сервер пишем в фоне.
   *
   * Раньше свайп ждал ответа сети: экран замирал, потом список перезагружался
   * целиком — со стороны это выглядело как «страница странно обновляется».
   */
  function save() {
    const target = editing;
    const body = bodyRef.current;
    const trimmedTitle = title.trim();
    const structured = structuredRef.current.trim() || null;
    const noteColor = color;
    close();
    if (!target) return;
    if (!trimmedTitle && !body.trim()) {
      // Пустую новую заметку не создаём; пустую старую — просто оставляем как есть.
      if (target === 'new') return;
    }
    const payload = { title: trimmedTitle, body, structured_body: structured, color: noteColor };
    const now = new Date().toISOString();

    if (target === 'new') {
      const draft: Note = { id: `draft-${Date.now()}`, title: trimmedTitle, body, structured_body: structured, color: noteColor, updated_at: now, created_at: now };
      setNotes((current) => [draft, ...current]);
      api('/notes', { body: payload })
        .then(() => load())
        .catch((e: any) => {
          setNotes((current) => current.filter((n) => n.id !== draft.id));
          Alert.alert('Не сохранилось', e?.message || '');
        });
      return;
    }

    setNotes((current) => current.map((n) => n.id === target.id ? { ...n, ...payload, updated_at: now } : n));
    api(`/notes/${target.id}`, { method: 'PUT', body: payload }).catch((e: any) => {
      Alert.alert('Не сохранилось', e?.message || '');
      load();
    });
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

  // ----- Редактор -----
  const editor = editing ? (
    <Modal
      visible
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      allowSwipeDismissal={Platform.OS === 'ios'}
      onRequestClose={() => save()}>
      <ThemedView style={styles.editorLayer}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.editorBar, { paddingTop: Platform.OS === 'ios' ? Spacing.two : insets.top + Spacing.two }]}>
            <AppleIconButton
              label="Назад к заметкам"
              systemImage="chevron.down"
              onPress={() => save()}
              variant="plain"
              tint={theme.tint}
              size={40}
            />
            {/* Переключатель версий живёт в самой шапке: отдельной строкой он
                оставлял между кнопками пустую полосу. */}
            <View style={styles.headSegment}>
              <AppleSegmented
                values={['Оригинал', 'AI-версия']}
                selectedIndex={version === 'original' ? 0 : 1}
                enabled={!structuring}
                onChange={(index) => switchVersion(index === 0 ? 'original' : 'structured')}
              />
            </View>
            <View style={styles.barRight}>
              {structuring || transcribing ? <ActivityIndicator size="small" color={theme.tint} /> : null}
              <MenuView
                title="Заметка"
                actions={[
                  {
                    id: 'structure',
                    title: structuredRef.current.trim() ? 'Обновить AI-версию' : 'Структурировать',
                    image: 'wand.and.stars',
                    attributes: { disabled: structuring },
                  },
                  ...(editing !== 'new'
                    ? [{ id: 'delete', title: 'Удалить заметку', image: 'trash' as const, attributes: { destructive: true } }]
                    : []),
                ]}
                onPressAction={(event) => {
                  if (event.nativeEvent.event === 'structure') void structureCurrent();
                  else if (event.nativeEvent.event === 'delete') void remove();
                }}>
                <AppleIconButton label="Ещё" systemImage="ellipsis" variant="plain" tint={theme.tint} size={40} />
              </MenuView>
              <AppleIconButton
                label="Сохранить"
                systemImage="checkmark"
                onPress={() => { haptic.success(); save(); }}
                variant="prominent"
                size={40}
              />
            </View>
          </View>
          <View style={styles.editorContent}>
            <TextInput
              ref={titleInputRef}
              autoFocus={editing === 'new'}
              placeholder="Заголовок"
              placeholderTextColor={theme.textSecondary}
              value={title}
              onChangeText={setTitle}
              maxFontSizeMultiplier={1.18}
              style={[styles.titleInput, { color: theme.text }]}
            />
            <MenuView
              title="Категория"
              actions={[
                { id: 'none', title: 'Без категории', image: 'circle', state: color ? 'off' : 'on' },
                ...NOTE_CATS.map((cat) => ({
                  id: cat.color,
                  title: cat.label,
                  image: 'circle.fill' as const,
                  state: color === cat.color ? 'on' as const : 'off' as const,
                })),
              ]}
              onPressAction={(event) => setColor(event.nativeEvent.event === 'none' ? null : event.nativeEvent.event)}
              style={styles.categoryMenu}>
              <AppleButton
                label={catLabel(color) || 'Категория'}
                systemImage="tag"
                variant="glass"
                size="small"
              />
            </MenuView>
            <TextInput
              ref={bodyInputRef}
              key={`${bodyKey}-${version}`}
              placeholder={version === 'original' ? 'Текст заметки…' : 'Структурированная AI-версия…'}
              placeholderTextColor={theme.textSecondary}
              defaultValue={version === 'original' ? bodyRef.current : structuredRef.current}
              onChangeText={(t) => { if (version === 'original') bodyRef.current = t; else structuredRef.current = t; }}
              multiline
              maxFontSizeMultiplier={1.18}
              scrollEnabled
              textAlignVertical="top"
              style={[styles.bodyInput, { color: theme.text }]}
            />
          </View>
          <View style={[styles.editorTools, { borderTopColor: theme.separator, backgroundColor: theme.backgroundElement }]}>
            <MenuView
              title="Формат"
              actions={[
                { id: 'heading', title: 'Заголовок', image: 'textformat.size.larger' },
                { id: 'bullet', title: 'Маркированный список', image: 'list.bullet' },
                { id: 'quote', title: 'Цитата', image: 'text.quote' },
              ]}
              onPressAction={(event) => {
                if (event.nativeEvent.event === 'heading') insertBodyTemplate('## Заголовок');
                else if (event.nativeEvent.event === 'bullet') insertBodyTemplate('• ');
                else insertBodyTemplate('> ');
              }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Формат текста"
                style={({ pressed }) => [styles.toolTextButton, { backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.55 }]}>
                <ThemedText style={styles.toolText}>Aa</ThemedText>
              </Pressable>
            </MenuView>
            <AppleIconButton
              label="Чек-лист"
              systemImage="checklist"
              onPress={() => insertBodyTemplate('☐ ')}
              variant="plain"
              tint={theme.text}
              size={40}
            />
            <AppleIconButton
              label="Таблица"
              systemImage="tablecells"
              onPress={() => insertBodyTemplate('|   |   |\n|---|---|\n|   |   |')}
              variant="plain"
              tint={theme.text}
              size={42}
            />
            <AppleIconButton
              label="Структурировать"
              systemImage="wand.and.stars"
              onPress={() => void structureCurrent()}
              disabled={structuring || !bodyRef.current.trim()}
              variant="plain"
              tint={theme.tint}
              size={40}
            />
            <HoldMic onResult={transcribe} disabled={transcribing} size={40} bottomOffset={62} />
          </View>
        </KeyboardAvoidingView>
      </ThemedView>
    </Modal>
  ) : null;

  // ----- Список -----
  const normalizedQuery = query.trim().toLowerCase();
  const visibleNotes = notes
    .filter((note) => {
      if (!normalizedQuery) return true;
      return `${note.title || ''} ${note.body || ''}`.toLowerCase().includes(normalizedQuery);
    })
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
  const noteGroups = [...visibleNotes.reduce((groups, note) => {
    const section = noteSection(note.updated_at);
    groups.set(section, [...(groups.get(section) || []), note]);
    return groups;
  }, new Map<string, Note[]>()).entries()];

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textSecondary} />}>
        <View style={styles.headRow}>
          <ThemedText style={styles.h1}>Заметки</ThemedText>
          <AppleIconButton
            label="Новая заметка"
            systemImage="square.and.pencil"
            onPress={openNew}
            variant="prominent"
            size={40}
          />
        </View>
        <View style={[styles.searchBar, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
          <SymbolView name="magnifyingglass" tintColor={theme.textSecondary} size={16} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Поиск по заметкам"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="search"
            clearButtonMode="while-editing"
            maxFontSizeMultiplier={1.18}
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: Spacing.five }} />
        ) : notes.length === 0 ? (
          <GlassCard radius={Radius.lg} style={styles.emptyCard}>
            <SymbolView name="note.text" tintColor={theme.textSecondary} size={34} />
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Пусто. Нажми кнопку справа сверху — заметка появится и на компьютере.
            </ThemedText>
          </GlassCard>
        ) : visibleNotes.length === 0 ? (
          <View style={styles.noResults}>
            <SymbolView name="magnifyingglass" tintColor={theme.textSecondary} size={28} />
            <ThemedText themeColor="textSecondary">Ничего не найдено</ThemedText>
          </View>
        ) : (
          noteGroups.map(([section, sectionNotes]) => (
            <View key={section} style={styles.noteGroup}>
              <ThemedText style={styles.sectionTitle}>{section}</ThemedText>
              <GlassCard radius={Radius.lg} style={styles.noteList}>
                {sectionNotes.map((n, index) => (
                  <Pressable
                    key={n.id}
                    onPress={() => openNote(n)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.62 : 1 })}>
                    <View
                      style={[
                        styles.noteCard,
                        index < sectionNotes.length - 1 && { borderBottomColor: theme.separator, borderBottomWidth: StyleSheet.hairlineWidth },
                      ]}>
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
                ))}
              </GlassCard>
            </View>
          ))
        )}
      </ScrollView>
      {editor}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ECECF1' },
  content: { paddingHorizontal: Spacing.three, paddingBottom: BottomTabInset + Spacing.three, gap: Spacing.three },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  h1: { flex: 1, minWidth: 0, fontSize: 30, fontWeight: '700', lineHeight: 36, letterSpacing: -0.8 },
  searchBar: { minHeight: 38, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 8 },
  noResults: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.six },
  emptyCard: { paddingVertical: Spacing.five, alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  noteGroup: { gap: Spacing.two },
  sectionTitle: { paddingHorizontal: 4, fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.35 },
  noteList: { overflow: 'hidden' },
  noteCard: { minHeight: 84, paddingVertical: 13, paddingHorizontal: Spacing.three, backgroundColor: 'rgba(255,255,255,0.82)' },
  noteTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  noteTime: { marginTop: Spacing.two, fontSize: 12 },
  catDot: { width: 9, height: 9, borderRadius: 5 },
  editorLayer: { flex: 1 },
  editorBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  headSegment: { flex: 1, minWidth: 0, marginHorizontal: Spacing.two },
  editorContent: { flex: 1, minHeight: 0, paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.two },
  categoryMenu: { alignSelf: 'flex-start', marginVertical: 2 },
  titleInput: { fontSize: 26, fontWeight: '700', fontFamily: 'Inter_700Bold', paddingVertical: Spacing.two },
  bodyInput: { flex: 1, minHeight: 160, fontSize: 17, lineHeight: 25, fontFamily: 'Inter_400Regular', textAlignVertical: 'top' },
  editorTools: {
    minHeight: 58,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toolTextButton: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  toolText: { fontSize: 20, lineHeight: 24, fontWeight: '500' },
});
