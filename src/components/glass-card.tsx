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
 * Светлая карточка в стиле Noda.
 *
 * Контентные поверхности намеренно не используют системный Liquid Glass:
 * iOS может заменить его непрозрачным тёмным материалом при настройках
 * доступности, из-за чего светлая тема теряет контраст.
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
  void interactive;

  return (
    <View
      style={[
        styles.surface,
        {
          borderRadius: radius,
          backgroundColor:
            tint ??
            (variant === 'clear' ? 'rgba(255,255,255,0.78)' : theme.glass),
          borderColor: theme.glassBorder,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#243247',
    shadowOpacity: 0.055,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
});
