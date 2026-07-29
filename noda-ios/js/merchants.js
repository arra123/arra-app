// Логотипы брендов и иконки категорий: по тексту записи подбираем узнаваемую картинку.
// Файлы лежат в assets/merchants (скачаны один раз, работают офлайн и мгновенно).

const BRANDS = [
  // каршеринг
  ["belkacar", ["белка", "белкакар", "belka", "belkacar"], "Каршеринг"],
  ["citydrive", ["ситидрайв", "сити драйв", "citydrive", "city drive"], "Каршеринг"],
  ["delimobil", ["делимобиль", "делимобил", "дели", "delimobil"], "Каршеринг"],
  ["yandexdrive", ["яндекс драйв", "яндекс.драйв", "драйв"], "Каршеринг"],
  ["citymobil", ["ситимобил"], "Такси"],
  ["yandextaxi", ["яндекс такси", "такси"], "Такси"],
  // еда и доставка
  ["yandexeda", ["яндекс еда", "яндекс.еда"], "Доставка"],
  ["yandexlavka", ["лавка", "яндекс лавка"], "Доставка"],
  ["samokat", ["самокат"], "Доставка"],
  ["deliveryclub", ["деливери", "delivery"], "Доставка"],
  ["dodo", ["додо", "dodo"], "Кафе"],
  ["kfc", ["kfc", "кфс"], "Кафе"],
  ["burgerking", ["бургер кинг", "burger king"], "Кафе"],
  ["vkusnotochka", ["вкусно и точка", "вкусно"], "Кафе"],
  ["starbucks", ["starbucks", "старбакс"], "Кафе"],
  // продукты
  ["vkusvill", ["вкусвилл"], "Продукты"],
  ["pyaterochka", ["пятёрочка", "пятерочка", "5ka"], "Продукты"],
  ["magnit", ["магнит"], "Продукты"],
  ["perekrestok", ["перекрёсток", "перекресток"], "Продукты"],
  ["lenta", ["лента"], "Продукты"],
  ["auchan", ["ашан"], "Продукты"],
  ["metro", ["метро кэш", "metro"], "Продукты"],
  ["okey", ["окей"], "Продукты"],
  ["globus", ["глобус"], "Продукты"],
  // маркетплейсы и техника
  ["ozon", ["озон", "ozon"], "Маркетплейс"],
  ["wildberries", ["вайлдберриз", "вайлдбериз", "wildberries", "вб"], "Маркетплейс"],
  ["aliexpress", ["алиэкспресс", "али", "aliexpress"], "Маркетплейс"],
  ["yandexmarket", ["яндекс маркет", "маркет"], "Маркетплейс"],
  ["avito", ["авито", "avito"], "Маркетплейс"],
  ["dns", ["днс", "dns"], "Техника"],
  ["mvideo", ["мвидео", "м.видео"], "Техника"],
  ["citilink", ["ситилинк", "citilink"], "Техника"],
  ["eldorado", ["эльдорадо"], "Техника"],
  ["lamoda", ["ламода", "lamoda"], "Одежда"],
  // банки
  ["sber", ["сбер", "сбербанк"], "Банк"],
  ["tbank", ["тинькофф", "т-банк", "тбанк", "tbank"], "Банк"],
  ["alfa", ["альфа", "альфабанк"], "Банк"],
  ["vtb", ["втб"], "Банк"],
  ["gazprombank", ["газпромбанк"], "Банк"],
  ["raiffeisen", ["райф", "райффайзен"], "Банк"],
  ["ozonbank", ["озон банк"], "Банк"],
  // связь
  ["mts", ["мтс", "mts"], "Связь"],
  ["beeline", ["билайн", "beeline"], "Связь"],
  ["megafon", ["мегафон", "megafon"], "Связь"],
  ["tele2", ["теле2", "tele2", "т2"], "Связь"],
  ["yota", ["йота", "yota"], "Связь"],
  // подписки и IT
  ["openai", ["openai", "chatgpt", "chat gpt", "гпт", "опенаи"], "ИИ и сервисы"],
  ["anthropic", ["anthropic", "claude", "клод"], "ИИ и сервисы"],
  ["proxyapi", ["proxyapi", "прокси апи"], "ИИ и сервисы"],
  ["google", ["google", "гугл"], "Подписки"],
  ["apple", ["apple", "icloud", "эпл", "айклауд"], "Подписки"],
  ["microsoft", ["microsoft", "майкрософт", "office"], "Подписки"],
  ["github", ["github", "гитхаб"], "ИИ и сервисы"],
  ["notion", ["notion", "ноушен", "ноушн"], "Подписки"],
  ["figma", ["figma", "фигма"], "Подписки"],
  ["adobe", ["adobe", "адоб"], "Подписки"],
  ["jetbrains", ["jetbrains", "джетбрейнс"], "Подписки"],
  ["spotify", ["spotify", "спотифай"], "Подписки"],
  ["youtube", ["youtube", "ютуб"], "Подписки"],
  ["netflix", ["netflix", "нетфликс"], "Подписки"],
  ["kinopoisk", ["кинопоиск"], "Подписки"],
  ["okko", ["okko", "окко"], "Подписки"],
  ["ivi", ["иви", "ivi"], "Подписки"],
  ["litres", ["литрес", "litres"], "Подписки"],
  ["steam", ["steam", "стим"], "Игры"],
  ["telegram", ["telegram", "телеграм", "тг"], "Подписки"],
  ["vk", ["вконтакте", "вк ", "vk"], "Подписки"],
  ["cloudflare", ["cloudflare"], "Хостинг"],
  ["timeweb", ["timeweb", "таймвеб"], "Хостинг"],
  ["regru", ["reg.ru", "регру", "домен"], "Хостинг"],
  // топливо и транспорт
  ["gazpromneft", ["газпромнефть", "газпром нефть"], "Топливо"],
  ["tatneft", ["татнефть"], "Топливо"],
  ["aeroflot", ["аэрофлот"], "Поездки"],
  ["pobeda", ["победа"], "Поездки"],
  ["s7", ["s7", "эс севен"], "Поездки"],
  ["tutu", ["туту", "tutu"], "Поездки"],
  // здоровье и спорт
  ["apteka", ["аптека"], "Здоровье"],
  ["eapteka", ["еаптека"], "Здоровье"],
  ["zdravcity", ["здравсити"], "Здоровье"],
  ["invitro", ["инвитро"], "Здоровье"],
  ["gemotest", ["гемотест"], "Здоровье"],
  ["sportmaster", ["спортмастер"], "Спорт"],
  ["decathlon", ["декатлон"], "Спорт"],
  // дом
  ["ikea", ["икеа", "ikea"], "Дом"],
  ["leroymerlin", ["леруа", "leroy"], "Дом"],
  ["obi", ["оби ", "obi"], "Дом"],
  ["hoff", ["хофф", "hoff"], "Дом"],
  ["vseinstrumenti", ["всеинструменты"], "Дом"],
];

// Категории для записей без узнаваемого бренда: цвет + глиф.
// Порядок важен: более узкие правила стоят выше общих.
const CATEGORY_ICONS = [
  [/каршер|аренда авто|прокат авто/i, "Каршеринг", "#5B8DEF", '<path d="M4 16h16M6 16V9l2-4h8l2 4v7"/><circle cx="8" cy="16.5" r="1.6"/><circle cx="16" cy="16.5" r="1.6"/>'],
  [/такси/i, "Такси", "#E0B33E", '<path d="M3 14l2-6h14l2 6v4h-3v-1H6v1H3z"/><path d="M9 8V5h6v3"/>'],
  [/бензин|топлив|азс|заправ/i, "Топливо", "#E06C75", '<path d="M4 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M3 20h11M13 9h3l2 2v7a2 2 0 0 1-4 0"/>'],
  [/парков|платн.* дорог/i, "Парковка", "#7C8AA0", '<path d="M6 4h12v16H6z"/><path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3"/>'],
  // добавки и витамины — капсула, а не коробка курьера
  [/бад|витамин|добавк|коллаген|омега/i, "Добавки", "#4CB7A5", '<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M12 8v8"/><circle cx="7.5" cy="12" r="1"/>'],
  [/аптек|лекарств|таблет|врач|анализ/i, "Здоровье", "#4CB7A5", '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>'],
  // ингредиенты для напитков — бутылка сиропа и стакан
  [/ингредиент|сироп|бариста|напит/i, "Ингредиенты", "#C98AB8", '<path d="M10 3h4v3l2 4v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10l2-4z"/><path d="M8 13h8"/>'],
  [/печат|фотограф|полиграф|типограф/i, "Печать", "#5E5CE6", '<path d="M7 8V4h10v4"/><rect x="4" y="8" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>'],
  [/курьер|достав|отправ|посылк/i, "Доставка", "#E0A33E", '<path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="1.8"/><circle cx="18" cy="19" r="1.8"/>'],
  [/продукт|магазин|супермаркет/i, "Продукты", "#4CB782", '<path d="M4 8h16l-1.5 11h-13z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'],
  [/кафе|ресторан|обед|ужин|завтрак|кофе/i, "Еда", "#E08A3E", '<path d="M4 3v7a3 3 0 0 0 6 0V3M7 10v11M16 3c-1.6 0-3 2.2-3 5s1.4 4 3 4 3-1.2 3-4-1.4-5-3-5zM16 12v9"/>'],
  [/подписк|тариф|облак|хостинг|домен|сервер/i, "Сервисы", "#6E79E6", '<path d="M4 7h16v10H4z"/><path d="M8 21h8M12 17v4"/>'],
  [/зон|карт|локац|адрес|баланс/i, "Локации", "#5FB8CF", '<path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>'],
  [/реклам|таргет|продвиж/i, "Реклама", "#E06C75", '<path d="M4 9v6h4l6 4V5L8 9z"/><path d="M18 8a6 6 0 0 1 0 8"/>'],
  [/подар|цвет/i, "Подарки", "#C98AB8", '<path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13"/><path d="M12 7C9 7 7 3 9.5 3S12 7 12 7zM12 7c3 0 5-4 2.5-4S12 7 12 7z"/>'],
  [/связь|интернет|мобильн/i, "Связь", "#5B8DEF", '<path d="M5 13a10 10 0 0 1 14 0M8 16a6 6 0 0 1 8 0"/><circle cx="12" cy="19" r="1.4"/>'],
  [/одежд|обув/i, "Одежда", "#9A7BE0", '<path d="M8 4l4 3 4-3 4 4-3 3v9H7v-9L4 8z"/>'],
  [/техник|ноутбук|телефон|компьютер/i, "Техника", "#7C8AA0", '<path d="M5 5h14v10H5zM2 19h20"/>'],
];

const PALETTE = ["#6E79E6", "#4CB782", "#4CB7A5", "#E0A33E", "#E06C75", "#9A7BE0", "#5B8DEF", "#5FB8CF", "#C98AB8", "#8A8F98"];

const brandIndex = [];
for (const [file, aliases, category] of BRANDS) {
  brandIndex.push({ file, category, keys: [file, ...aliases].map((k) => k.toLowerCase()) });
}

function colorFor(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/** Все бренды, упомянутые в тексте (в записи может быть сразу несколько каршерингов). */
const iconFile = (name) => (name.includes(".") ? name : `${name}.png`);

export function findBrands(text) {
  const value = ` ${String(text || "").toLowerCase()} `;
  const found = [];
  for (const brand of brandIndex) {
    const hit = brand.keys.find((key) => value.includes(key));
    if (hit) found.push({ ...brand, key: hit });
  }
  return found.sort((a, b) => b.key.length - a.key.length);
}

/** Находим бренд по любому куску текста записи. */
export function findBrand(text) {
  return findBrands(text)[0] || null;
}

/** Категория по смыслу (когда бренда нет). */
export function findCategory(text) {
  const value = String(text || "");
  for (const [pattern, name, color, glyph] of CATEGORY_ICONS) {
    if (pattern.test(value)) return { name, color, glyph };
  }
  return null;
}

/**
 * Иконка записи: логотип бренда → глиф категории → буква в цветном тайле.
 * size — сторона в px.
 */
export function entryIcon(text, size = 40) {
  const source = String(text || "").trim();
  const brands = findBrands(source);
  if (brands.length > 1) {
    // в записи несколько брендов (например три каршеринга) — показываем стопкой
    return `<span class="ic ic-stack" style="--ic:${size}px">${brands.slice(0, 3)
      .map((brand) => `<img src="assets/merchants/${iconFile(brand.file)}" alt="" loading="lazy" decoding="async">`).join("")}</span>`;
  }
  const brand = brands[0];
  if (brand) {
    return `<span class="ic ic-brand" style="--ic:${size}px"><img src="assets/merchants/${iconFile(brand.file)}" alt="" loading="lazy" decoding="async"></span>`;
  }
  const category = findCategory(source);
  if (category) {
    return `<span class="ic ic-glyph" style="--ic:${size}px;--tint:${category.color}"><svg viewBox="0 0 24 24">${category.glyph}</svg></span>`;
  }
  const letter = (source[0] || "?").toUpperCase();
  return `<span class="ic ic-letter" style="--ic:${size}px;--tint:${colorFor(source || "?")}">${letter}</span>`;
}

/** Человеческое название категории — показываем второй строкой. */
export function entryCategory(text) {
  const brand = findBrand(text);
  if (brand) return brand.category;
  const category = findCategory(text);
  return category ? category.name : "";
}

/** Подсказки для формы: список известных брендов с иконками. */
export function brandSuggestions(query, limit = 8) {
  const value = String(query || "").trim().toLowerCase();
  if (!value) return [];
  const found = [];
  for (const brand of brandIndex) {
    const hit = brand.keys.find((key) => key.startsWith(value)) || brand.keys.find((key) => key.includes(value));
    if (hit) found.push({ file: brand.file, category: brand.category, label: titleCase(brand.keys[1] || brand.file) });
    if (found.length >= limit) break;
  }
  return found;
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
