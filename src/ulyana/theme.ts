// УльянаOS — отдельная «конфетная» вселенная. Своя палитра, не пересекается с Aura.
// Градиенты задаются строкой для experimental_backgroundImage (RN 0.85 умеет CSS-градиенты).

export const U = {
  // База
  bg: '#1B1030', //   глубокий баклажан/ночь
  bgDeep: '#120A22',
  card: 'rgba(255,255,255,0.06)',
  cardSolid: '#241640',
  border: 'rgba(255,255,255,0.12)',

  text: '#FFF4FB',
  textDim: '#B7A8D9',
  textFaint: '#7E6CA8',

  // Акценты (карамель)
  pink: '#FF6FB5',
  pinkSoft: '#FFA8D6',
  violet: '#9B5CFF',
  blue: '#5AC8FF',
  mint: '#5BE7C4',
  lemon: '#FFD86E',
  coral: '#FF8A6B',
  danger: '#FF5C7A',
  success: '#5BE7C4',
} as const;

// Градиенты (linear-gradient строки)
export const UG = {
  app: 'linear-gradient(180deg, #2A1247 0%, #160B2A 55%, #0F0820 100%)',
  candy: 'linear-gradient(135deg, #FF6FB5 0%, #9B5CFF 100%)',
  bubble: 'linear-gradient(135deg, #FFA8D6 0%, #5AC8FF 100%)',
  mint: 'linear-gradient(135deg, #5BE7C4 0%, #5AC8FF 100%)',
  sun: 'linear-gradient(135deg, #FFD86E 0%, #FF8A6B 100%)',
  pingA: 'linear-gradient(160deg, #FF6FB5 0%, #C13E8E 100%)',
  pingB: 'linear-gradient(160deg, #5AC8FF 0%, #2C7FD6 100%)',
  tearHero: 'linear-gradient(135deg, #5AC8FF 0%, #9B5CFF 60%, #FF6FB5 100%)',
} as const;

export const UR = { sm: 14, md: 20, lg: 28, xl: 38, pill: 999 } as const;
export const US = { xs: 6, sm: 10, md: 16, lg: 22, xl: 32 } as const;

// Цвет акцента под каждую вкладку
export const TAB_TINT = { tears: U.blue, ping: U.pink, archive: U.lemon } as const;
