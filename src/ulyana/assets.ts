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
  chat: om('1F4AC'),         // 💬 чат с Ульяной
  send: om('1F680'),         // 🚀 отправить
  play: om('25B6-FE0F'),     // ▶️ воспроизведение
  pause: om('23F8-FE0F'),    // ⏸
  zoom: om('1F50D'),         // 🔍

  // Доп. причины плача
  music: om('1F3B5'),        // 🎵 песня
  angry: om('1F620'),        // 😠 обида/злость
  briefcase: om('1F4BC'),    // 💼 работа/начальник
  book: om('1F4DA'),         // 📚 учёба/дедлайн
  sleepy: om('1F634'),       // 😴 недосып
  newspaper: om('1F4F0'),    // 📰 новости
  heartEyes: om('1F60D'),    // 😍 от счастья
  paw: om('1F43E'),          // 🐾 питомец
  collision: om('1F4A5'),    // 💥 «избили» (рофл)
  hug: om('1FAC2'),          // 🫂 поддержка
  pencil: om('270F-FE0F'),   // ✏️ своё
} as const;

// Кастомные стикеры Ульяны (вырезаны из сгенерённого листа, прозрачный фон).
// Градации плача — под результат диагноза: чем выше балл, тем сильнее рыдает.
export const UL = {
  calm: require('../../assets/ulyana/ulyana_calm.png'),
  almost: require('../../assets/ulyana/ulyana_almost.png'),
  cry1: require('../../assets/ulyana/ulyana_cry1.png'),
  cry2: require('../../assets/ulyana/ulyana_cry2.png'),
  sob: require('../../assets/ulyana/ulyana_sob.png'),
  flood: require('../../assets/ulyana/ulyana_flood.png'),
} as const;
