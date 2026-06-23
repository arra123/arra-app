import { Platform, StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

// Вес шрифта -> начертание Inter (как у Linear)
function interFamily(weight: unknown): string {
  const w = Number(weight) || 400;
  if (w >= 800) return 'Inter_800ExtraBold';
  if (w >= 700) return 'Inter_700Bold';
  if (w >= 600) return 'Inter_600SemiBold';
  if (w >= 500) return 'Inter_500Medium';
  return 'Inter_400Regular';
}

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  const flat = (StyleSheet.flatten([
    type === 'default' && styles.default,
    type === 'title' && styles.title,
    type === 'small' && styles.small,
    type === 'smallBold' && styles.smallBold,
    type === 'subtitle' && styles.subtitle,
    type === 'link' && styles.link,
    type === 'linkPrimary' && styles.linkPrimary,
    type === 'code' && styles.code,
    style,
  ]) || {}) as TextStyle;

  const family = flat.fontFamily || interFamily(flat.fontWeight);

  return (
    <Text
      style={[{ color: theme[themeColor ?? 'text'] }, flat, { fontFamily: family, fontWeight: undefined }]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  smallBold: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  default: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  title: { fontSize: 48, fontWeight: '700', lineHeight: 52 },
  subtitle: { fontSize: 32, lineHeight: 44, fontWeight: '700' },
  link: { lineHeight: 30, fontSize: 14 },
  linkPrimary: { lineHeight: 30, fontSize: 14, color: '#3c87f7' },
  code: { fontFamily: Fonts.mono, fontWeight: Platform.select({ android: '700' }) ?? '500', fontSize: 12 },
});
