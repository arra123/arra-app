import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ProfileScreen from '@/app/profile';
import { CategoryIcon, categoryColor } from '@/components/category-icon';
import { DebtsModal } from '@/components/debts-modal';
import { GlassCard } from '@/components/glass-card';
import { MerchantLogo } from '@/components/merchant-logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TransactionEdit } from '@/components/transaction-edit';
import { TransactionRow, type Tx } from '@/components/transaction-row';
import { APP_BUILD, BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';

type Debt = { id: string; counterparty: string; amount: string; direction: 'owes_me' | 'i_owe'; settled: boolean; note?: string | null };
type Summary = { income: number; expense: number };
type Cat = { category: string; total: number };

const fmt = (n: number) => n.toLocaleString('ru-RU');

function startOfDay(iso: string) {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function dayLabel(iso: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = (today - startOfDay(iso)) / 86400000;
  if (diff <= 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
function groupByDay(list: Tx[]) {
  const groups: { key: number; label: string; items: Tx[]; spent: number }[] = [];
  let cur: { key: number; label: string; items: Tx[]; spent: number } | null = null;
  for (const t of list) {
    const key = startOfDay(t.occurred_at);
    if (!cur || cur.key !== key) {
      cur = { key, label: dayLabel(t.occurred_at), items: [], spent: 0 };
      groups.push(cur);
    }
    cur.items.push(t);
    if (t.type === 'expense') cur.spent += Number(t.amount);
  }
  return groups;
}

export default function FinanceScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<Summary>({ income: 0, expense: 0 });
  const [byCat, setByCat] = useState<Cat[]>([]);
  const [byMerchant, setByMerchant] = useState<{ merchant: string; total: number }[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDebts, setShowDebts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [editTx, setEditTx] = useState<Tx | null>(null);
  const [monthDate, setMonthDate] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  const monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
  const now = new Date();
  const isCurrentMonth = monthDate.getFullYear() === now.getFullYear() && monthDate.getMonth() === now.getMonth();
  const monthLabel = monthDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  const load = useCallback(async () => {
    try {
      const [s, t, d] = await Promise.all([
        api<{ summary: Summary; byCategory: Cat[]; byMerchant: { merchant: string; total: number }[] }>(`/stats/summary?month=${monthStr}`),
        api<{ transactions: Tx[] }>(`/transactions?month=${monthStr}&limit=500`),
        api<{ debts: Debt[] }>('/debts'),
      ]);
      setSummary(s.summary);
      setByCat(s.byCategory || []);
      setByMerchant(s.byMerchant || []);
      setTxs(t.transactions);
      setDebts(d.debts);
    } catch (e: any) {
      Alert.alert('Ошибка загрузки', e?.message || '');
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  function shiftMonth(delta: number) {
    setMonthDate((m) => {
      const next = new Date(m.getFullYear(), m.getMonth() + delta, 1);
      const cur = new Date();
      const curStart = new Date(cur.getFullYear(), cur.getMonth(), 1);
      return next > curStart ? curStart : next; // не листаем в будущее
    });
  }
  const monthSwipe = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-14, 14])
    .onEnd((e) => {
      'worklet';
      const go = Math.abs(e.translationX) > 36 || Math.abs(e.velocityX) > 450;
      if (!go) return;
      if (e.translationX < 0) runOnJS(shiftMonth)(1);
      else runOnJS(shiftMonth)(-1);
    });
  function openNew() {
    setEditTx({ id: '', type: 'expense', amount: '', category: 'Прочее', title: null, occurred_at: new Date().toISOString() });
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function deleteTx(id: string) {
    setEditTx(null);
    setTxs((p) => p.filter((t) => t.id !== id));
    try {
      await api(`/transactions/${id}`, { method: 'DELETE' });
      await load();
    } catch {
      load();
    }
  }
  async function saveTx(id: string, patch: { type: 'expense' | 'income'; amount: number; category: string; title: string | null; merchant: string | null; occurred_at: string }) {
    setEditTx(null);
    try {
      if (!id) await api('/transactions', { body: patch });
      else await api(`/transactions/${id}`, { method: 'PUT', body: patch });
      await load();
    } catch (e: any) {
      Alert.alert('Не сохранилось', e?.message || '');
    }
  }
  const maxCat = Math.max(1, ...byCat.map((c) => c.total));
  const maxMerch = Math.max(1, ...byMerchant.map((m) => m.total));
  const owedToMe = debts.filter((d) => d.direction === 'owes_me').reduce((s, d) => s + Number(d.amount), 0);
  const iOwe = debts.filter((d) => d.direction === 'i_owe').reduce((s, d) => s + Number(d.amount), 0);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textSecondary} />}>
        <View style={styles.headRow}>
          <ThemedText style={styles.h1}>Финансы</ThemedText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
            <View style={[styles.verChip, { borderColor: theme.separator }]}>
              <ThemedText type="small" themeColor="textSecondary">v{APP_BUILD}</ThemedText>
            </View>
            <TouchableOpacity onPress={() => setShowSettings(true)} activeOpacity={0.85}>
              <View style={[styles.addBtn, { backgroundColor: theme.backgroundElement }]}>
                <SymbolView name="gearshape.fill" tintColor={theme.text} size={19} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={openNew} activeOpacity={0.85}>
              <View style={[styles.addBtn, { backgroundColor: theme.tint }]}>
                <SymbolView name="plus" tintColor="#fff" size={20} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Месяц + сводка — листаются свайпом влево/вправо */}
        <GestureDetector gesture={monthSwipe}>
          <View style={{ gap: Spacing.three }}>
            <View style={styles.monthRow}>
              <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={12} style={styles.monthArrow}>
                <SymbolView name="chevron.left" tintColor={theme.text} size={16} />
              </TouchableOpacity>
              <ThemedText type="smallBold" style={{ textTransform: 'capitalize' }}>{monthLabel}</ThemedText>
              <TouchableOpacity onPress={() => shiftMonth(1)} disabled={isCurrentMonth} hitSlop={12} style={styles.monthArrow}>
                <SymbolView name="chevron.right" tintColor={isCurrentMonth ? theme.separator : theme.text} size={16} />
              </TouchableOpacity>
            </View>

            <GlassCard radius={Radius.xl} style={styles.hero}>
              <ThemedText type="small" themeColor="textSecondary" style={{ textTransform: 'capitalize' }}>Расходы · {monthLabel}</ThemedText>
              <ThemedText style={styles.heroValue}>{fmt(summary.expense)} ₽</ThemedText>
              <View style={styles.heroIncomeRow}>
                <View style={[styles.heroDot, { backgroundColor: theme.success }]} />
                <ThemedText type="small" themeColor="textSecondary">Доходы</ThemedText>
                <ThemedText type="smallBold" style={{ color: theme.success }}>{fmt(summary.income)} ₽</ThemedText>
              </View>
            </GlassCard>
          </View>
        </GestureDetector>

        {/* Долги — отдельный понятный блок (всегда виден, если есть) */}
        {debts.length > 0 && (
          <TouchableOpacity activeOpacity={0.85} onPress={() => setShowDebts(true)}>
            <GlassCard radius={Radius.lg} style={styles.debtCard}>
              <View style={styles.debtCardTop}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <SymbolView name="person.2.fill" tintColor={theme.textSecondary} size={16} />
                  <ThemedText type="smallBold">Долги</ThemedText>
                </View>
                <SymbolView name="chevron.right" tintColor={theme.textSecondary} size={14} />
              </View>
              <View style={styles.debtCardRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="small" themeColor="textSecondary">Тебе должны</ThemedText>
                  <ThemedText style={[styles.debtCardVal, { color: theme.success }]}>+{fmt(owedToMe)} ₽</ThemedText>
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="small" themeColor="textSecondary">Ты должен</ThemedText>
                  <ThemedText style={[styles.debtCardVal, { color: theme.warning }]}>−{fmt(iOwe)} ₽</ThemedText>
                </View>
              </View>
            </GlassCard>
          </TouchableOpacity>
        )}

        {/* Расходы по категориям — всегда видны (банк-стиль) */}
        {byCat.length > 0 && (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.blockLabel}>По категориям</ThemedText>
            <GlassCard radius={Radius.lg} style={styles.card}>
              {byCat.slice(0, 8).map((cat, i) => (
                <TouchableOpacity key={cat.category} activeOpacity={0.7} onPress={() => setSelectedCat(cat.category)} style={[styles.catRow, i > 0 && { marginTop: Spacing.three }]}>
                  <CategoryIcon category={cat.category} size={36} />
                  <View style={{ flex: 1, gap: 5 }}>
                    <View style={styles.catTop}>
                      <ThemedText type="smallBold">{cat.category}</ThemedText>
                      <ThemedText type="smallBold">{fmt(cat.total)} ₽</ThemedText>
                    </View>
                    <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                      <View style={{ width: `${Math.max(6, (cat.total / maxCat) * 100)}%`, height: '100%', borderRadius: 99, backgroundColor: categoryColor(cat.category) }} />
                    </View>
                  </View>
                  <SymbolView name="chevron.right" tintColor={theme.textSecondary} size={13} />
                </TouchableOpacity>
              ))}
            </GlassCard>
          </>
        )}

        {/* Лента операций по дням */}
        {txs.length > 0 && <ThemedText type="smallBold" themeColor="textSecondary" style={styles.blockLabel}>Последние операции</ThemedText>}
        {loading ? (
          <ActivityIndicator style={{ marginTop: Spacing.four }} />
        ) : txs.length === 0 ? (
          <GlassCard radius={Radius.lg} style={styles.emptyCard}>
            <SymbolView name="tray" tintColor={theme.textSecondary} size={32} />
            <ThemedText type="small" themeColor="textSecondary">Пока пусто</ThemedText>
          </GlassCard>
        ) : (
          groupByDay(txs).map((g) => (
            <View key={g.key}>
              <View style={styles.dayHead}>
                <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: '700' }}>{g.label}</ThemedText>
                {g.spent > 0 && <ThemedText type="small" themeColor="textSecondary">−{fmt(g.spent)} ₽</ThemedText>}
              </View>
              {g.items.map((t) => (
                <TransactionRow key={t.id} tx={t} onPress={setEditTx} onDelete={deleteTx} />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <TransactionEdit tx={editTx} onClose={() => setEditTx(null)} onSave={saveTx} onDelete={deleteTx} onChanged={load} />

      {/* Долги — группировка по должнику, детализация, срок, статус «вернули» */}
      <DebtsModal visible={showDebts} onClose={() => setShowDebts(false)} onChanged={load} />

      {/* Настройки — модалкой (т.к. нативный таб-бар держит максимум 5 вкладок) */}
      <Modal visible={showSettings} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSettings(false)}>
        <ThemedView style={{ flex: 1 }}>
          <View style={styles.debtModalHead}>
            <ThemedText style={styles.h1}>Настройки</ThemedText>
            <TouchableOpacity onPress={() => setShowSettings(false)} hitSlop={10}>
              <SymbolView name="xmark.circle.fill" tintColor={theme.textSecondary} size={28} />
            </TouchableOpacity>
          </View>
          <ProfileScreen embedded />
        </ThemedView>
      </Modal>

      {/* Детализация категории: разбивка по магазинам (подкатегории) + операции */}
      <Modal visible={!!selectedCat} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedCat(null)}>
        <ThemedView style={{ flex: 1 }}>
          <View style={styles.debtModalHead}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
              {selectedCat && <CategoryIcon category={selectedCat} size={34} />}
              <ThemedText style={[styles.h1, { fontSize: 26 }]}>{selectedCat}</ThemedText>
            </View>
            <TouchableOpacity onPress={() => setSelectedCat(null)} hitSlop={10}>
              <SymbolView name="xmark.circle.fill" tintColor={theme.textSecondary} size={28} />
            </TouchableOpacity>
          </View>
          {(() => {
            const list = txs.filter((t) => t.category === selectedCat && t.type === 'expense');
            const total = list.reduce((s, t) => s + Number(t.amount), 0);
            const byKey = new Map<string, { key: string; sum: number; n: number }>();
            for (const t of list) {
              const key = (t.merchant || t.title || 'Без магазина').trim();
              const g = byKey.get(key) || { key, sum: 0, n: 0 };
              g.sum += Number(t.amount); g.n += 1; byKey.set(key, g);
            }
            const groups = Array.from(byKey.values()).sort((a, b) => b.sum - a.sum);
            const maxG = Math.max(1, ...groups.map((g) => g.sum));
            return (
              <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six }}>
                <ThemedText style={{ fontSize: 32, fontWeight: '800' }}>{fmt(total)} ₽</ThemedText>
                <ThemedText type="smallBold" themeColor="textSecondary">По магазинам</ThemedText>
                <GlassCard radius={Radius.lg} style={styles.card}>
                  {groups.map((g, i) => (
                    <View key={g.key} style={[styles.catRow, i > 0 && { marginTop: Spacing.three }]}>
                      <MerchantLogo merchant={g.key} size={34} />
                      <View style={{ flex: 1, gap: 5 }}>
                        <View style={styles.catTop}>
                          <ThemedText type="smallBold" numberOfLines={1}>{g.key}</ThemedText>
                          <ThemedText type="smallBold">{fmt(g.sum)} ₽</ThemedText>
                        </View>
                        <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                          <View style={{ width: `${Math.max(6, (g.sum / maxG) * 100)}%`, height: '100%', borderRadius: 99, backgroundColor: categoryColor(selectedCat || '') }} />
                        </View>
                      </View>
                    </View>
                  ))}
                </GlassCard>
                <ThemedText type="smallBold" themeColor="textSecondary">Операции</ThemedText>
                {list.map((t) => (
                  <TransactionRow key={t.id} tx={t} onPress={(tx) => { setSelectedCat(null); setEditTx(tx); }} onDelete={deleteTx} />
                ))}
              </ScrollView>
            );
          })()}
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing.three, paddingBottom: BottomTabInset + Spacing.five, gap: Spacing.three },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.one },
  h1: { fontSize: 34, fontWeight: '700', lineHeight: 40 },
  verChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  addBtn: { width: 38, height: 38, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.four },
  monthArrow: { padding: Spacing.one },
  hero: { padding: Spacing.four, gap: Spacing.one },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  heroValue: { fontSize: 40, fontWeight: '800', lineHeight: 46, marginTop: 2 },
  heroIncomeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.two },
  heroDot: { width: 8, height: 8, borderRadius: 4 },
  heroIcon: { width: 52, height: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  heroPills: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: Spacing.three, borderRadius: Radius.pill },
  sectionRow: { flexDirection: 'row', gap: Spacing.two },
  secChip: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  toggleRow: { flexDirection: 'row', gap: Spacing.two },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.two, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  debtCard: { padding: Spacing.three, gap: Spacing.two },
  debtCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  debtCardRow: { flexDirection: 'row', gap: Spacing.three },
  debtCardVal: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  catToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.two, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  card: { padding: Spacing.three },
  blockLabel: { marginLeft: 4, marginBottom: -Spacing.one },
  merchTile: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  catTop: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 7, borderRadius: 99, overflow: 'hidden' },
  emptyCard: { paddingVertical: Spacing.five, alignItems: 'center', gap: Spacing.two },
  debtModalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingTop: Spacing.four, paddingBottom: Spacing.two },
  debtSummary: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.three },
  debtBox: { flex: 1, padding: Spacing.three, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: 4 },
  debtVal: { fontSize: 22, fontWeight: '800' },
  debtRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three, paddingHorizontal: Spacing.three, backgroundColor: '#101216', borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.07)', marginBottom: Spacing.two },
  avatar: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.three, marginBottom: Spacing.two, paddingHorizontal: 4 },
  fab: { position: 'absolute', right: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 12, paddingHorizontal: Spacing.four, borderRadius: Radius.pill, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});
