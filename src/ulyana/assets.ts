// Стикеры — OpenMoji (рисованный стиль, не системные эмодзи; CC-BY-SA, тянутся с CDN GitHub).
// Грузятся на телефоне через expo-image с кэшем, поэтому от этого ПК не зависят.
const BASE = 'https://cdn.jsdelivr.net/gh/hfg-gmuend/openmoji@15.0.0/color/618x618';

/** URL стикера OpenMoji по hex-коду (напр. '1F62D'). */
export const om = (code: string) => `${BASE}/${code.toUpperCase()}.png`;

// Слёзометр
export const STK = {
  sob: om('1F62D'),          // 😭 рыдания
  cry: om('1F622'),          // 😢 слеза
  smileTear: om('1F972'),    // 🥲 со слезой
  droplet: om('1F4A7'),      // 💧 капля
  sweat: om('1F4A6'),        // 💦 брызги
  napkins: om('1F9FB'),      // 🧻 салфетки/бумага
  onion: om('1F9C5'),        // 🧅 лук
  tv: om('1F4FA'),           // 📺 сериал
  brokenHeart: om('1F494'),  // 💔
  sparkleHeart: om('1F496'), // 💖
  mendingHeart: om('2764-FE0F-200D-1FA79'), // ❤️‍🩹
  joy: om('1F602'),          // 😂 от смеха
  pleading: om('1F97A'),     // 🥺
  thermometer: om('1F321'),  // 🌡 «слёзометр»

  // Пинг-Контроль
  pingpong: om('1F3D3'),     // 🏓 ракетка+мяч
  trophy: om('1F3C6'),       // 🏆
  fire: om('1F525'),         // 🔥
  medal: om('1F947'),        // 🥇

  // Архив / общее
  chart: om('1F4CA'),        // 📊
  scroll: om('1F4DC'),       // 📜
  crystal: om('1F52E'),      // 🔮 «прогноз»
  star: om('2B50'),          // ⭐
  wave: om('1F44B'),         // 👋 выход
} as const;
