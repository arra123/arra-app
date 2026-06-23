import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { CategoryIcon } from '@/components/category-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';

const CATEGORIES = [
  'Продукты', 'Кафе и рестораны', 'Транспорт', 'Такси', 'Здоровье', 'Одежда',
  'Развлечения', 'Подписки', 'Дом и быт', 'Дети', 'Питомцы', 'Прочее',
];

type Item = { id?: string; title: string; amount: string; category: string | null };
const fmt = (n: number) => n.toLocaleString('ru-RU');

/**
 * Разбивка операции на позиции (заказ Озон 859 ₽ → йогурт/роллы/тефтели),
 * каждая со своей категорией — для точной статистики.
 */
export function TransactionItemsEditor({
  txId,
  txAmount,
  txTitle,
  onClose,
  onSaved,
}: {
  txId: string | null;
  txAmount: number;
  txTitle: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const theme = useTheme();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catFor, setCatFor] = useState<number | null>(null);

  useEffect(() => {
    if (!txId) return;
    setLoading(true);
    api<{ items: { id: string; title: string; amount: number; category: string | null }[] }>(
      `/transactions/${txId}/items`,
    )
      .then((r) =>
        setItems(r.items.map((i) => ({ id: i.id, title: i.title, amount: String(Math.round(i.amount)), category: i.category }))),
      )
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [txId]);

  const sum = items.reduce((s, i) => s + (Number(i.amount.replace(',', '.')) || 0), 0);
  const diff = Math.round((txAmount - sum) * 100) / 100;

  function addItem() {
    setItems((prev) => [...prev, { title: '', amount: diff > 0 ? String(Math.round(diff)) : '', category: null }]);
  }
  function setItem(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!txId || saving) return;
    setSaving(true);
    try {
      const payload = items
        .filter((i) => i.title.trim() && Number(i.amount.replace(',', '.')))
        .map((i) => ({ title: i.title.trim(), amount: Number(i.amount.replace(',', '.')), category: i.category }));
      await api(`/transactions/${txId}/items`, { method: 'PUT', body: { items: payload } });
      onSaved?.();
      onClose();
    } catch {
      setSaving(false);
    }
  }

  return (
    <Modal visible={!!txId} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.wrap, { backgroundColor: '#15161B' }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.h}>Позиции</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{txTitle} · {fmt(txAmount)} ₽</ThemedText>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>Закрыть</ThemedText>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: Spacing.five }} color={theme.textSecondary} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: Spacing.four, gap: Spacing.three }} keyboardShouldPersistTaps="handled">
            {items.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginVertical: Spacing.four }}>
                Разбей заказ на товары — каждый со своей категорией. В статистике они учтутся раздельно.
              </ThemedText>
            )}

            {items.map((it, idx) => (
              <View key={idx} style={[styles.item, { borderColor: theme.separator }]}>
                <View style={styles.itemTop}>
                  <TextInput
                    value={it.title}
                    onChangeText={(v) => setItem(idx, { title: v })}
                    placeholder="Например, роллы"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.titleInput, { color: theme.text }]}
                  />
                  <TextInput
                    value={it.amount}
                    onChangeText={(v) => setItem(idx, { amount: v })}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.amountInput, { color: theme.text }]}
                  />
                  <ThemedText style={{ color: theme.textSecondary, fontSize: 15 }}>₽</ThemedText>
                  <TouchableOpacity onPress={() => removeItem(idx)} hitSlop={8} style={{ paddingLeft: 4 }}>
                    <ThemedText style={{ color: theme.danger, fontSize: 20, fontWeight: '600' }}>×</ThemedText>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setCatFor(catFor === idx ? null : idx)} style={styles.catPick}>
                  {it.category ? <CategoryIcon category={it.category} size={20} /> : null}
                  <ThemedText type="small" style={{ color: it.category ? theme.text : theme.textSecondary }}>
                    {it.category || 'Выбрать категорию'}
                  </ThemedText>
                </TouchableOpacity>
                {catFor === idx && (
                  <View style={styles.catWrap}>
                    {CATEGORIES.map((c) => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => { setItem(idx, { category: c }); setCatFor(null); }}
                        style={[styles.catChip, { borderColor: theme.separator }, it.category === c && { backgroundColor: theme.tint, borderColor: theme.tint }]}>
                        <CategoryIcon category={c} size={18} />
                        <ThemedText type="small" style={{ color: it.category === c ? '#fff' : theme.text }}>{c}</ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))}

            <TouchableOpacity onPress={addItem} style={[styles.addBtn, { borderColor: theme.separator }]}>
              <ThemedText style={{ color: theme.tint, fontWeight: '600' }}>+ Добавить позицию</ThemedText>
            </TouchableOpacity>

            {items.length > 0 && (
              <View style={[styles.sumRow, { borderColor: theme.separator }]}>
                <ThemedText type="smallBold">Сумма позиций</ThemedText>
                <ThemedText type="smallBold" style={{ color: Math.abs(diff) < 0.5 ? theme.success : theme.warning }}>
                  {fmt(sum)} ₽{Math.abs(diff) >= 0.5 ? `  (${diff > 0 ? 'осталось ' + fmt(diff) : 'на ' + fmt(-diff) + ' больше'})` : ''}
                </ThemedText>
              </View>
            )}
          </ScrollView>
        )}

        <TouchableOpacity activeOpacity={0.85} onPress={save} disabled={saving} style={[styles.saveBtn, { backgroundColor: theme.tint, opacity: saving ? 0.6 : 1 }]}>
          {saving ? <ActivityIndicator color="#fff" /> : <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Сохранить позиции</ThemedText>}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.two },
  h: { fontSize: 22, fontWeight: '700' },
  item: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.two },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  titleInput: { flex: 1, fontSize: 16, height: 36 },
  amountInput: { minWidth: 56, textAlign: 'right', fontSize: 16, fontWeight: '700', height: 36 },
  catPick: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingLeft: 6, paddingRight: 11, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  addBtn: { borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', borderRadius: Radius.md, paddingVertical: Spacing.three, alignItems: 'center' },
  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three },
  saveBtn: { height: 52, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', margin: Spacing.four, marginTop: 0 },
});
