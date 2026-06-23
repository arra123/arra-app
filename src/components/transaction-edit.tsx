import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useRef, useState } from 'react';
import {
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
import { MerchantLogo } from '@/components/merchant-logo';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Tx } from '@/components/transaction-row';

const CATEGORIES = [
  'Продукты', 'Кафе и рестораны', 'Транспорт', 'Такси', 'Жильё', 'Связь и интернет',
  'Здоровье', 'Одежда', 'Развлечения', 'Подписки', 'Образование', 'Подарки',
  'Путешествия', 'Дом и быт', 'Дети', 'Питомцы', 'Авто', 'Зарплата', 'Перевод', 'Прочее',
];

// Популярные магазины/сервисы — логотип подтянется автоматически
const POPULAR = ['Озон', 'Wildberries', 'Яндекс Еда', 'Самокат', 'Пятёрочка', 'Магнит', 'ВкусВилл', 'Перекрёсток', 'Netflix', 'Spotify', 'YouTube', 'Apple', 'Steam', 'KFC', 'Burger King', 'МТС'];

export function TransactionEdit({
  tx,
  onClose,
  onSave,
  onDelete,
}: {
  tx: Tx | null;
  onClose: () => void;
  onSave: (id: string, patch: { type: 'expense' | 'income'; amount: number; category: string; title: string | null; merchant: string | null; occurred_at: string }) => void;
  onDelete: (id: string) => void;
}) {
  const theme = useTheme();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Прочее');
  const [title, setTitle] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(new Date());

  const savedRef = useRef(false);

  useEffect(() => {
    if (tx) {
      savedRef.current = false;
      setType(tx.type);
      setAmount(Number(tx.amount) ? String(Math.round(Number(tx.amount))) : '');
      setCategory(tx.category);
      setTitle(tx.title || '');
      setMerchant(tx.merchant || '');
      setDate(tx.occurred_at ? new Date(tx.occurred_at) : new Date());
    }
  }, [tx]);

  const isNew = !tx?.id;

  if (!tx) return null;

  function save() {
    if (!tx || savedRef.current) return;
    const num = Number(amount.replace(',', '.'));
    if (!num) { onClose(); return; }
    savedRef.current = true;
    onSave(tx.id, { type, amount: num, category, title: title.trim() || null, merchant: merchant.trim() || null, occurred_at: date.toISOString() });
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={save} onDismiss={save}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.sheetWrap, { backgroundColor: '#15161B' }]}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <ThemedText style={styles.h}>{isNew ? 'Новая операция' : 'Операция'}</ThemedText>
          </View>

          {/* Тип */}
          <View style={[styles.seg, { backgroundColor: theme.backgroundSelected }]}>
            {(['expense', 'income'] as const).map((t) => (
              <TouchableOpacity key={t} onPress={() => setType(t)} style={[styles.segBtn, type === t && { backgroundColor: theme.tint }]}>
                <ThemedText type="smallBold" style={{ color: type === t ? '#fff' : theme.textSecondary }}>
                  {t === 'expense' ? 'Расход' : 'Доход'}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          {/* Сумма */}
          <View style={[styles.amountRow, { borderColor: theme.separator }]}>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={theme.textSecondary}
              style={[styles.amountInput, { color: theme.text }]}
            />
            <ThemedText style={styles.rub}>₽</ThemedText>
          </View>

          {/* Название */}
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Название"
            placeholderTextColor={theme.textSecondary}
            style={[styles.titleInput, { color: theme.text, borderColor: theme.separator }]}
          />

          {/* Магазин/сервис */}
          <TextInput
            value={merchant}
            onChangeText={setMerchant}
            placeholder="Магазин"
            placeholderTextColor={theme.textSecondary}
            style={[styles.titleInput, { color: theme.text, borderColor: theme.separator }]}
          />
          {/* Быстрый выбор популярных магазинов (с логотипами) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginTop: -Spacing.one }} contentContainerStyle={{ gap: Spacing.two, paddingVertical: 2 }}>
            {POPULAR.map((m) => {
              const active = merchant.trim().toLowerCase() === m.toLowerCase();
              return (
                <TouchableOpacity key={m} onPress={() => setMerchant(active ? '' : m)}
                  style={[styles.merchChip, { borderColor: active ? theme.tint : theme.separator, backgroundColor: active ? theme.backgroundSelected : 'transparent' }]}>
                  <MerchantLogo merchant={m} size={20} />
                  <ThemedText type="small" style={{ color: theme.text }}>{m}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Дата и время */}
          <View style={styles.dateRow}>
            <ThemedText type="smallBold">Дата и время</ThemedText>
            <DateTimePicker
              value={date}
              mode="datetime"
              display="compact"
              themeVariant="dark"
              accentColor={theme.tint}
              onChange={(_e, d) => d && setDate(d)}
            />
          </View>

          {/* Категория */}
          <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.two }}>Категория</ThemedText>
          <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
            <View style={styles.catWrap}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[styles.catChip, { borderColor: theme.separator }, category === c && { backgroundColor: theme.tint, borderColor: theme.tint }]}>
                  <CategoryIcon category={c} size={22} />
                  <ThemedText type="small" style={{ color: category === c ? '#fff' : theme.text }}>{c}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {!isNew && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => onDelete(tx.id)} style={{ paddingVertical: Spacing.two }}>
              <ThemedText style={{ color: theme.danger, textAlign: 'center', fontWeight: '600', fontSize: 15 }}>Удалить операцию</ThemedText>
            </TouchableOpacity>
          )}
          <TouchableOpacity activeOpacity={0.85} onPress={save} style={[styles.saveBtn, { backgroundColor: theme.tint }]}>
            <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Сохранить</ThemedText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetWrap: { flex: 1 },
  sheet: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: Spacing.one },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h: { fontSize: 22, fontWeight: '700' },
  seg: { flexDirection: 'row', borderRadius: Radius.md, padding: 4, gap: 4 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: Radius.sm },
  amountRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.two },
  amountInput: { flex: 1, fontSize: 32, fontWeight: '800', fontFamily: 'Inter_800ExtraBold' },
  rub: { fontSize: 26, fontWeight: '700' },
  titleInput: { height: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, paddingHorizontal: Spacing.three, fontSize: 16 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.one },
  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 10, paddingLeft: 7, paddingRight: 12, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  merchChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingLeft: 5, paddingRight: 11, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  saveBtn: { height: 52, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.one },
});
