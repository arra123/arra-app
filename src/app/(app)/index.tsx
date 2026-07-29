import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppleSegmented } from '@/components/apple-segmented';
import { FabMenu } from '@/components/fab-menu';
import { GlassCard } from '@/components/glass-card';
import { MerchantLogo } from '@/components/merchant-logo';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { APP_BUILD, BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { loadLastCarService, saveLastCarService } from '@/lib/prefs';
import { onQuickAction, takeQuickAction } from '@/lib/quick-action';
import { updateQuickWidget } from '@/widgets/quick-widget';

type Debt = {
  id: string;
  counterparty: string;
  amount: string;
  direction: 'owes_me' | 'i_owe';
  settled: boolean;
  note?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
};
type ViewKind = 'period' | 'people';

const people = ['Тима', 'Даня', 'Женя'] as const;
const cars = ['Ситидрайв', 'Делимобиль', 'БелкаКар', 'Яндекс Драйв'] as const;
/** Частые назначения — чтобы не набирать руками каждый раз. */
const purposes = ['Каршеринг', 'Такси', 'Еда', 'Продукты', 'Подписка', 'Дом', 'Заправка'] as const;

const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const recipient = (d: Debt) => d.note?.match(/\[(Тима|Даня|Женя)\]/)?.[1] || 'Тима';
const cleanNote = (d: Debt) => (d.note || '').replace(/\[(Тима|Даня|Женя)\]\s*/g, '').trim();
const dateOf = (d: Debt) => new Date(d.occurred_at || d.created_at || Date.now());
const timeOf = (d: Debt) => dateOf(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const startOfDay = (date: Date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};
const dayTitle = (value: number) => {
  const date = startOfDay(new Date(value));
  const diff = Math.round((startOfDay(new Date()).getTime() - date.getTime()) / 86400000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
};

/** SF Symbols есть только на устройстве — в вебе показываем знак-заменитель. */
function Glyph({ name, fallback, color, size = 16 }: { name: string; fallback: string; color: string; size?: number }) {
  if (Platform.OS === 'web') return <ThemedText style={{ color, fontSize: size + 2, lineHeight: size + 6 }}>{fallback}</ThemedText>;
  return <SymbolView name={name as never} tintColor={color} size={size} />;
}

export default function FinanceScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [mine, setMine] = useState<Debt[]>([]);
  const [view, setView] = useState<ViewKind>('period');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [edit, setEdit] = useState<Debt | 'new' | null>(null);
  const [carOpen, setCarOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ debts: Debt[] }>('/debts?all=true');
      const all = r.debts || [];
      setDebts(all.filter((d) => d.direction !== 'i_owe'));
      setMine(all.filter((d) => d.direction === 'i_owe' && !d.settled));
    } catch (e: any) { Alert.alert('Не загрузилось', e?.message || ''); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Быстрое действие из виджета: открываем форму каршеринга сразу.
  useEffect(() => {
    if (takeQuickAction('car')) setCarOpen(true);
    return onQuickAction((action) => { if (action === 'car') setCarOpen(true); });
  }, []);

  const unpaid = useMemo(() => debts.filter((d) => !d.settled), [debts]);
  const feed = useMemo(() => [...unpaid].sort((a, b) => dateOf(b).getTime() - dateOf(a).getTime()), [unpaid]);
  const total = unpaid.reduce((s, d) => s + Number(d.amount), 0);

  // Держим виджет в актуальном состоянии — он читает только то, что ему передали.
  useEffect(() => {
    updateQuickWidget({ total, count: unpaid.length });
  }, [total, unpaid.length]);
  const oldest = unpaid.length ? new Date(Math.min(...unpaid.map((d) => dateOf(d).getTime()))) : null;

  const days = useMemo(() => {
    const map = new Map<number, Debt[]>();
    for (const d of feed) {
      const key = startOfDay(dateOf(d)).getTime();
      map.set(key, [...(map.get(key) || []), d]);
    }
    return [...map.entries()];
  }, [feed]);

  const byCounterparty = useMemo(() => {
    const map = new Map<string, Debt[]>();
    for (const d of unpaid) {
      const key = (d.counterparty || 'Без имени').trim();
      map.set(key, [...(map.get(key) || []), d]);
    }
    return [...map.entries()]
      .map(([name, items]) => ({
        name,
        items: items.sort((a, b) => dateOf(b).getTime() - dateOf(a).getTime()),
        total: items.reduce((s, d) => s + Number(d.amount), 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [unpaid]);

  // Оптимистично: сначала меняем список, потом сеть. Иначе экран «моргает».
  async function settle(d: Debt) {
    haptic.success();
    setDebts((current) => current.map((item) => item.id === d.id ? { ...item, settled: !item.settled } : item));
    try { await api(`/debts/${d.id}`, { method: 'PATCH', body: { settled: !d.settled } }); }
    catch (e: any) { Alert.alert('Не сохранилось', e?.message || ''); await load(); }
  }

  async function remove(d: Debt) {
    haptic.warning();
    setDebts((current) => current.filter((item) => item.id !== d.id));
    setMine((current) => current.filter((item) => item.id !== d.id));
    try { await api(`/debts/${d.id}`, { method: 'DELETE' }); }
    catch (e: any) { Alert.alert('Не удалилось', e?.message || ''); await load(); }
  }

  const row = (d: Debt) => {
    const purpose = cleanNote(d);
    const named = !!d.counterparty && !/компан/i.test(d.counterparty);
    const title = named ? d.counterparty : (purpose || 'Без названия');
    const who = recipient(d);
    return (
      <ReanimatedSwipeable
        key={d.id}
        friction={1.1}
        rightThreshold={30}
        overshootRight={false}
        renderRightActions={() => (
          <View style={styles.swipeActions}>
            <Pressable
              onPress={() => settle(d)}
              style={[styles.swipeButton, { backgroundColor: d.settled ? theme.warning : theme.success }]}>
              <Glyph name={d.settled ? 'arrow.uturn.backward' : 'checkmark'} fallback="✓" color="#fff" size={20} />
            </Pressable>
            <Pressable onPress={() => remove(d)} style={[styles.swipeButton, { backgroundColor: theme.danger }]}>
              <Glyph name="trash.fill" fallback="✕" color="#fff" size={19} />
            </Pressable>
          </View>
        )}>
        <Pressable
          onPress={() => { haptic.tap(); setEdit(d); }}
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: pressed ? theme.backgroundSelected : theme.glass },
            d.settled && styles.settled,
          ]}>
          <MerchantLogo merchant={`${d.counterparty} ${d.note || ''}`} size={38} />
          <View style={styles.rowText}>
            <ThemedText type="smallBold" numberOfLines={1}>{title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {[`должен ${d.counterparty || 'Компания'}`, named ? purpose : '', who !== 'Тима' ? `платил ${who}` : '', timeOf(d)].filter(Boolean).join(' · ')}
            </ThemedText>
          </View>
          <ThemedText type="smallBold" style={d.settled ? { color: theme.textSecondary, textDecorationLine: 'line-through' } : undefined}>
            {money(Number(d.amount))}
          </ThemedText>
          <Glyph name="chevron.right" fallback="›" color={theme.separator} size={13} />
        </Pressable>
      </ReanimatedSwipeable>
    );
  };

  return (
    <ThemedView style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.textSecondary} />}
        showsVerticalScrollIndicator={false}>

        <ThemedText style={styles.title} numberOfLines={1}>Финансы</ThemedText>

        <GlassCard radius={Radius.lg} style={styles.summary}>
          <ThemedText style={styles.total}>{money(total)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {unpaid.length
              ? `не вернули · ${unpaid.length} ${plural(unpaid.length, 'запись', 'записи', 'записей')}${oldest ? ` · с ${oldest.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}` : ''}`
              : 'Все долги закрыты'}
          </ThemedText>
        </GlassCard>

        <AppleSegmented
          values={['Лента', 'Кто должен']}
          selectedIndex={view === 'period' ? 0 : 1}
          onChange={(index) => setView(index === 0 ? 'period' : 'people')}
        />

        {loading ? <ActivityIndicator style={{ marginTop: 60 }} color={theme.tint} /> : view === 'people' ? (
          <>
            {byCounterparty.length === 0 && mine.length === 0 ? (
              <View style={styles.empty}><ThemedText themeColor="textSecondary">Все долги закрыты</ThemedText></View>
            ) : byCounterparty.map((group) => (
              <GlassCard key={group.name} radius={Radius.lg} style={styles.list}>
                <View style={styles.personHead}>
                  <MerchantLogo merchant={`${group.name} ${cleanNote(group.items[0])}`} size={40} />
                  <View style={styles.rowText}>
                    <ThemedText type="smallBold" numberOfLines={1}>{group.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{group.items.length} {plural(group.items.length, 'запись', 'записи', 'записей')}</ThemedText>
                  </View>
                  <ThemedText type="smallBold">{money(group.total)}</ThemedText>
                </View>
                {group.items.map(row)}
              </GlassCard>
            ))}
            {mine.length > 0 && (
              <View style={styles.group}>
                <ThemedText type="smallBold" style={styles.groupHead}>Я должен · {money(mine.reduce((s, d) => s + Number(d.amount), 0))}</ThemedText>
                <GlassCard radius={Radius.lg} style={styles.list}>{mine.map(row)}</GlassCard>
              </View>
            )}
          </>
        ) : days.length === 0 ? (
          <View style={styles.empty}>
            <Glyph name="tray" fallback="—" color={theme.textSecondary} size={28} />
            <ThemedText themeColor="textSecondary">Открытых записей нет</ThemedText>
          </View>
        ) : (
          days.map(([key, items]) => {
            const daySum = items.filter((d) => !d.settled).reduce((s, d) => s + Number(d.amount), 0);
            return (
              <View key={key} style={styles.group}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.groupHead}>
                  {dayTitle(key)} · {money(daySum)}
                </ThemedText>
                <GlassCard radius={Radius.lg} style={styles.list}>{items.map(row)}</GlassCard>
              </View>
            );
          })
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.version}>v{APP_BUILD}</ThemedText>
      </ScrollView>

      <FabMenu
        label="Добавить запись"
        actions={[
          { id: 'car', label: 'Каршеринг', systemImage: 'car.fill', tint: '#34C759', onPress: () => setCarOpen(true) },
          { id: 'new', label: 'Новая запись', systemImage: 'square.and.pencil', onPress: () => setEdit('new') },
        ]}
      />

      <CarSheet visible={carOpen} onClose={() => setCarOpen(false)} onSaved={async () => { setCarOpen(false); await load(); }} />
      <DebtEditor
        key={edit === 'new' ? 'new' : edit?.id || 'closed'}
        debt={edit}
        onClose={() => setEdit(null)}
        onSaved={async () => { setEdit(null); await load(); }}
        onSettle={(d) => { setEdit(null); void settle(d); }}
        onDelete={(d) => { setEdit(null); void remove(d); }}
      />
    </ThemedView>
  );
}

/** Быстрый каршеринг: выбрал сервис, вписал сумму — остальное подставится само. */
function CarSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const theme = useTheme();
  const [picked, setPicked] = useState<string>(cars[0]);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  // Последний сервис запоминается — обычно ездят на одном и том же.
  useEffect(() => {
    if (!visible) return;
    setAmount('');
    loadLastCarService().then((last) => { if (last && cars.includes(last as (typeof cars)[number])) setPicked(last); });
  }, [visible]);

  async function save() {
    if (!Number(amount)) { haptic.error(); Alert.alert('Впиши сумму'); return; }
    setSaving(true);
    try {
      await api('/debts', {
        method: 'POST',
        body: { counterparty: picked, note: '[Тима] Каршеринг', amount: Number(amount), direction: 'owes_me', occurred_at: new Date().toISOString() },
      });
      await saveLastCarService(picked);
      haptic.success();
      setAmount('');
      onSaved();
    } catch (e: any) { haptic.error(); Alert.alert('Не сохранилось', e?.message || ''); }
    finally { setSaving(false); }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Каршеринг"
      rightLabel={saving ? 'Пишу…' : 'Записать'}
      onRight={save}
      rightDisabled={saving || !Number(amount)}>
      <View style={styles.sheetBody}>
        <View style={styles.carGrid}>
          {cars.map((car) => {
            const on = picked === car;
            return (
              <Pressable
                key={car}
                onPress={() => { haptic.select(); setPicked(car); }}
                style={[styles.carTile, {
                  borderColor: on ? theme.tint : theme.separator,
                  backgroundColor: on ? theme.backgroundSelected : theme.backgroundElement,
                }]}>
                <MerchantLogo merchant={car} size={34} />
                <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>{car}</ThemedText>
                {on && <Glyph name="checkmark.circle.fill" fallback="✓" color={theme.tint} size={17} />}
              </Pressable>
            );
          })}
        </View>
        <AmountField value={amount} onChange={setAmount} autoFocus />
      </View>
    </Sheet>
  );
}

function DebtEditor({
  debt,
  onClose,
  onSaved,
  onSettle,
  onDelete,
}: {
  debt: Debt | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
  onSettle: (d: Debt) => void;
  onDelete: (d: Debt) => void;
}) {
  const theme = useTheme();
  const item = debt && debt !== 'new' ? debt : null;
  const [counterparty, setCounterparty] = useState(item?.counterparty && !/компан/i.test(item.counterparty) ? item.counterparty : '');
  const [note, setNote] = useState(item ? cleanNote(item) : '');
  const [amount, setAmount] = useState(item?.amount ? String(Math.round(Number(item.amount))) : '');
  const [person, setPerson] = useState<string>(item ? recipient(item) : 'Тима');
  const [when, setWhen] = useState<Date>(() => (item ? dateOf(item) : new Date()));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!Number(amount)) { haptic.error(); Alert.alert('Впиши сумму'); return; }
    setSaving(true);
    const body = {
      counterparty: counterparty.trim() || note.trim() || 'Компания',
      amount: Number(amount),
      direction: item?.direction || 'owes_me',
      note: `[${person}] ${note.trim()}`.trim(),
      occurred_at: when.toISOString(),
    };
    try {
      await api(item ? `/debts/${item.id}` : '/debts', { method: item ? 'PATCH' : 'POST', body });
      haptic.success();
      onSaved();
    } catch (e: any) { haptic.error(); Alert.alert('Не сохранилось', e?.message || ''); }
    finally { setSaving(false); }
  }

  return (
    <Sheet
      visible={!!debt}
      onClose={onClose}
      title={item ? 'Запись' : 'Новая запись'}
      rightLabel={saving ? 'Пишу…' : 'Сохранить'}
      onRight={save}
      rightDisabled={saving || !Number(amount)}>
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetBody}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}>

        {/* Шапка записи: логотип узнаётся раньше, чем читается текст. */}
        <View style={styles.editorHead}>
          <MerchantLogo merchant={`${counterparty} ${note}`} size={52} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <ThemedText type="smallBold" numberOfLines={1}>{counterparty.trim() || note.trim() || 'Кому платили'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {when.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </ThemedText>
          </View>
        </View>

        <AmountField value={amount} onChange={setAmount} autoFocus={!item} />

        <Field label="Кто">
          <TextInput
            value={counterparty}
            onChangeText={setCounterparty}
            placeholder="Ситидрайв, Пятёрочка, Женя…"
            placeholderTextColor={theme.textSecondary}
            maxFontSizeMultiplier={1.18}
            style={[styles.input, { color: theme.text, borderColor: theme.separator, backgroundColor: theme.backgroundElement }]}
          />
        </Field>

        <Field label="За что">
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Каршеринг"
            placeholderTextColor={theme.textSecondary}
            maxFontSizeMultiplier={1.18}
            style={[styles.input, { color: theme.text, borderColor: theme.separator, backgroundColor: theme.backgroundElement }]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
            {purposes.map((value) => {
              const on = note.trim().toLowerCase() === value.toLowerCase();
              return (
                <Pressable
                  key={value}
                  onPress={() => { haptic.select(); setNote(on ? '' : value); }}
                  style={[styles.chip, {
                    borderColor: on ? theme.tint : theme.separator,
                    backgroundColor: on ? theme.tint : theme.backgroundElement,
                  }]}>
                  <ThemedText type="small" style={{ color: on ? '#fff' : theme.text, fontWeight: '600' }}>{value}</ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </Field>

        <Field label="Кто платил">
          <AppleSegmented
            values={[...people]}
            selectedIndex={Math.max(0, people.indexOf(person as (typeof people)[number]))}
            onChange={(index) => { haptic.select(); setPerson(people[index]); }}
          />
        </Field>

        <View style={[styles.dateRow, { borderColor: theme.separator, backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">Когда</ThemedText>
          <DateTimePicker
            value={when}
            mode="datetime"
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            locale="ru-RU"
            onChange={(_, next) => { if (next) setWhen(next); }}
          />
        </View>

        {item && (
          <View style={styles.editorActions}>
            <Pressable
              onPress={() => onSettle(item)}
              style={({ pressed }) => [styles.editorAction, {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.separator,
                opacity: pressed ? 0.7 : 1,
              }]}>
              <Glyph name={item.settled ? 'arrow.uturn.backward' : 'checkmark.circle.fill'} fallback="✓" color={item.settled ? theme.warning : theme.success} size={18} />
              <ThemedText type="smallBold" style={{ color: item.settled ? theme.warning : theme.success }}>
                {item.settled ? 'Вернуть в долги' : 'Уже вернули'}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => Alert.alert('Удалить запись?', '', [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Удалить', style: 'destructive', onPress: () => onDelete(item) },
              ])}
              style={({ pressed }) => [styles.editorAction, {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.separator,
                opacity: pressed ? 0.7 : 1,
              }]}>
              <Glyph name="trash.fill" fallback="✕" color={theme.danger} size={17} />
              <ThemedText type="smallBold" style={{ color: theme.danger }}>Удалить</ThemedText>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </Sheet>
  );
}

/** Крупное поле суммы — главный элемент формы. */
function AmountField({ value, onChange, autoFocus = false }: { value: string; onChange: (next: string) => void; autoFocus?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.amountBox, { borderColor: theme.separator, backgroundColor: theme.backgroundElement }]}>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        autoFocus={autoFocus}
        placeholder="0"
        placeholderTextColor={theme.separator}
        maxFontSizeMultiplier={1.1}
        style={[styles.amountInput, { color: theme.text }]}
      />
      <ThemedText style={[styles.amountCurrency, { color: theme.textSecondary }]}>₽</ThemedText>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ gap: 7 }}><ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Снизу оставляем место под плавающую кнопку, иначе она накрывает последнюю запись.
  content: { paddingHorizontal: Spacing.three, paddingBottom: BottomTabInset + 110, gap: Spacing.three },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8 },
  summary: { padding: Spacing.three, gap: Spacing.two },
  total: { fontSize: 38, lineHeight: 44, fontWeight: '800', letterSpacing: -1.4 },
  group: { gap: Spacing.two },
  groupHead: { paddingHorizontal: 4 },
  list: { overflow: 'hidden' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three },
  personHead: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three },
  rowText: { flex: 1, gap: 3 },
  settled: { opacity: 0.5 },
  swipeActions: { flexDirection: 'row' },
  swipeButton: { width: 62, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: Spacing.three, paddingVertical: 70 },
  version: { textAlign: 'center', opacity: 0.4 },

  sheetScroll: { flexGrow: 0 },
  sheetBody: { padding: Spacing.three, gap: Spacing.three },
  editorHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  amountBox: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  amountInput: { flex: 1, minWidth: 0, fontSize: 40, lineHeight: 48, fontWeight: '800', letterSpacing: -1.4, paddingVertical: Spacing.two },
  amountCurrency: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  input: { minHeight: 48, paddingHorizontal: Spacing.three, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, fontSize: 16 },
  chips: { gap: Spacing.two, paddingVertical: 2, paddingRight: Spacing.three },
  chip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: Spacing.three, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  dateRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  editorActions: { flexDirection: 'row', gap: Spacing.two },
  editorAction: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  carGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  carTile: {
    width: '48%',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
});
