import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ProfileScreen from '@/app/profile';
import { DebtsModal, type Debt } from '@/components/debts-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VoiceRecorder } from '@/components/voice-recorder';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';

type ReimbursementStatus = 'pending' | 'submitted' | 'reimbursed' | 'rejected';
type Reimbursement = {
  id: string;
  amount: string;
  currency: string;
  purpose: string;
  merchant?: string | null;
  location?: string | null;
  company: string;
  occurred_at: string;
  due_date?: string | null;
  status: ReimbursementStatus;
  note?: string | null;
  source: string;
  updated_at: string;
};
type Parsed = {
  kind: 'reimbursement' | 'debt';
  amount?: number | null;
  purpose?: string | null;
  merchant?: string | null;
  location?: string | null;
  company?: string | null;
  counterparty?: string | null;
  direction?: 'owes_me' | 'i_owe';
  occurred_at?: string | null;
  due_date?: string | null;
  note?: string | null;
};
type EntryKind = 'reimbursement' | 'owes_me' | 'i_owe';
type SavedEntry = { amount: number; title: string };

const STATUS: Record<ReimbursementStatus, { label: string; color: string }> = {
  pending: { label: 'Ждёт отправки', color: '#F2C94C' },
  submitted: { label: 'На проверке', color: '#64A8FF' },
  reimbursed: { label: 'Компенсировано', color: '#7C85FF' },
  rejected: { label: 'Отклонено', color: '#EB6A6A' },
};
const fmt = (value: number) => Math.round(value).toLocaleString('ru-RU');
const dateInput = (value?: string | null) => value ? value.slice(0, 10) : '';
const dateLabel = (value?: string | null) => value
  ? new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
  : 'дата не указана';

export default function MoneyScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<'overview' | 'add'>('add');
  const [showClosed, setShowClosed] = useState(false);
  const [items, setItems] = useState<Reimbursement[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDebts, setShowDebts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState<Reimbursement | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [lastSaved, setLastSaved] = useState<SavedEntry | null>(null);

  const [kind, setKind] = useState<EntryKind>('reimbursement');
  const [raw, setRaw] = useState('');
  const [source, setSource] = useState<'manual' | 'text' | 'voice' | 'photo'>('manual');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [merchant, setMerchant] = useState('');
  const [location, setLocation] = useState('');
  const [company, setCompany] = useState('Компания');
  const [counterparty, setCounterparty] = useState('');
  const [occurred, setOccurred] = useState(() => new Date().toISOString().slice(0, 10));
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const [reimbursements, debtResult] = await Promise.all([
        api<{ reimbursements: Reimbursement[] }>('/reimbursements?includeClosed=1'),
        api<{ debts: Debt[] }>('/debts?all=true'),
      ]);
      setItems(reimbursements.reimbursements || []);
      setDebts(debtResult.debts || []);
    } catch (error: any) {
      Alert.alert('Не удалось загрузить', error?.message || '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const activeItems = items.filter((item) => !['reimbursed', 'rejected'].includes(item.status));
  const visibleItems = items.filter((item) => showClosed === ['reimbursed', 'rejected'].includes(item.status));
  const activeDebts = debts.filter((debt) => !debt.settled);
  const toReturn = activeItems.reduce((sum, item) => sum + Number(item.amount), 0);
  const owedToMe = activeDebts.filter((d) => d.direction === 'owes_me').reduce((sum, d) => sum + Number(d.amount), 0);
  const iOwe = activeDebts.filter((d) => d.direction === 'i_owe').reduce((sum, d) => sum + Number(d.amount), 0);

  function resetDraft(nextKind: EntryKind = kind) {
    setKind(nextKind);
    setRaw('');
    setSource('manual');
    setPhotoUri(null);
    setAmount('');
    setPurpose('');
    setMerchant('');
    setLocation('');
    setCompany('Компания');
    setCounterparty('');
    setOccurred(new Date().toISOString().slice(0, 10));
    setDue('');
    setNote('');
    setDraftReady(false);
  }

  function applyParsed(parsed: Parsed, transcript: string, nextSource: typeof source) {
    const nextKind: EntryKind = parsed.kind === 'debt'
      ? (parsed.direction === 'i_owe' ? 'i_owe' : 'owes_me')
      : 'reimbursement';
    setKind(nextKind);
    setRaw(transcript);
    setSource(nextSource);
    if (parsed.amount) setAmount(String(Math.round(parsed.amount)));
    setPurpose(parsed.purpose || '');
    setMerchant(parsed.merchant || '');
    setLocation(parsed.location || '');
    setCompany(parsed.company || 'Компания');
    setCounterparty(parsed.counterparty || '');
    if (parsed.occurred_at) setOccurred(dateInput(parsed.occurred_at));
    setDue(dateInput(parsed.due_date));
    setNote(parsed.note || '');
    setDraftReady(true);
    setLastSaved(null);
  }

  async function parseInput(text: string, nextSource: typeof source = 'text', image?: string) {
    const cleaned = text.trim();
    if (!cleaned && !image) return;
    Keyboard.dismiss();
    setDraftReady(false);
    setLastSaved(null);
    setParsing(true);
    try {
      const response = await api<{ parsed: Parsed }>('/reimbursements/parse', {
        body: { text: cleaned || undefined, image },
      });
      applyParsed(response.parsed, cleaned, nextSource);
      haptic.success();
    } catch (error: any) {
      haptic.error();
      Alert.alert('Не удалось разобрать', error?.message || 'Проверьте связь и попробуйте ещё раз.');
    } finally {
      setParsing(false);
    }
  }

  async function choosePhoto(fromCamera: boolean) {
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
    const description = draftReady ? '' : raw;
    resetDraft('reimbursement');
    setRaw(description);
    setPhotoUri(asset.uri);
    await parseInput(description, 'photo', `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
  }

  function startManual(nextKind: EntryKind) {
    resetDraft(nextKind);
    setSource('manual');
    setDraftReady(true);
    setLastSaved(null);
  }

  function openAddMenu() {
    Alert.alert('Добавить', '', [
      { text: 'Снять чек', onPress: () => choosePhoto(true) },
      { text: 'Выбрать фото', onPress: () => choosePhoto(false) },
      { text: 'Компенсацию вручную', onPress: () => startManual('reimbursement') },
      { text: 'Мне должны', onPress: () => startManual('owes_me') },
      { text: 'Я должен', onPress: () => startManual('i_owe') },
      { text: 'Отмена', style: 'cancel' },
    ]);
  }

  async function saveDraft() {
    if (saving) return;
    const numericAmount = Number(amount.replace(',', '.'));
    if (!numericAmount) return Alert.alert('Укажите сумму');
    if (kind === 'reimbursement' && !purpose.trim()) return Alert.alert('Укажите, на что потрачено');
    if (kind !== 'reimbursement' && !counterparty.trim()) return Alert.alert('Укажите, кто кому должен');
    setSaving(true);
    try {
      if (kind === 'reimbursement') {
        await api('/reimbursements', {
          body: {
            amount: numericAmount,
            purpose: purpose.trim(), merchant: merchant.trim() || null, location: location.trim() || null,
            company: company.trim() || 'Компания', occurred_at: occurred || null, due_date: due || null,
            note: note.trim() || null, source, raw_input: raw.trim() || null,
          },
        });
      } else {
        await api('/debts', {
          body: {
            amount: numericAmount, counterparty: counterparty.trim(), direction: kind,
            occurred_at: occurred || null, due_date: due || null, note: note.trim() || null,
          },
        });
      }
      haptic.success();
      setLastSaved({
        amount: numericAmount,
        title: kind === 'reimbursement' ? purpose.trim() : counterparty.trim(),
      });
      resetDraft(kind);
      setSection('add');
      await load();
    } catch (error: any) {
      haptic.error();
      Alert.alert('Не сохранилось', error?.message || '');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 10 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.tint} />}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Возвраты</ThemedText>
          <View style={styles.headerActions}>
            <TouchableOpacity
              accessibilityLabel={section === 'add' ? 'Открыть список' : 'Открыть запись'}
              onPress={() => setSection(section === 'add' ? 'overview' : 'add')}
              style={[styles.roundButton, { backgroundColor: theme.backgroundElement }]}>
              <SymbolView name={section === 'add' ? 'list.bullet' : 'waveform'} tintColor={theme.tint} size={18} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSettings(true)} style={[styles.roundButton, { backgroundColor: theme.backgroundElement }]}>
              <SymbolView name="gearshape.fill" tintColor={theme.text} size={18} />
            </TouchableOpacity>
          </View>
        </View>

        {section === 'overview' ? (
          <>
            <View style={[styles.hero, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
              <View style={styles.heroTop}>
                <View style={[styles.heroIcon, { backgroundColor: `${theme.tint}1F` }]}><SymbolView name="building.2.fill" tintColor={theme.tint} size={20} /></View>
                <ThemedText type="smallBold" style={{ color: theme.tint }}>{activeItems.length} активных</ThemedText>
              </View>
              <ThemedText style={[styles.heroValue, { color: theme.text }]}>{fmt(toReturn)} ₽</ThemedText>
            </View>

            <View style={styles.statsRow}>
              <MoneyStat label="Мне должны" value={owedToMe} color={theme.success} sign="+" />
              <MoneyStat label="Я должен" value={iOwe} color={theme.warning} sign="−" />
              <TouchableOpacity onPress={() => setShowDebts(true)} style={[styles.allDebts, { backgroundColor: theme.backgroundElement }]}>
                <SymbolView name="chevron.right" tintColor={theme.textSecondary} size={17} />
                <ThemedText type="small" themeColor="textSecondary">Долги</ThemedText>
              </TouchableOpacity>
            </View>

            <View style={styles.listHeader}>
              <ThemedText type="smallBold">Компенсации</ThemedText>
              <View style={[styles.smallSegment, { backgroundColor: theme.backgroundElement }]}>
                <Pressable onPress={() => setShowClosed(false)} style={[styles.smallSegmentButton, !showClosed && { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText type="small" themeColor={!showClosed ? 'text' : 'textSecondary'}>Активные</ThemedText>
                </Pressable>
                <Pressable onPress={() => setShowClosed(true)} style={[styles.smallSegmentButton, showClosed && { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText type="small" themeColor={showClosed ? 'text' : 'textSecondary'}>Закрытые</ThemedText>
                </Pressable>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator color={theme.tint} style={{ marginTop: Spacing.four }} />
            ) : visibleItems.length === 0 ? (
              <View style={[styles.empty, { borderColor: theme.separator }]}>
                <SymbolView name="tray.fill" tintColor={theme.textSecondary} size={28} />
                <ThemedText type="smallBold">{showClosed ? 'Закрытых компенсаций нет' : 'Нечего возвращать'}</ThemedText>
              </View>
            ) : (
              <View style={styles.list}>
                {visibleItems.map((item) => (
                  <TouchableOpacity key={item.id} activeOpacity={0.8} onPress={() => setEditing(item)} style={[styles.item, { backgroundColor: theme.backgroundElement }]}>
                    <View style={[styles.itemIcon, { backgroundColor: `${STATUS[item.status].color}1F` }]}>
                      <SymbolView name="doc.text.fill" tintColor={STATUS[item.status].color} size={20} />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <ThemedText type="smallBold" numberOfLines={1}>{item.purpose}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {[item.merchant, item.location, dateLabel(item.occurred_at)].filter(Boolean).join(' · ')}
                      </ThemedText>
                      <View style={styles.statusRow}>
                        <View style={[styles.statusDot, { backgroundColor: STATUS[item.status].color }]} />
                        <ThemedText type="small" style={{ color: STATUS[item.status].color }}>{STATUS[item.status].label}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">· {item.company}</ThemedText>
                      </View>
                    </View>
                    <ThemedText style={styles.itemAmount}>{fmt(Number(item.amount))} ₽</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={styles.conversation}>
            <View style={styles.conversationFeed}>
              {!lastSaved && !draftReady && !parsing && (
                <View style={[styles.conversationEmpty, { borderColor: theme.separator }]}>
                  <SymbolView name="doc.text.fill" tintColor={theme.tint} size={30} />
                </View>
              )}

              {!!lastSaved && (
                <View style={styles.aiDraftRow}>
                  <View style={[styles.aiMark, { backgroundColor: `${theme.tint}1F` }]}>
                    <SymbolView name="checkmark" tintColor={theme.tint} size={15} />
                  </View>
                  <View style={[styles.savedCard, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
                    <ThemedText type="smallBold" numberOfLines={1} style={{ flex: 1 }}>{lastSaved.title}</ThemedText>
                    <ThemedText style={styles.savedAmount}>{fmt(lastSaved.amount)} ₽</ThemedText>
                  </View>
                </View>
              )}

              {(parsing || draftReady) && (!!raw.trim() || !!photoUri) && (
                <View style={styles.userEntryRow}>
                  <View style={[styles.userEntryBubble, { backgroundColor: theme.tint }]}>
                    {!!photoUri && <Image source={{ uri: photoUri }} style={styles.photoPreview} />}
                    {!!raw.trim() && <ThemedText style={{ color: '#FFFFFF' }}>{raw.trim()}</ThemedText>}
                  </View>
                </View>
              )}

              {parsing && (
                <View style={styles.aiDraftRow}>
                  <View style={[styles.aiMark, { backgroundColor: `${theme.tint}1F` }]}>
                    <SymbolView name="sparkles" tintColor={theme.tint} size={15} />
                  </View>
                  <View style={[styles.parsingCard, { backgroundColor: theme.backgroundElement }]}>
                    <ActivityIndicator size="small" color={theme.tint} />
                  </View>
                </View>
              )}

              {draftReady && !parsing && (
                <View style={styles.aiDraftRow}>
                  <View style={[styles.aiMark, { backgroundColor: `${theme.tint}1F` }]}>
                    <SymbolView name="sparkles" tintColor={theme.tint} size={15} />
                  </View>
                  <View style={[styles.form, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
                    <View style={styles.formCardHeader}>
                      <View style={[styles.formIcon, { backgroundColor: `${theme.tint}1F` }]}>
                        <SymbolView
                          name={kind === 'reimbursement' ? 'building.2.fill' : 'person.2.fill'}
                          tintColor={theme.tint}
                          size={18}
                        />
                      </View>
                      <ThemedText type="smallBold" style={{ flex: 1 }}>
                        {kind === 'reimbursement' ? 'Компенсация' : kind === 'owes_me' ? 'Мне должны' : 'Я должен'}
                      </ThemedText>
                      <TouchableOpacity onPress={() => resetDraft(kind)} hitSlop={8}>
                        <SymbolView name="xmark.circle.fill" tintColor={theme.textSecondary} size={22} />
                      </TouchableOpacity>
                    </View>

                    <Field label="Сумма, ₽">
                      <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.textSecondary} style={[styles.input, styles.amountInput, { color: theme.text, backgroundColor: theme.backgroundSelected }]} />
                    </Field>
                    {kind === 'reimbursement' ? (
                      <>
                        <Field label="На что потрачено"><TextInput value={purpose} onChangeText={setPurpose} placeholder="Такси, материалы, подписка…" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]} /></Field>
                        <View style={styles.twoCols}>
                          <View style={{ flex: 1 }}><Field label="Где / сервис"><TextInput value={merchant} onChangeText={setMerchant} placeholder="Ситидрайв" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]} /></Field></View>
                          <View style={{ flex: 1 }}><Field label="Место"><TextInput value={location} onChangeText={setLocation} placeholder="Москва" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]} /></Field></View>
                        </View>
                        <Field label="Кто компенсирует"><TextInput value={company} onChangeText={setCompany} placeholder="Компания" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]} /></Field>
                      </>
                    ) : (
                      <Field label={kind === 'owes_me' ? 'Кто должен мне' : 'Кому я должен'}><TextInput value={counterparty} onChangeText={setCounterparty} placeholder="Имя или компания" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]} /></Field>
                    )}
                    <View style={styles.twoCols}>
                      <View style={{ flex: 1 }}><Field label="Дата"><TextInput value={occurred} onChangeText={setOccurred} placeholder="ГГГГ-ММ-ДД" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]} /></Field></View>
                      <View style={{ flex: 1 }}><Field label="Вернуть до"><TextInput value={due} onChangeText={setDue} placeholder="необязательно" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]} /></Field></View>
                    </View>
                    <Field label="Комментарий"><TextInput value={note} onChangeText={setNote} multiline placeholder="Важные детали" placeholderTextColor={theme.textSecondary} style={[styles.input, styles.noteInput, { color: theme.text, backgroundColor: theme.backgroundSelected }]} /></Field>

                    <TouchableOpacity disabled={saving} onPress={saveDraft} style={[styles.saveButton, { backgroundColor: theme.tint }]}>
                      {saving ? <ActivityIndicator color="#FFFFFF" /> : <SymbolView name="checkmark" tintColor="#FFFFFF" size={20} />}
                      <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>Сохранить</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            <View style={[styles.textComposer, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
              <TouchableOpacity accessibilityLabel="Добавить" onPress={openAddMenu} style={styles.composerIcon}>
                <SymbolView name="plus" tintColor={theme.textSecondary} size={22} />
              </TouchableOpacity>
              <TextInput
                value={draftReady || parsing ? '' : raw}
                editable={!parsing && !saving}
                onChangeText={(text) => {
                  if (draftReady) resetDraft(kind);
                  setLastSaved(null);
                  setRaw(text);
                }}
                placeholder="Сообщение"
                placeholderTextColor={theme.textSecondary}
                multiline
                style={[styles.rawInput, { color: theme.text }]}
              />
              {raw.trim() && !draftReady ? (
                <TouchableOpacity accessibilityLabel="Отправить" disabled={parsing} onPress={() => parseInput(raw, 'text')} style={[styles.parseButton, { backgroundColor: theme.tint }]}>
                  {parsing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <SymbolView name="arrow.up" tintColor="#FFFFFF" size={20} />}
                </TouchableOpacity>
              ) : (
                <VoiceRecorder
                  disabled={parsing || saving}
                  onTranscript={(text) => {
                    resetDraft('reimbursement');
                    return parseInput(text, 'voice');
                  }}
                />
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <DebtsModal visible={showDebts} onClose={() => setShowDebts(false)} onChanged={load} />
      {!!editing && <ReimbursementEditor key={editing.id} item={editing} onClose={() => setEditing(null)} onChanged={async () => { setEditing(null); await load(); }} />}
      <Modal visible={showSettings} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSettings(false)}>
        <ThemedView style={{ flex: 1 }}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Настройки</ThemedText>
            <TouchableOpacity onPress={() => setShowSettings(false)}><SymbolView name="xmark.circle.fill" tintColor={theme.textSecondary} size={28} /></TouchableOpacity>
          </View>
          <ProfileScreen embedded />
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

function MoneyStat({ label, value, color, sign }: { label: string; value: number; color: string; sign: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.moneyStat, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <ThemedText type="smallBold" style={{ color }}>{sign}{fmt(value)} ₽</ThemedText>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.field}><ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>{children}</View>;
}

function ReimbursementEditor({ item, onClose, onChanged }: { item: Reimbursement; onClose: () => void; onChanged: () => void }) {
  const theme = useTheme();
  const [amount, setAmount] = useState(String(Math.round(Number(item.amount))));
  const [purpose, setPurpose] = useState(item.purpose || '');
  const [merchant, setMerchant] = useState(item.merchant || '');
  const [location, setLocation] = useState(item.location || '');
  const [company, setCompany] = useState(item.company || 'Компания');
  const [occurred, setOccurred] = useState(dateInput(item.occurred_at));
  const [due, setDue] = useState(dateInput(item.due_date));
  const [note, setNote] = useState(item.note || '');
  const [status, setStatus] = useState<ReimbursementStatus>(item.status);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await api(`/reimbursements/${item.id}`, { method: 'PATCH', body: {
        amount: Number(amount.replace(',', '.')), purpose, merchant, location, company,
        occurred_at: occurred || null, due_date: due || null, note, status,
      } });
      haptic.success(); onChanged();
    } catch (error: any) { Alert.alert('Не сохранилось', error?.message || ''); }
    finally { setSaving(false); }
  }

  function remove() {
    Alert.alert('Удалить компенсацию?', item.purpose, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => { await api(`/reimbursements/${item.id}`, { method: 'DELETE' }); onChanged(); } },
    ]);
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={{ flex: 1 }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}><ThemedText style={{ color: theme.tint }}>Отмена</ThemedText></TouchableOpacity>
          <ThemedText type="smallBold">Компенсация</ThemedText>
          <TouchableOpacity disabled={saving} onPress={save}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Готово</ThemedText></TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editorContent}>
            <View style={styles.statusGrid}>
              {(Object.keys(STATUS) as ReimbursementStatus[]).map((key) => (
                <Pressable key={key} onPress={() => setStatus(key)} style={[styles.statusButton, { borderColor: status === key ? STATUS[key].color : theme.separator, backgroundColor: status === key ? `${STATUS[key].color}1A` : theme.backgroundElement }]}>
                  <View style={[styles.statusDot, { backgroundColor: STATUS[key].color }]} />
                  <ThemedText type="small" style={{ color: status === key ? STATUS[key].color : theme.textSecondary }}>{STATUS[key].label}</ThemedText>
                </Pressable>
              ))}
            </View>
            <Field label="Сумма, ₽"><TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]} /></Field>
            <Field label="На что"><TextInput value={purpose} onChangeText={setPurpose} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]} /></Field>
            <Field label="Сервис / магазин"><TextInput value={merchant} onChangeText={setMerchant} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]} /></Field>
            <Field label="Место"><TextInput value={location} onChangeText={setLocation} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]} /></Field>
            <Field label="Компания"><TextInput value={company} onChangeText={setCompany} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]} /></Field>
            <View style={styles.twoCols}>
              <View style={{ flex: 1 }}><Field label="Дата"><TextInput value={occurred} onChangeText={setOccurred} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]} /></Field></View>
              <View style={{ flex: 1 }}><Field label="Вернуть до"><TextInput value={due} onChangeText={setDue} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]} /></Field></View>
            </View>
            <Field label="Комментарий"><TextInput value={note} onChangeText={setNote} multiline style={[styles.input, styles.noteInput, { color: theme.text, backgroundColor: theme.backgroundElement }]} /></Field>
            <TouchableOpacity onPress={remove} style={[styles.deleteButton, { borderColor: theme.separator }]}>
              <SymbolView name="trash" tintColor={theme.danger} size={18} /><ThemedText type="smallBold" style={{ color: theme.danger }}>Удалить</ThemedText>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: Spacing.three, paddingBottom: BottomTabInset + Spacing.five, gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -1.1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roundButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: Radius.xl, padding: Spacing.four, minHeight: 154, justifyContent: 'flex-end', borderWidth: StyleSheet.hairlineWidth },
  heroTop: { position: 'absolute', left: Spacing.four, top: Spacing.three, right: Spacing.four, flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  heroValue: { fontSize: 38, lineHeight: 43, fontWeight: '800', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  statsRow: { flexDirection: 'row', gap: Spacing.two },
  moneyStat: { flex: 1, borderRadius: Radius.md, padding: 12, gap: 2 },
  allDebts: { width: 64, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', gap: 3 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  smallSegment: { flexDirection: 'row', padding: 3, borderRadius: 11 },
  smallSegmentButton: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: Spacing.five, paddingHorizontal: Spacing.four, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg },
  list: { gap: Spacing.two },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.lg, padding: 13 },
  itemIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  itemAmount: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  conversation: { flex: 1, gap: 10 },
  conversationFeed: { flex: 1, minHeight: 300, gap: 10, justifyContent: 'flex-end' },
  conversationEmpty: { flex: 1, minHeight: 250, alignItems: 'center', justifyContent: 'center' },
  aiDraftRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingRight: 18 },
  aiMark: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  savedCard: { flex: 1, minHeight: 58, borderRadius: 18, borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  savedAmount: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  userEntryRow: { alignItems: 'flex-end', paddingLeft: 54 },
  userEntryBubble: { maxWidth: '92%', padding: 8, borderRadius: 18, borderBottomRightRadius: 6, gap: 8 },
  parsingCard: { width: 58, height: 44, borderRadius: 18, borderBottomLeftRadius: 6, alignItems: 'center', justifyContent: 'center' },
  textComposer: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.pill, padding: 5, minHeight: 52, maxHeight: 130, flexDirection: 'row', alignItems: 'flex-end', gap: 5, position: 'relative' },
  rawInput: { flex: 1, minHeight: 40, maxHeight: 112, paddingHorizontal: 4, paddingVertical: 9, fontSize: 16, lineHeight: 21 },
  composerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  parseButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  photoPreview: { width: 220, height: 132, borderRadius: 13, resizeMode: 'cover' },
  form: { flex: 1, borderRadius: Radius.lg, borderBottomLeftRadius: 7, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three, gap: 13 },
  formCardHeader: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 9 },
  formIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  field: { gap: 6 },
  input: { minHeight: 46, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, fontSize: 16 },
  amountInput: { fontSize: 25, fontWeight: '700', fontVariant: ['tabular-nums'] },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
  twoCols: { flexDirection: 'row', gap: Spacing.two },
  saveButton: { height: 54, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  modalHeader: { minHeight: 58, paddingHorizontal: Spacing.three, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 28, fontWeight: '800' },
  editorContent: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusButton: { width: '48%', minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  deleteButton: { height: 50, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: Spacing.two },
});
