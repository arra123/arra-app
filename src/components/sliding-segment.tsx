import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export type SlidingSegmentOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

type Props<T extends string> = {
  value: T;
  options: readonly SlidingSegmentOption<T>[];
  onChange: (value: T) => void;
  compact?: boolean;
  style?: ViewStyle;
};

/**
 * Один системный переключатель для Noda. Активная плашка физически переезжает
 * между пунктами, поэтому разделы не выглядят как набор несвязанных кнопок.
 */
export function SlidingSegment<T extends string>({ value, options, onChange, compact = false, style }: Props<T>) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const progress = useRef(new Animated.Value(selectedIndex)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: selectedIndex,
      damping: 24,
      stiffness: 300,
      mass: 0.72,
      useNativeDriver: true,
    }).start();
  }, [progress, selectedIndex]);

  const inset = 3;
  const itemWidth = width > inset * 2 ? (width - inset * 2) / Math.max(1, options.length) : 0;

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[
        styles.root,
        compact ? styles.rootCompact : styles.rootRegular,
        { backgroundColor: theme.backgroundElement, borderColor: theme.separator },
        style,
      ]}>
      {itemWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            compact ? styles.indicatorCompact : styles.indicatorRegular,
            {
              width: itemWidth,
              backgroundColor: theme.backgroundSelected,
              transform: [{ translateX: Animated.multiply(progress, itemWidth) }],
            },
          ]}
        />
      )}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.button, compact ? styles.buttonCompact : styles.buttonRegular, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={{ color: selected ? theme.text : theme.textSecondary }}>
              {option.label}
            </ThemedText>
            {!!option.count && (
              <View style={[styles.count, { backgroundColor: selected ? '#4a4a4a' : theme.backgroundSelected }]}>
                <ThemedText style={[styles.countText, { color: selected ? theme.text : theme.textSecondary }]}>{option.count}</ThemedText>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    flexDirection: 'row',
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  rootRegular: { minHeight: 46, borderRadius: 13 },
  rootCompact: { minHeight: 36, borderRadius: 10 },
  indicator: { position: 'absolute', left: 3, top: 3, bottom: 3 },
  indicatorRegular: { borderRadius: 10 },
  indicatorCompact: { borderRadius: 7 },
  button: { flex: 1, zIndex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  buttonRegular: { minHeight: 40, paddingHorizontal: 12 },
  buttonCompact: { minHeight: 30, paddingHorizontal: 9 },
  pressed: { opacity: 0.66 },
  count: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 10, lineHeight: 13, fontWeight: '700' },
});
