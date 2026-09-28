import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
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
};

/**
 * Единые контролируемые кнопки приложения.
 *
 * Для рабочих действий не используем автоматически меняющийся Liquid Glass:
 * цвет, размер и disabled-состояние одинаковы на каждом экране.
 */
export function AppleButton({
  label,
  onPress,
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
  const minHeight = size === 'small' ? 36 : size === 'large' ? 50 : 44;

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
          minHeight,
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
      <Text
        style={[
          styles.label,
          { color: disabled ? theme.disabledText : filled ? '#FFFFFF' : accent },
        ]}>
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
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontWeight: '700', fontSize: 16 },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 16 },
});
