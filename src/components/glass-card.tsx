import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Радиус скругления (по умолчанию lg) */
  radius?: number;
  /** 'regular' — матовое стекло, 'clear' — более прозрачное */
  variant?: 'regular' | 'clear';
  /** Лёгкий тон поверх стекла */
  tint?: string;
  /** Реагирует на нажатия (нативное искажение iOS 26) */
  interactive?: boolean;
};

/**
 * Стеклянная карточка в стиле iOS 26 Liquid Glass.
 * На iOS 26+ используется нативный GlassView, иначе — мягкий полупрозрачный фолбэк.
 */
export function GlassCard({
  children,
  style,
  radius = Radius.lg,
  variant = 'regular',
  tint,
  interactive = false,
}: Props) {
  const theme = useTheme();

  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle={variant}
        tintColor={tint}
        isInteractive={interactive}
        style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
        {children}
      </GlassView>
    );
  }

  // Фолбэк (Android / web / iOS < 26)
  return (
    <View
      style={[
        styles.fallback,
        {
          borderRadius: radius,
          backgroundColor: theme.glass,
          borderColor: theme.glassBorder,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
