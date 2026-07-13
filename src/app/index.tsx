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
import { APP_BUILD, BottomTabInset, Radius, Spacing } from '@/constants/theme';
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

const STATUS: Record<ReimbursementStatus, { label: string; color: string }> = {
  pending: { label: 'Ждёт отправки', color: '#F2C94C' },
  submitted: { label: 'На проверке', color: '#64A8FF' },
  reimbursed: { label: 'Компенсировано', color: '#55C98A' },
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
  const [section, setSection] = useState<'overview' | 'add'>('overview');
  const [showClosed, setShowClosed] = useState(false);
  const [items, setItems] = useState<Reimbursement[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDebts, setShowDebts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState<Reimbursement | null>(null);

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
  }

  async function parseInput(text: string, nextSource: typeof source = 'text', image?: string) {
    const cleaned = text.trim();
    if (!cleaned && !image) return;
    Keyboard.dismiss();
    setParsing(true);
    try {
      const response = await api<{ parsed: Parsed }>('/reimbursements/parse', {
        body: { text: cleaned || undefined, image, preferredKind: kind === 'reimbursement' ? 'reimbursement' : 'debt' },
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
    setPhotoUri(asset.uri);
    await parseInput(raw, 'photo', `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
  }

  function pickPhoto() {
    Alert.alert('Добавить чек или фото', '', [
      { text: 'Снять', onPress: () => choosePhoto(true) },
      { text: 'Из галереи', onPress: () => choosePhoto(false) },
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
      resetDraft(kind);
      setSection('overview');
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
          <View>
            <ThemedText style={styles.title}>Возвраты</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">компенсации компании и личные долги</ThemedText>
          </View>
          <View style={styles.headerActions}>
            <ThemedText type="small" themeColor="textSecondary">v{APP_BUILD}</ThemedText>
            <TouchableOpacity onPress={() => setShowSettings(true)} style={[styles.roundButton, { backgroundColor: theme.backgroundElement }]}>
              <SymbolView name="gearshape.fill" tintColor={theme.text} size={18} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.mainSegment, { backgroundColor: theme.backgroundElement }]}>
          <SegmentButton label="Список" icon="list.bullet" active={section === 'overview'} onPress={() => setSection('overview')} />
          <SegmentButton label="Записать" icon="waveform" active={section === 'add'} onPress={() => setSection('add')} />
        </View>

        {section === 'overview' ? (
          <>
            <View style={[styles.hero, { backgroundColor: theme.tint }]}>
              <View style={styles.heroTop}>
                <View style={styles.heroIcon}><SymbolView name="building.2.fill" tintColor="#07120D" size={20} /></View>
                <ThemedText type="smallBold" style={{ color: '#07120D' }}>{activeItems.length} активных</ThemedText>
              </View>
              <ThemedText style={styles.heroValue}>{fmt(toReturn)} ₽</ThemedText>
              <ThemedText type="small" style={{ color: 'rgba(7,18,13,0.72)' }}>компания должна вернуть</ThemedText>
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
                <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                  Удерживайте микрофон во вкладке «Записать» и скажите сумму и назначение.
                </ThemedText>
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
          <>
            <View style={styles.kindRow}>
              <KindButton label="Компания вернёт" active={kind === 'reimbursement'} onPress={() => setKind('reimbursement')} />
              <KindButton label="Мне должны" active={kind === 'owes_me'} onPress={() => setKind('owes_me')} />
              <KindButton label="Я должен" active={kind === 'i_owe'} onPress={() => setKind('i_owe')} />
            </View>

            <VoiceRecorder
              disabled={parsing || saving}
              hint="держите · вверх — зафиксировать · влево — отмена"
              onTranscript={(text) => parseInput(text, 'voice')}
            />

            <View style={[styles.textComposer, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
              <TextInput
                value={raw}
                onChangeText={setRaw}
                placeholder={kind === 'reimbursement' ? 'Например: компенсация 500 ₽ за такси сегодня' : 'Например: дал Егору 2 000 ₽ вчера'}
                placeholderTextColor={theme.textSecondary}
                multiline
                style={[styles.rawInput, { color: theme.text }]}
              />
              <TouchableOpacity onPress={pickPhoto} style={styles.composerIcon}>
                <SymbolView name="camera.fill" tintColor={theme.textSecondary} size={21} />
              </TouchableOpacity>
              <TouchableOpacity disabled={!raw.trim() || parsing} onPress={() => parseInput(raw, 'text')} style={[styles.parseButton, { backgroundColor: raw.trim() ? theme.tint : theme.backgroundSelected }]}>
                {parsing ? <ActivityIndicator size="small" color="#07120D" /> : <SymbolView name="arrow.up" tintColor="#07120D" size={20} />}
              </TouchableOpacity>
            </View>
            {!!photoUri && <Image source={{ uri: photoUri }} style={styles.photoPreview} />}

            <View style={styles.formHeader}>
              <ThemedText type="smallBold">{source === 'manual' ? 'Заполните вручную' : 'Проверьте распознанное'}</ThemedText>
              {source !== 'manual' && <ThemedText type="small" themeColor="textSecondary">можно исправить любое поле</ThemedText>}
            </View>

            <View style={[styles.form, { backgroundColor: theme.backgroundElement }]}>
              <Field label="Сумма, ₽">
                <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.textSecondary} style={[styles.input, styles.amountInput, { color: theme.text }]} />
              </Field>
              {kind === 'reimbursement' ? (
                <>
                  <Field label="На что потрачено"><TextInput value={purpose} onChangeText={setPurpose} placeholder="Такси, материалы, подписка…" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text }]} /></Field>
                  <View style={styles.twoCols}>
                    <View style={{ flex: 1 }}><Field label="Где / сервис"><TextInput value={merchant} onChangeText={setMerchant} placeholder="Ситидрайв" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text }]} /></Field></View>
                    <View style={{ flex: 1 }}><Field label="Место"><TextInput value={location} onChangeText={setLocation} placeholder="Москва" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text }]} /></Field></View>
                  </View>
                  <Field label="Кто компенсирует"><TextInput value={company} onChangeText={setCompany} placeholder="Компания" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text }]} /></Field>
                </>
              ) : (
                <Field label={kind === 'owes_me' ? 'Кто должен мне' : 'Кому я должен'}><TextInput value={counterparty} onChangeText={setCounterparty} placeholder="Имя или компания" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text }]} /></Field>
              )}
              <View style={styles.twoCols}>
                <View style={{ flex: 1 }}><Field label="Дата"><TextInput value={occurred} onChangeText={setOccurred} placeholder="ГГГГ-ММ-ДД" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text }]} /></Field></View>
                <View style={{ flex: 1 }}><Field label="Вернуть до"><TextInput value={due} onChangeText={setDue} placeholder="необязательно" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text }]} /></Field></View>
              </View>
              <Field label="Комментарий"><TextInput value={note} onChangeText={setNote} multiline placeholder="Важные детали" placeholderTextColor={theme.textSecondary} style={[styles.input, styles.noteInput, { color: theme.text }]} /></Field>
            </View>

            <TouchableOpacity disabled={saving} onPress={saveDraft} style={[styles.saveButton, { backgroundColor: theme.tint }]}>
              {saving ? <ActivityIndicator color="#07120D" /> : <SymbolView name="checkmark" tintColor="#07120D" size={20} />}
              <ThemedText type="smallBold" style={{ color: '#07120D' }}>Сохранить запись</ThemedText>
            </TouchableOpacity>
          </>
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

function SegmentButton({ label, icon, active, onPress }: { label: string; icon: any; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.segmentButton, active && { backgroundColor: theme.backgroundSelected }]}>
      <SymbolView name={icon} tintColor={active ? theme.tint : theme.textSecondary} size={16} />
      <ThemedText type="smallBold" themeColor={active ? 'text' : 'textSecondary'}>{label}</ThemedText>
    </Pressable>
  );
}

function KindButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.kindButton, { borderColor: active ? theme.tint : theme.separator, backgroundColor: active ? `${theme.tint}18` : theme.backgroundElement }]}>
      <ThemedText type="smallBold" style={{ color: active ? theme.tint : theme.textSecondary, textAlign: 'center' }}>{label}</ThemedText>
    </Pressable>
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
  container: { flex: 1, backgroundColor: '#0D100F' },
  content: { paddingHorizontal: Spacing.three, paddingBottom: BottomTabInset + Spacing.five, gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -1.1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roundButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  mainSegment: { flexDirection: 'row', padding: 4, borderRadius: Radius.md },
  segmentButton: { flex: 1, height: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  hero: { borderRadius: Radius.xl, padding: Spacing.four, minHeight: 154, justifyContent: 'flex-end' },
  heroTop: { position: 'absolute', left: Spacing.four, top: Spacing.three, right: Spacing.four, flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(7,18,13,0.12)', alignItems: 'center', justifyContent: 'center' },
  heroValue: { color: '#07120D', fontSize: 38, lineHeight: 43, fontWeight: '800', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
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
  kindRow: { flexDirection: 'row', gap: 7 },
  kindButton: { flex: 1, minHeight: 48, paddingHorizontal: 6, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  textComposer: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: 8, minHeight: 92, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  rawInput: { flex: 1, minHeight: 70, maxHeight: 130, paddingHorizontal: 8, paddingVertical: 8, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
  composerIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  parseButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  photoPreview: { width: '100%', height: 150, borderRadius: Radius.lg, resizeMode: 'cover' },
  formHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  form: { borderRadius: Radius.lg, padding: Spacing.three, gap: 13 },
  field: { gap: 6 },
  input: { minHeight: 46, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.055)', paddingHorizontal: 13, paddingVertical: 10, fontSize: 16 },
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
