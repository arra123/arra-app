import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Glass, T } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

type Option<V extends string> = { value: V; label: string; icon?: SFSymbol; disabled?: boolean };

/** Переключатель «Работа / Разговор» в стиле iOS: белая капсула переезжает пружинкой. */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  size = 'regular',
  glass = true,
  style,
}: {
  options: Option<V>[];
  value: V;
  onChange: (value: V) => void;
  size?: 'regular' | 'small';
  glass?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const pad = 3;
  const segment = width ? (width - pad * 2) / options.length : 0;
  const height = size === 'small' ? 30 : 36;

  const pill = useAnimatedStyle(() => ({
    width: segment,
    transform: [{ translateX: withSpring(index * segment, { damping: 20, stiffness: 260, mass: 0.7 }) }],
  }));

  const content = (
    <View style={[styles.row, { height, padding: pad }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {segment ? <Animated.View style={[styles.pill, { top: pad, bottom: pad, left: pad, borderRadius: height / 2 - pad }, pill]} /> : null}
      {options.map((option) => {
        const active = option.value === value;
        const color = option.disabled ? Colors.textTertiary : active ? Colors.onAccent : Colors.textSecondary;
        return (
          <Pressable
            key={option.value}
            disabled={option.disabled}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled: option.disabled }}
            onPress={() => {
              if (active) return;
              haptic.select();
              onChange(option.value);
            }}
            style={styles.segment}>
            {option.icon ? <SymbolView name={option.icon} size={size === 'small' ? 12 : 14} tintColor={color} weight="semibold" /> : null}
            <T v={size === 'small' ? 'footnote' : 'subhead'} weight="600" color={color} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {option.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );

  return glass ? (
    <Glass radius={height / 2} style={style}>{content}</Glass>
  ) : (
    <View style={[{ borderRadius: height / 2, backgroundColor: Colors.card }, style]}>{content}</View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  pill: { position: 'absolute', backgroundColor: Colors.text },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
});
