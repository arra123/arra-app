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

/** Фолбэк нативной кнопки Apple для web/android (на iOS используется apple-button.ios.tsx). */
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
  const filled = variant === 'prominent' || variant === 'glass';
  const pad = size === 'small' ? Spacing.two : size === 'large' ? Spacing.three : Spacing.two + 2;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        {
          paddingVertical: pad,
          backgroundColor: filled ? accent : 'transparent',
          borderColor: accent,
          borderWidth: variant === 'bordered' ? StyleSheet.hairlineWidth * 2 : 0,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
          alignSelf: full ? 'stretch' : 'center',
        },
        style,
      ]}>
      <Text
        style={[
          styles.label,
          { color: filled ? '#fff' : accent },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

type AppleToggleProps = {
  value: boolean;
  onValueChange: (v: boolean) => void;
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
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: tint ?? theme.success }} />
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
  label: { fontWeight: '600', fontSize: 16 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 16 },
});
