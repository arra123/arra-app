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

/** Дорожка намеренно заметно темнее любой карточки: на белом фоне системный
 *  вариант был «белым по белому» и переключатель невозможно было разглядеть. */
const TRACK = '#E2E5EC';
const TRACK_BORDER = '#CDD1DB';
const THUMB_BORDER = '#C4C9D4';

/**
 * Стабильный сегментированный контрол для всех платформ.
 *
 * Системный SwiftUI Picker менял материал и контраст в зависимости от экрана
 * и scroll-edge, а высоту считал сам — из-за этого он наезжал на подпись.
 * Здесь геометрия и цвета полностью предсказуемы.
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
      style={[styles.control, { backgroundColor: TRACK, borderColor: TRACK_BORDER }, style]}>
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
              selected && [styles.itemSelected, { backgroundColor: '#FFFFFF', borderColor: THUMB_BORDER }],
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
    height: 42,
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: 3,
    borderRadius: Radius.md,
    borderWidth: 1,
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
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#141824',
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  itemPressed: { opacity: 0.58 },
});
