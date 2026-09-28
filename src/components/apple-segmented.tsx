import { Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

type Props = {
  values: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Стабильный сегментированный контрол для всех платформ.
 *
 * Системный SwiftUI Picker менял материал и контраст в зависимости от экрана
 * и scroll-edge. Здесь геометрия и цвета полностью предсказуемы.
 */
export function AppleSegmented({
  values,
  selectedIndex,
  onChange,
  enabled = true,
  style,
}: Props) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.control, { backgroundColor: theme.disabled, borderColor: theme.separator }, style]}>
      {values.map((value, index) => {
        const selected = index === selectedIndex;
        return (
          <Pressable
            key={`${value}-${index}`}
            accessibilityRole="tab"
            accessibilityLabel={value}
            accessibilityState={{ selected, disabled: !enabled }}
            disabled={!enabled}
            onPress={() => {
              if (selected) return;
              haptic.select();
              onChange(index);
            }}
            style={({ pressed }) => [
              styles.item,
              selected && [styles.itemSelected, { backgroundColor: theme.backgroundElement }],
              pressed && !selected && styles.itemPressed,
            ]}>
            <ThemedText
              type="smallBold"
              numberOfLines={1}
              style={{ color: selected ? theme.text : theme.textSecondary }}>
              {value}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  control: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: 3,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm + 1,
  },
  itemSelected: {
    shadowColor: '#20232A',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  itemPressed: { opacity: 0.58 },
});
