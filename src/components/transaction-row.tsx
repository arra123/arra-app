import { SymbolView } from 'expo-symbols';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { CategoryIcon } from '@/components/category-icon';
import { MerchantLogo } from '@/components/merchant-logo';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type Tx = {
  id: string;
  type: 'expense' | 'income';
  amount: string;
  category: string;
  title: string | null;
  merchant?: string | null;
  occurred_at: string;
  raw_input?: string | null;
  source?: string | null;
  item_count?: number;
};

const fmt = (n: number) => n.toLocaleString('ru-RU');
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function TransactionRow({
  tx,
  onPress,
  onDelete,
}: {
  tx: Tx;
  onPress: (tx: Tx) => void;
  onDelete: (id: string) => void;
}) {
  const theme = useTheme();

  function rightAction() {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onDelete(tx.id)}
        style={[styles.delAction, { backgroundColor: theme.danger }]}>
        <SymbolView name="trash.fill" tintColor="#fff" size={20} />
      </TouchableOpacity>
    );
  }

  return (
    <ReanimatedSwipeable
      renderRightActions={rightAction}
      overshootRight={false}
      friction={1.1}
      rightThreshold={30}
      containerStyle={styles.swipeContainer}>
      <TouchableOpacity activeOpacity={0.7} onPress={() => onPress(tx)} style={styles.row}>
        {tx.merchant ? (
          <MerchantLogo merchant={tx.merchant} size={40} />
        ) : (
          <CategoryIcon category={tx.type === 'income' ? 'Зарплата' : tx.category} size={40} />
        )}
        <View style={styles.mid}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {tx.title || tx.category}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {tx.merchant ? `${tx.merchant} · ` : ''}{tx.category} · {fmtTime(tx.occurred_at)}
            {tx.item_count ? `  ·  ${tx.item_count} поз.` : ''}
          </ThemedText>
        </View>
        <ThemedText type="smallBold" style={{ color: tx.type === 'income' ? theme.success : theme.text }}>
          {tx.type === 'income' ? '+' : '−'}{fmt(Number(tx.amount))} ₽
        </ThemedText>
      </TouchableOpacity>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  swipeContainer: { borderRadius: Radius.md, marginBottom: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    backgroundColor: '#101216',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  mid: { flex: 1, gap: 2 },
  delAction: {
    width: 64,
    marginLeft: Spacing.two,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
