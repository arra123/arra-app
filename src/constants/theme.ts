/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1D1D1F',
    background: '#F2F3F7',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E6F1FF',
    textSecondary: '#666A73',
    tint: '#007AFF',
    accent: '#007AFF',
    success: '#238A45',
    danger: '#D92D20',
    warning: '#C66A00',
    glass: '#FFFFFF',
    glassBorder: '#E0E2E8',
    separator: '#D7D9E0',
    disabled: '#E8E9ED',
    disabledText: '#8B8F98',
  },
  dark: {
    text: '#1D1D1F',
    background: '#F2F3F7',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E6F1FF',
    textSecondary: '#666A73',
    tint: '#007AFF',
    accent: '#007AFF',
    success: '#238A45',
    danger: '#D92D20',
    warning: '#C66A00',
    glass: '#FFFFFF',
    glassBorder: '#E0E2E8',
    separator: '#D7D9E0',
    disabled: '#E8E9ED',
    disabledText: '#8B8F98',
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
  aura: ['#2B93FF', '#007AFF', '#30B0C7'] as const,
  finance: ['#5FD97E', '#34C759'] as const,
  files: ['#C79BFF', '#AF52DE'] as const,
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

export const BottomTabInset = Platform.select({ ios: 16, android: 24 }) ?? 0;
export const MaxContentWidth = 800;

/** Номер сборки JS — показывается в углу экрана. Увеличивать при каждом выкате OTA. */
export const APP_BUILD = 99;
