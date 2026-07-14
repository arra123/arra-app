/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0D0D12',
    background: '#EFEFF3',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E6E7EC',
    textSecondary: '#8A8E99',
    tint: '#6F79F6',
    accent: '#6F79F6',
    success: '#5F83D6',
    danger: '#FF3B30',
    warning: '#FF9500',
    glass: 'rgba(255,255,255,0.72)',
    glassBorder: 'rgba(255,255,255,0.85)',
    separator: 'rgba(60,60,67,0.10)',
  },
  dark: {
    // Та же холодная серо-голубая система, что и в настольном приложении.
    text: '#F1F2F5',
    background: '#1C1C1F',
    backgroundElement: '#242428',
    backgroundSelected: '#303139',
    textSecondary: '#979BA6',
    tint: '#7C85FF',
    accent: '#7C85FF',
    success: '#6F9AE8',
    danger: '#EB5757',
    warning: '#F2C94C',
    glass: 'rgba(39,39,44,0.92)',
    glassBorder: 'rgba(255,255,255,0.09)',
    separator: 'rgba(255,255,255,0.08)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
  pill: 999,
} as const;

/** Палитра градиентов в стиле iOS 26 Liquid Glass */
export const Gradients = {
  aura: ['#7C5CFF', '#0A84FF', '#32D7D2'] as const,
  finance: ['#6F79F6', '#5B8DEF'] as const,
  files: ['#7C5CFF', '#FF6FD8'] as const,
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80, web: 64 }) ?? 0;
export const MaxContentWidth = 800;

/** Пользовательская версия Noda. Меняется только вместе с нативной TestFlight-сборкой. */
export const APP_BUILD = 74;
