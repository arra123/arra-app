// Рофельный «диагноз» Слёзометра. Считается локально из ответов теста.
import { STK } from './assets';

export type Reason =
  | 'serial' | 'onion' | 'life' | 'laugh' | 'none' | 'hormones' | 'prices' | 'love' | 'song'
  | 'breakup' | 'offended' | 'work' | 'study' | 'nosleep' | 'news' | 'happy' | 'anger'
  | 'pet' | 'beaten' | 'tima' | 'custom';

export const REASONS: { value: Reason; label: string; icon: string }[] = [
  { value: 'serial', label: 'Сериал', icon: STK.tv },
  { value: 'love', label: 'Любовь', icon: STK.sparkleHeart },
  { value: 'breakup', label: 'Расставание', icon: STK.brokenHeart },
  { value: 'tima', label: 'Тима достал', icon: STK.collision },
  { value: 'offended', label: 'Обидели', icon: STK.angry },
  { value: 'work', label: 'Работа', icon: STK.briefcase },
  { value: 'study', label: 'Учёба/дедлайн', icon: STK.book },
  { value: 'nosleep', label: 'Недосып', icon: STK.sleepy },
  { value: 'news', label: 'Новости', icon: STK.newspaper },
  { value: 'happy', label: 'От счастья', icon: STK.heartEyes },
  { value: 'anger', label: 'От злости', icon: STK.fire },
  { value: 'laugh', label: 'От смеха', icon: STK.joy },
  { value: 'song', label: 'Песня', icon: STK.music },
  { value: 'pet', label: 'Питомец', icon: STK.paw },
  { value: 'beaten', label: 'Избили 😤', icon: STK.collision },
  { value: 'hormones', label: 'Гормоны', icon: STK.pleading },
  { value: 'prices', label: 'Цены', icon: STK.sweat },
  { value: 'life', label: 'Жизнь', icon: STK.droplet },
  { value: 'none', label: 'Беспричинно', icon: STK.smileTear },
  { value: 'custom', label: 'Своё…', icon: STK.pencil },
];

export const MOODS = ['😀 норм', '😐 так себе', '😢 грустно', '🥹 на грани', '🫠 всё', '💪 легче'];

const reasonName = (r: Reason | null) => REASONS.find((x) => x.value === r)?.label ?? 'неизвестно';

// Уровни «течи» по баллу
function level(score: number): { name: string; sticker: string } {
  if (score < 15) return { name: 'Сухой глаз', sticker: STK.smileTear };
  if (score < 35) return { name: 'Лёгкая течь', sticker: STK.cry };
  if (score < 55) return { name: 'Капель', sticker: STK.droplet };
  if (score < 75) return { name: 'Прорыв плотины', sticker: STK.sweat };
  if (score < 90) return { name: 'Шторм 9 баллов', sticker: STK.sob };
  return { name: 'Севастопольский потоп', sticker: STK.sob };
}

const RECS: string[] = [
  'Срочно мороженое и плед.',
  'Выпей воды — ты только что слил годовой запас.',
  'Позвони тому, кто рассмешит.',
  'Запиши это в дневник великих рыданий.',
  'Глубокий вдох и мем — по расписанию.',
  'Награди себя: ты прошёл(ла) уровень «слёзы».',
  'Закрой сериал, открой солнце.',
  'Обнимашки 3 шт., повторять при рецидиве.',
];

const QUIPS: Partial<Record<Reason, string[]>> = {
  serial: ['Сценаристы опять победили.', 'Это они виноваты, не ты.'],
  onion: ['Чисто физика, эмоции ни при чём (точно?).', 'Лук — 0, ты — 0. Ничья.'],
  life: ['Жизнь подкинула сюжетный твист.', 'Бывает. Ты держишься молодцом.'],
  laugh: ['Лучший вид слёз — от хохота.', 'Диафрагма устала больше глаз.'],
  love: ['Сердечко работает на максималках.', 'Гормоны нежности зашкалили.'],
  song: ['Тот самый припев, да?', 'Музыка — главный диверсант.'],
  hormones: ['Биохимия рулит, ты пассажир.', 'Тело живёт своей драмой.'],
  prices: ['Ценник — главный антагонист года.', 'Кошелёк тоже плакал.'],
  none: ['Классика: слёзы без брифинга.', 'Глаза решили — глаза сделали.'],
  breakup: ['Он не стоил твоей туши.', 'Следующий будет умнее. И симпатичнее.'],
  offended: ['Кто обидел — тот ходит пешком.', 'Запомним обидчика, занесём в список.'],
  work: ['Работа не волк, но нервы ест.', 'Дедлайны переживём, ты — главное.'],
  study: ['Сессия — это временно, ты — навсегда.', 'Препод тоже когда-то плакал над зачёткой.'],
  nosleep: ['Тело требует подушку, а не слёзы.', 'Это не драма, это недосып.'],
  news: ['Выключи ленту, включи котиков.', 'Мир подождёт, отдохни от него.'],
  happy: ['Лучшие слёзы — от счастья.', 'Глаза протекли от радости, разрешаю.'],
  anger: ['Злость вышла — стало легче.', 'Лучше слёзы, чем разбитая тарелка.'],
  pet: ['Они того стоят, всегда.', 'Хвостатые умеют в драму.'],
  beaten: ['Кто посмел?! Дай адрес.', 'Синяки заживут, характер — кремень.'],
  tima: ['Опять он начудил, кудрявая голова.', 'Передай Тиме: слёзы засчитаны на его счёт.'],
  custom: ['Уникальный повод — уважаю.', 'Своя драма — самая честная.'],
};

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

export function analyze(input: {
  intensity: number; // 1..10
  reason: Reason | null;
  duration: number; // минут
}): { score: number; verdict: string; recommendation: string; levelName: string; sticker: string } {
  const { intensity, reason, duration } = input;

  // Балл 0..100: интенсивность весит больше всего, плюс длительность
  let score = intensity * 8 + Math.min(duration, 60) * 0.5;
  if (reason === 'laugh') score *= 0.7; // смех — несчитово
  if (reason === 'onion') score *= 0.5;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const lvl = level(score);
  const seed = Math.round(intensity * 13 + duration * 2);
  const quips = reason ? QUIPS[reason] : null;
  const quip = quips && quips.length ? pick(quips, seed) : 'Слёзы без объяснительной записки.';

  const verdict = `Диагноз: «${lvl.name}», ${score}/100. Причина — ${reasonName(reason).toLowerCase()}. ${quip}`;
  const recommendation = pick(RECS, seed + score);

  return { score, verdict, recommendation, levelName: lvl.name, sticker: lvl.sticker };
}
