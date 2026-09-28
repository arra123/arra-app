import { Platform } from 'react-native';

/**
 * Палитра «Ары»: тёмная тема как у Codex / ChatGPT на iOS.
 * Все цвета интерфейса берутся только отсюда.
 */
export const Colors = {
  background: '#0a0a0c',
  card: '#141518',
  cardRaised: '#1b1c20',
  cardPressed: '#222328',
  text: '#f2f2f5',
  textSecondary: '#8d8f99',
  textTertiary: '#5e606a',
  separator: 'rgba(255,255,255,0.08)',
  hairline: 'rgba(255,255,255,0.12)',
  userBubble: '#1f2025',
  codeBackground: '#0f1013',
  inlineCode: 'rgba(255,255,255,0.09)',
  link: '#8ab4ff',
  onAccent: '#0a0a0c',
  accent: '#f2f2f5',
  scrim: 'rgba(0,0,0,0.55)',
  glassTint: 'rgba(20,21,24,0.55)',
  glassFallback: 'rgba(22,23,27,0.88)',

  // Статусы агентов
  working: '#34d399',
  waiting: '#f5c542',
  error: '#f87171',
  old: '#6b6d76',

  // Агенты
  claude: '#d97757',
  codex: '#e6e6ea',
  ara: '#b9a4ff',

  danger: '#f87171',
  success: '#34d399',
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

/** Боковые поля экрана — как у системных приложений iPhone. */
export const ScreenPadding = 16;

/** Размеры шрифта по шкале iOS (Dynamic Type масштабирует их автоматически). */
export const Type = {
  largeTitle: 30,
  title: 20,
  headline: 17,
  body: 16,
  callout: 15,
  subhead: 14,
  footnote: 13,
  caption: 12,
  tiny: 11,
} as const;

export const Fonts = {
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
};

/** Номер сборки JS — показывается в настройках. Увеличивать при каждом выкате OTA. */
export const APP_BUILD = 200;
