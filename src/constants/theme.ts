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
    tint: '#3E8EF7',
    accent: '#4F7DF0',
    success: '#34C759',
    danger: '#FF3B30',
    warning: '#FF9500',
    glass: 'rgba(255,255,255,0.72)',
    glassBorder: 'rgba(255,255,255,0.85)',
    separator: 'rgba(60,60,67,0.10)',
  },
  dark: {
    // Графит Linear, но мягче: тёмно-серый фон вместо чёрного, чуть больше воздуха
    text: '#F4F5F7',
    background: '#121317',
    backgroundElement: 'rgba(255,255,255,0.07)',
    backgroundSelected: 'rgba(255,255,255,0.12)',
    textSecondary: '#9AA0AA',
    tint: '#6E79E6',
    accent: '#6E79E6',
    success: '#4CB782',
    danger: '#EB5757',
    warning: '#F2C94C',
    glass: 'rgba(255,255,255,0.07)',
    glassBorder: 'rgba(255,255,255,0.10)',
    separator: 'rgba(255,255,255,0.09)',
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
  finance: ['#0A84FF', '#34C759'] as const,
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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

/** Номер сборки JS — показывается в углу экрана. Увеличивать при каждом выкате OTA. */
export const APP_BUILD = 61;
