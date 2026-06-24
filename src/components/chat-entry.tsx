import { SymbolView } from 'expo-symbols';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { CategoryIcon } from '@/components/category-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Tx } from '@/components/transaction-row';

const fmt = (n: number) => n.toLocaleString('ru-RU');
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

const SRC_LABEL: Record<string, string> = { voice: 'голос', screenshot: 'фото', text: 'текст', manual: '', image: 'фото' };

/** Одна операция в формате диалога: справа — твоё сообщение, слева — ответ ИИ с разбором. */
export function ChatEntry({ tx, onPress }: { tx: Tx; onPress: (tx: Tx) => void }) {
  const theme = useTheme();
  const sign = tx.type === 'income' ? '+' : '−';
  const amountColor = tx.type === 'income' ? theme.success : theme.text;

  return (
    <View style={styles.wrap}>
      {/* Твоё сообщение */}
      {tx.raw_input ? (
        <View style={styles.userRow}>
          <View style={[styles.userBubble, { backgroundColor: theme.tint }]}>
            <ThemedText style={{ color: '#fff' }}>{tx.raw_input}</ThemedText>
          </View>
        </View>
      ) : null}

      {/* Ответ ИИ */}
      <TouchableOpacity activeOpacity={0.8} onPress={() => onPress(tx)} style={styles.aiRow}>
        <CategoryIcon category={tx.type === 'income' ? 'Зарплата' : tx.category} size={38} />
        <View style={[styles.aiBubble, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
          <View style={styles.topLine}>
            <ThemedText type="smallBold">{tx.type === 'income' ? 'Доход' : 'Расход'} · {tx.category}</ThemedText>
            <ThemedText type="smallBold" style={{ color: amountColor }}>{sign}{fmt(Number(tx.amount))} ₽</ThemedText>
          </View>
          <View style={styles.botLine}>
            <ThemedText type="small" themeColor="textSecondary">
              {[tx.merchant, tx.title].filter(Boolean).join(' · ') || SRC_LABEL[tx.source || ''] || 'добавлено'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{hhmm(tx.occurred_at)}</ThemedText>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

/** Долг в формате диалога. */
export function DebtEntry({
  counterparty,
  amount,
  direction,
  onLongPress,
}: {
  counterparty: string;
  amount: number;
  direction: 'owes_me' | 'i_owe';
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const color = direction === 'owes_me' ? theme.success : theme.warning;
  return (
    <TouchableOpacity activeOpacity={0.8} onLongPress={onLongPress} style={styles.aiRow}>
      <View style={[styles.debtAvatar, { backgroundColor: color }]}>
        <SymbolView name="person.fill" tintColor="#fff" size={18} />
      </View>
      <View style={[styles.aiBubble, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
        <View style={styles.topLine}>
          <ThemedText type="smallBold">{counterparty}</ThemedText>
          <ThemedText type="smallBold" style={{ color }}>{direction === 'owes_me' ? '+' : '−'}{fmt(amount)} ₽</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">{direction === 'owes_me' ? 'должен мне' : 'я должен'}</ThemedText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  userRow: { alignItems: 'flex-end' },
  userBubble: { maxWidth: '82%', paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Radius.lg, borderBottomRightRadius: 6 },
  aiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, maxWidth: '90%' },
  aiBubble: { flex: 1, padding: Spacing.three, borderRadius: Radius.lg, borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth, gap: 4 },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  botLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  debtAvatar: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
