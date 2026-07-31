import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type AppleButtonVariant = 'prominent' | 'bordered' | 'plain' | 'glass';

type AppleButtonProps = {
  label: string;
  onPress?: () => void;
  systemImage?: SFSymbol;
  variant?: AppleButtonVariant;
  role?: 'default' | 'cancel' | 'destructive';
  tint?: string;
  full?: boolean;
  disabled?: boolean;
  size?: 'small' | 'regular' | 'large';
  style?: StyleProp<ViewStyle>;
};

type AppleIconButtonProps = {
  label: string;
  systemImage: SFSymbol;
  onPress?: () => void;
  variant?: AppleButtonVariant;
  role?: 'default' | 'cancel' | 'destructive';
  tint?: string;
  disabled?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /**
   * Кнопка внутри нативного меню (`MenuView`) должна быть только картинкой:
   * иначе Pressable забирает касание себе и меню не раскрывается.
   */
  decorative?: boolean;
};

/** Высота кнопки по размеру — одна таблица на всё приложение. */
const HEIGHTS = { small: 36, regular: 44, large: 50 } as const;

/**
 * Единые кнопки приложения.
 *
 * Раньше на iOS подставлялись нативные SwiftUI-кнопки: они меряли себя сами,
 * из-за чего соседние кнопки получались разной высоты и наезжали друг на друга,
 * а «стеклянный» вариант выцветал до серого. Здесь размер и цвет заданы явно.
 */
export function AppleButton({
  label,
  onPress,
  systemImage,
  variant = 'glass',
  role = 'default',
  tint,
  full = false,
  disabled = false,
  size = 'large',
  style,
}: AppleButtonProps) {
  const theme = useTheme();
  const accent = role === 'destructive' ? theme.danger : tint ?? theme.accent;
  const filled = variant === 'prominent';
  const hasSurface = variant === 'glass' || variant === 'bordered';
  const height = HEIGHTS[size];
  const content = disabled ? theme.disabledText : filled ? '#FFFFFF' : accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        {
          height,
          backgroundColor: disabled
            ? theme.disabled
            : filled
              ? accent
              : hasSurface
                ? theme.backgroundElement
                : 'transparent',
          borderColor: variant === 'bordered' ? accent : theme.separator,
          borderWidth: hasSurface ? StyleSheet.hairlineWidth : 0,
          opacity: pressed ? 0.68 : 1,
          alignSelf: full ? 'stretch' : 'center',
        },
        style,
      ]}>
      {systemImage && Platform.OS !== 'web' ? (
        <SymbolView name={systemImage} tintColor={content} size={size === 'small' ? 15 : 17} />
      ) : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={[styles.label, { color: content, fontSize: size === 'small' ? 15 : 16 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function AppleIconButton({
  label,
  systemImage,
  onPress,
  variant = 'glass',
  role = 'default',
  tint,
  disabled = false,
  size = 44,
  style,
  decorative = false,
}: AppleIconButtonProps) {
  const theme = useTheme();
  const accent = role === 'destructive' ? theme.danger : tint ?? theme.accent;
  const filled = variant === 'prominent';
  const surfaced = variant === 'glass' || variant === 'bordered';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      pointerEvents={decorative ? 'none' : 'auto'}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: disabled
            ? theme.disabled
            : filled
              ? accent
              : surfaced
                ? theme.backgroundElement
                : 'transparent',
          borderColor: variant === 'bordered' ? accent : theme.separator,
          borderWidth: surfaced ? StyleSheet.hairlineWidth : 0,
          opacity: pressed ? 0.65 : 1,
        },
        style,
      ]}>
      <SymbolView
        name={systemImage}
        tintColor={disabled ? theme.disabledText : filled ? '#FFFFFF' : accent}
        size={Math.round(size * 0.45)}
      />
    </Pressable>
  );
}

type AppleToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label?: string;
  systemImage?: SFSymbol;
  tint?: string;
  style?: StyleProp<ViewStyle>;
};

export function AppleToggle({ value, onValueChange, label, tint, style }: AppleToggleProps) {
  const theme = useTheme();
  return (
    <View style={[styles.toggleRow, style]}>
      {label ? <Text style={[styles.toggleLabel, { color: theme.text }]}>{label}</Text> : null}
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.disabled, true: tint ?? theme.success }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.four,
  },
  label: { fontWeight: '700' },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 16 },
});
