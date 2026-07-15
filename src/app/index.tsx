import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { MerchantLogo } from '@/components/merchant-logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VoiceRecorder } from '@/components/voice-recorder';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';

type ReimbursementStatus = 'pending' | 'submitted' | 'reimbursed' | 'rejected';
type Recipient = 'Тима' | 'Даня' | 'Женя';
type Reimbursement = {
  id: string;
  amount: string;
  currency: string;
  purpose: string;
  merchant?: string | null;
  location?: string | null;
  company: string;
  recipient: Recipient;
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
  recipient?: Recipient | null;
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
const COMPANY_ICON = require('../../assets/images/company-reimbursement-2d-256.png');
const RECIPIENT_KEY = 'noda-finance-recipient';
const RECIPIENTS: Recipient[] = ['Тима', 'Даня', 'Женя'];
const normalizeRecipient = (value?: string | null): Recipient => {
  const text = String(value || '').toLowerCase();
  if (text.includes('жен')) return 'Женя';
  if (text.includes('дан')) return 'Даня';
  return 'Тима';
};
const dateInput = (value?: string | null) => value ? value.slice(0, 10) : '';
const dateLabel = (value?: string | null) => value
  ? new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : 'дата не указана';
const monthKey = (value?: string | null) => {
  const date = value ? new Date(value) : new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
const monthTitle = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
};
const moveMonth = (key: string, step: number) => {
  const [year, month] = key.split('-').map(Number);
  return monthKey(new Date(year, month - 1 + step, 1).toISOString());
};
type FinanceRecord = {
  key: string; type: 'reimbursement' | 'debt'; id: string; amount: number; title: string;
  merchant: string; recipient: Recipient; occurredAt: string; closed: boolean; direction: 'owes_me' | 'i_owe';
  source: Reimbursement | Debt;
};

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
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey());
  const [groupBy, setGroupBy] = useState<'week' | 'day'>('week');
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState<Reimbursement | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [lastSaved, setLastSaved] = useState<SavedEntry | null>(null);
  const [parseError, setParseError] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const addScrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

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
  const [recipient, setRecipient] = useState<Recipient>('Тима');
  const [counterparty, setCounterparty] = useState('');
  const [occurred, setOccurred] = useState(() => new Date().toISOString().slice(0, 10));
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');

  const scrollAddEnd = useCallback((animated = true) => {
    requestAnimationFrame(() => addScrollRef.current?.scrollToEnd({ animated }));
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
      scrollAddEnd(false);
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, [scrollAddEnd]);

  useEffect(() => {
    SecureStore.getItemAsync(RECIPIENT_KEY).then((value) => {
      if (value) setRecipient(normalizeRecipient(value));
    }).catch(() => {});
  }, []);

  const chooseRecipient = useCallback((next: Recipient) => {
    setRecipient(next);
    haptic.tap();
    SecureStore.setItemAsync(RECIPIENT_KEY, next).catch(() => {});
  }, []);

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

  const financeRecords: FinanceRecord[] = [
    ...items.map((item) => ({
      key: `r-${item.id}`, type: 'reimbursement' as const, id: item.id, amount: Number(item.amount),
      title: item.purpose, merchant: item.merchant || item.purpose, recipient: normalizeRecipient(item.recipient),
      occurredAt: item.occurred_at, closed: ['reimbursed', 'rejected'].includes(item.status),
      direction: 'owes_me' as const, source: item,
    })),
    ...debts.map((debt) => ({
      key: `d-${debt.id}`, type: 'debt' as const, id: debt.id, amount: Number(debt.amount),
      title: debt.note?.trim() || debt.counterparty, merchant: debt.note?.trim() || debt.counterparty,
      recipient: normalizeRecipient(debt.recipient), occurredAt: debt.occurred_at || '', closed: debt.settled,
      direction: debt.direction, source: debt,
    })),
  ];
  const activeOwedRecords = financeRecords.filter((record) => !record.closed && record.direction === 'owes_me');
  const activeItems = items.filter((item) => !['reimbursed', 'rejected'].includes(item.status));
  const activeDebts = debts.filter((debt) => !debt.settled);
  const outstanding = activeOwedRecords.reduce((sum, record) => sum + record.amount, 0);
  const recipientTotals = RECIPIENTS.map((name) => ({ name, total: activeOwedRecords.filter((record) => record.recipient === name).reduce((sum, record) => sum + record.amount, 0) }));
  const iOwe = activeDebts.filter((debt) => debt.direction === 'i_owe').reduce((sum, debt) => sum + Number(debt.amount), 0);
  const visibleRecords = financeRecords
    .filter((record) => record.direction === 'owes_me' && record.closed === showClosed && monthKey(record.occurredAt) === selectedMonth)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  const groupedRecords = visibleRecords.reduce<{ key: string; label: string; records: FinanceRecord[]; total: number }[]>((groups, record) => {
    const date = new Date(record.occurredAt);
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (groupBy === 'week') {
      const mondayOffset = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - mondayOffset);
    }
    const key = start.toISOString().slice(0, 10);
    let group = groups.find((entry) => entry.key === key);
    if (!group) {
      const end = new Date(start);
      if (groupBy === 'week') end.setDate(end.getDate() + 6);
      const label = groupBy === 'week'
        ? `${start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} — ${end.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`
        : start.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
      group = { key, label, records: [], total: 0 };
      groups.push(group);
    }
    group.records.push(record);
    group.total += record.amount;
    return groups;
  }, []);

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
    setParseError('');
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
    if (parsed.recipient) chooseRecipient(normalizeRecipient(parsed.recipient));
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
    if (cleaned) setRaw(cleaned);
    setSource(nextSource);
    setDraftReady(false);
    setLastSaved(null);
    setParseError('');
    setParsing(true);
    try {
      const response = await api<{ parsed: Parsed }>('/reimbursements/parse', {
        body: {
          text: cleaned || undefined,
          image,
          preferredKind: kind === 'reimbursement' ? 'reimbursement' : 'debt',
          preferredRecipient: recipient,
        },
      });
      applyParsed(response.parsed, cleaned, nextSource);
      haptic.success();
    } catch (error: any) {
      haptic.error();
      setParseError(error?.message || 'AI-сервис не ответил. Попробуйте ещё раз.');
    } finally {
      setParsing(false);
    }
  }

  function switchSection(next: 'overview' | 'add') {
    if (next === section) return;
    inputRef.current?.blur();
    Keyboard.dismiss();
    haptic.tap();
    setSection(next);
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
            recipient, note: note.trim() || null, source, raw_input: raw.trim() || null,
          },
        });
      } else {
        await api('/debts', {
          body: {
            amount: numericAmount, counterparty: counterparty.trim(), direction: kind,
            occurred_at: occurred || null, due_date: due || null, note: note.trim() || null, recipient,
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
      <View style={[styles.topArea, { paddingTop: insets.top + 10, backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Возвраты</ThemedText>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => setShowSettings(true)} style={[styles.roundButton, { backgroundColor: theme.backgroundElement }]}>
              <SymbolView name="gearshape.fill" tintColor={theme.text} size={18} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.sectionTabs, { backgroundColor: theme.backgroundSelected, borderColor: theme.separator }]}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: section === 'add' }}
            onPress={() => switchSection('add')}
            style={({ pressed }) => [
              styles.sectionTab,
              section === 'add' && { backgroundColor: theme.tint },
              pressed && { opacity: 0.78 },
            ]}>
            <SymbolView name="waveform" tintColor={section === 'add' ? '#FFFFFF' : theme.textSecondary} size={16} />
            <ThemedText type="smallBold" style={{ color: section === 'add' ? '#FFFFFF' : theme.textSecondary }}>Записать</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: section === 'overview' }}
            onPress={() => switchSection('overview')}
            style={({ pressed }) => [
              styles.sectionTab,
              section === 'overview' && { backgroundColor: theme.tint },
              pressed && { opacity: 0.78 },
            ]}>
            <SymbolView name="list.bullet" tintColor={section === 'overview' ? '#FFFFFF' : theme.textSecondary} size={16} />
            <ThemedText type="smallBold" style={{ color: section === 'overview' ? '#FFFFFF' : theme.textSecondary }}>Список</ThemedText>
            {!!activeItems.length && (
              <View style={[styles.sectionCount, { backgroundColor: section === 'overview' ? 'rgba(255,255,255,0.18)' : theme.backgroundElement }]}>
                <ThemedText type="smallBold" style={{ color: section === 'overview' ? '#FFFFFF' : theme.textSecondary }}>{activeItems.length}</ThemedText>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {section === 'overview' ? (
        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.overviewContent, { paddingBottom: Math.max(insets.bottom, BottomTabInset) + Spacing.four }]}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.tint} />}>
            <View style={[styles.hero, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
              <View style={styles.heroTop}>
                <View style={styles.heroIcon}><Image source={COMPANY_ICON} style={styles.companyIcon} resizeMode="contain" /></View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="small" themeColor="textSecondary">Остаток</ThemedText>
                  <ThemedText type="smallBold" style={{ color: theme.tint }}>{activeOwedRecords.length} активных</ThemedText>
                </View>
              </View>
              <ThemedText style={[styles.heroValue, { color: theme.text }]}>{fmt(outstanding)} ₽</ThemedText>
              <View style={styles.heroRecipients}>
                {recipientTotals.map(({ name, total }) => (
                  <View key={name} style={[styles.recipientTotal, { backgroundColor: theme.backgroundSelected }]}>
                    <ThemedText type="small" themeColor="textSecondary">{name}</ThemedText>
                    <ThemedText type="smallBold">{fmt(total)} ₽</ThemedText>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.statsRow}>
              <MoneyStat label="Компания" value={activeItems.reduce((sum, item) => sum + Number(item.amount), 0)} color={theme.success} sign="+" />
              <MoneyStat label="Я должен" value={iOwe} color={theme.warning} sign="−" />
              <TouchableOpacity onPress={() => setShowDebts(true)} style={[styles.allDebts, { backgroundColor: theme.backgroundElement }]}>
                <SymbolView name="chevron.right" tintColor={theme.textSecondary} size={17} />
                <ThemedText type="small" themeColor="textSecondary">Долги</ThemedText>
              </TouchableOpacity>
            </View>

            <View style={[styles.periodBar, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
              <TouchableOpacity onPress={() => setSelectedMonth(moveMonth(selectedMonth, -1))} style={styles.periodArrow}>
                <SymbolView name="chevron.left" tintColor={theme.textSecondary} size={16} />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <ThemedText type="smallBold" style={{ textTransform: 'capitalize' }}>{monthTitle(selectedMonth)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{visibleRecords.length} записей · {fmt(visibleRecords.reduce((sum, record) => sum + record.amount, 0))} ₽</ThemedText>
              </View>
              <TouchableOpacity onPress={() => setSelectedMonth(moveMonth(selectedMonth, 1))} style={styles.periodArrow}>
                <SymbolView name="chevron.right" tintColor={theme.textSecondary} size={16} />
              </TouchableOpacity>
            </View>

            <View style={styles.listHeader}>
              <View style={[styles.smallSegment, { backgroundColor: theme.backgroundSelected, borderColor: theme.separator }]}>
                <Pressable onPress={() => setShowClosed(false)} style={[styles.smallSegmentButton, !showClosed && { backgroundColor: theme.tint }]}>
                  <ThemedText type="smallBold" style={{ color: !showClosed ? '#FFFFFF' : theme.textSecondary }}>Остаток</ThemedText>
                </Pressable>
                <Pressable onPress={() => setShowClosed(true)} style={[styles.smallSegmentButton, showClosed && { backgroundColor: theme.tint }]}>
                  <ThemedText type="smallBold" style={{ color: showClosed ? '#FFFFFF' : theme.textSecondary }}>Возвращено</ThemedText>
                </Pressable>
              </View>
              <View style={[styles.smallSegment, { backgroundColor: theme.backgroundSelected, borderColor: theme.separator }]}>
                <Pressable onPress={() => setGroupBy('week')} style={[styles.smallSegmentButton, groupBy === 'week' && { backgroundColor: theme.backgroundElement }]}><ThemedText type="smallBold" themeColor={groupBy === 'week' ? 'text' : 'textSecondary'}>Недели</ThemedText></Pressable>
                <Pressable onPress={() => setGroupBy('day')} style={[styles.smallSegmentButton, groupBy === 'day' && { backgroundColor: theme.backgroundElement }]}><ThemedText type="smallBold" themeColor={groupBy === 'day' ? 'text' : 'textSecondary'}>Дни</ThemedText></Pressable>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator color={theme.tint} style={{ marginTop: Spacing.four }} />
            ) : visibleRecords.length === 0 ? (
              <View style={[styles.empty, { borderColor: theme.separator }]}>
                <SymbolView name="tray.fill" tintColor={theme.textSecondary} size={28} />
                <ThemedText type="smallBold">{showClosed ? 'В этом месяце возвратов нет' : 'В этом месяце остатка нет'}</ThemedText>
              </View>
            ) : (
              <View style={styles.list}>
                {groupedRecords.map((group) => (
                  <View key={group.key} style={styles.financeGroup}>
                    <View style={styles.financeGroupHeader}>
                      <ThemedText type="smallBold" style={{ textTransform: 'capitalize' }}>{group.label}</ThemedText>
                      <ThemedText type="smallBold" themeColor="textSecondary">{fmt(group.total)} ₽</ThemedText>
                    </View>
                    <View style={[styles.financeGroupBody, { backgroundColor: theme.backgroundElement }]}>
                      {group.records.map((record, index) => (
                        <TouchableOpacity
                          key={record.key}
                          activeOpacity={0.75}
                          onPress={() => record.type === 'reimbursement' ? setEditing(record.source as Reimbursement) : (setEditingDebtId(record.id), setShowDebts(true))}
                          style={[styles.item, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator }]}>
                          <MerchantLogo merchant={record.merchant} size={40} />
                          <View style={{ flex: 1, gap: 3 }}>
                            <ThemedText type="smallBold" numberOfLines={1}>{record.title}</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{dateLabel(record.occurredAt)} · {record.recipient}</ThemedText>
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 5 }}>
                            <ThemedText style={styles.itemAmount}>{fmt(record.amount)} ₽</ThemedText>
                            <TouchableOpacity
                              accessibilityLabel={record.closed ? 'Вернуть в остаток' : 'Отметить возвращённым'}
                              onPress={async (event) => {
                                event.stopPropagation();
                                if (record.type === 'reimbursement') await api(`/reimbursements/${record.id}`, { method: 'PATCH', body: { status: record.closed ? 'pending' : 'reimbursed' } });
                                else await api(`/debts/${record.id}`, { method: 'PATCH', body: { settled: !record.closed } });
                                await load();
                              }}
                              style={[styles.checkButton, { borderColor: record.closed ? theme.tint : theme.separator, backgroundColor: record.closed ? `${theme.tint}22` : 'transparent' }]}>
                              <SymbolView name="checkmark" tintColor={record.closed ? theme.tint : theme.textSecondary} size={14} />
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}
        </ScrollView>
        ) : (
          <View style={styles.conversation}>
            <ScrollView
              ref={addScrollRef}
              style={styles.feedScroll}
              contentContainerStyle={styles.conversationFeed}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => scrollAddEnd(false)}>
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
                      <View style={[styles.formIcon, kind !== 'reimbursement' && { backgroundColor: `${theme.tint}1F` }]}>
                        {kind === 'reimbursement'
                          ? <Image source={COMPANY_ICON} style={styles.companyIcon} resizeMode="contain" />
                          : <SymbolView name="person.2.fill" tintColor={theme.tint} size={18} />}
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
                        <Field label="Кому вернут"><RecipientSwitch value={recipient} onChange={chooseRecipient} /></Field>
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

              {!!parseError && (
                <Pressable onPress={() => parseInput(raw, source)} style={[styles.errorRow, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
                  <View style={[styles.aiMark, { backgroundColor: `${theme.danger}1F` }]}>
                    <SymbolView name="exclamationmark" tintColor={theme.danger} size={15} />
                  </View>
                  <ThemedText type="small" style={{ flex: 1, color: theme.danger }}>{parseError}</ThemedText>
                  {!!raw.trim() && <SymbolView name="arrow.clockwise" tintColor={theme.danger} size={15} />}
                </Pressable>
              )}
            </ScrollView>

            <View style={[styles.dock, { paddingBottom: (keyboardHeight > 0 ? keyboardHeight : Math.max(insets.bottom, BottomTabInset)) + Spacing.two, backgroundColor: theme.background }]}>
              <RecipientSwitch value={recipient} onChange={chooseRecipient} compact />
              <View style={[styles.textComposer, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
                <TouchableOpacity accessibilityLabel="Добавить" onPress={openAddMenu} style={styles.composerIcon}>
                  <SymbolView name="plus" tintColor={theme.textSecondary} size={22} />
                </TouchableOpacity>
                <TextInput
                  ref={inputRef}
                  value={draftReady || parsing ? '' : raw}
                  editable={!parsing && !saving}
                  onFocus={() => scrollAddEnd(false)}
                  onChangeText={(text) => {
                    if (draftReady) resetDraft(kind);
                    setLastSaved(null);
                    setParseError('');
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
                      if (draftReady) resetDraft(kind);
                      setLastSaved(null);
                      setParseError('');
                      setSource('voice');
                      setRaw(text);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                  />
                )}
              </View>
            </View>
          </View>
        )}

      <DebtsModal visible={showDebts} initialDebtId={editingDebtId} onClose={() => { setShowDebts(false); setEditingDebtId(null); }} onChanged={load} />
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

function RecipientSwitch({ value, onChange, compact = false }: { value: Recipient; onChange: (value: Recipient) => void; compact?: boolean }) {
  const theme = useTheme();
  const progress = useRef(new Animated.Value(Math.max(0, RECIPIENTS.indexOf(value)))).current;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    Animated.spring(progress, { toValue: Math.max(0, RECIPIENTS.indexOf(value)), damping: 20, stiffness: 260, mass: 0.7, useNativeDriver: true }).start();
  }, [progress, value]);
  const segment = Math.max(0, (width - 6) / RECIPIENTS.length);
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.recipientSwitch, compact && styles.recipientSwitchCompact, { backgroundColor: theme.backgroundSelected, borderColor: theme.separator }]}>
      {width > 0 && <Animated.View style={[styles.recipientIndicator, { width: segment, backgroundColor: theme.tint, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [0, segment, segment * 2] }) }] }]} />}
      {RECIPIENTS.map((name) => (
        <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: value === name }} onPress={() => onChange(name)} style={({ pressed }) => [styles.recipientButton, pressed && { opacity: 0.72 }]}>
          <ThemedText type="smallBold" style={{ color: value === name ? '#FFFFFF' : theme.textSecondary }}>{name}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

function ReimbursementEditor({ item, onClose, onChanged }: { item: Reimbursement; onClose: () => void; onChanged: () => void }) {
  const theme = useTheme();
  const [amount, setAmount] = useState(String(Math.round(Number(item.amount))));
  const [purpose, setPurpose] = useState(item.purpose || '');
  const [merchant, setMerchant] = useState(item.merchant || '');
  const [location, setLocation] = useState(item.location || '');
  const [company, setCompany] = useState(item.company || 'Компания');
  const [recipient, setRecipient] = useState<Recipient>(normalizeRecipient(item.recipient));
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
        amount: Number(amount.replace(',', '.')), purpose, merchant, location, company, recipient,
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
            <Field label="Кому вернут"><RecipientSwitch value={recipient} onChange={setRecipient} /></Field>
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
  topArea: { paddingHorizontal: Spacing.three, paddingBottom: 10, gap: 10, zIndex: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -1.1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roundButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sectionTabs: { minHeight: 48, padding: 4, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 4 },
  sectionTab: { flex: 1, minHeight: 40, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  sectionCount: { minWidth: 23, height: 23, paddingHorizontal: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  body: { flex: 1 },
  overviewContent: { flexGrow: 1, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.three },
  hero: { borderRadius: Radius.xl, padding: Spacing.four, minHeight: 190, justifyContent: 'flex-end', borderWidth: StyleSheet.hairlineWidth },
  heroTop: { position: 'absolute', left: Spacing.four, top: Spacing.three, right: Spacing.four, flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  companyIcon: { width: '100%', height: '100%' },
  heroValue: { fontSize: 38, lineHeight: 43, fontWeight: '800', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  heroRecipients: { flexDirection: 'row', gap: 8, marginTop: 12 },
  recipientTotal: { flex: 1, minHeight: 38, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statsRow: { flexDirection: 'row', gap: Spacing.two },
  moneyStat: { flex: 1, borderRadius: Radius.md, padding: 12, gap: 2 },
  allDebts: { width: 64, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', gap: 3 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  periodBar: { minHeight: 68, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 8, flexDirection: 'row', alignItems: 'center' },
  periodArrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  smallSegment: { flexDirection: 'row', padding: 3, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth },
  smallSegmentButton: { minHeight: 30, paddingHorizontal: 11, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: Spacing.five, paddingHorizontal: Spacing.four, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg },
  list: { gap: Spacing.three },
  financeGroup: { gap: 7 },
  financeGroupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  financeGroupBody: { borderRadius: Radius.lg, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  itemIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  itemAmount: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  checkButton: { width: 28, height: 28, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  conversation: { flex: 1 },
  feedScroll: { flex: 1 },
  conversationFeed: { flexGrow: 1, minHeight: 300, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: 12, gap: 10, justifyContent: 'flex-end' },
  conversationEmpty: { flex: 1, minHeight: 250, alignItems: 'center', justifyContent: 'center' },
  aiDraftRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingRight: 18 },
  aiMark: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  savedCard: { flex: 1, minHeight: 58, borderRadius: 18, borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  savedAmount: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  userEntryRow: { alignItems: 'flex-end', paddingLeft: 54 },
  userEntryBubble: { maxWidth: '92%', padding: 8, borderRadius: 18, borderBottomRightRadius: 6, gap: 8 },
  parsingCard: { width: 58, height: 44, borderRadius: 18, borderBottomLeftRadius: 6, alignItems: 'center', justifyContent: 'center' },
  errorRow: { minHeight: 50, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  dock: { paddingHorizontal: Spacing.three, paddingTop: 8 },
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
  recipientSwitch: { height: 44, padding: 3, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', overflow: 'hidden' },
  recipientSwitchCompact: { width: 228, height: 36, alignSelf: 'flex-start', marginBottom: 8 },
  recipientIndicator: { position: 'absolute', left: 3, top: 3, bottom: 3, borderRadius: 11 },
  recipientButton: { flex: 1, zIndex: 1, alignItems: 'center', justifyContent: 'center' },
  modalHeader: { minHeight: 58, paddingHorizontal: Spacing.three, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 28, fontWeight: '800' },
  editorContent: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusButton: { width: '48%', minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  deleteButton: { height: 50, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: Spacing.two },
});
