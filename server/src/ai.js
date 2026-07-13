import { config } from './config.js';

const CATEGORIES = [
  'Продукты', 'Кафе и рестораны', 'Транспорт', 'Такси', 'Жильё', 'Связь и интернет',
  'Здоровье', 'Одежда', 'Развлечения', 'Подписки', 'Образование', 'Подарки',
  'Путешествия', 'Дом и быт', 'Дети', 'Питомцы', 'Авто', 'Зарплата', 'Перевод', 'Прочее',
];

const SYSTEM_PROMPT = `Ты — финансовый ассистент. Из сообщения пользователя на русском извлеки одну операцию
и верни СТРОГО JSON без пояснений.

Поля:
- kind: "expense" (трата), "income" (доход) или "debt" (долг между людьми).
- amount: число (рубли), без знака.
- currency: код валюты, по умолчанию "RUB".
- category: одна из [${CATEGORIES.join(', ')}] — выбери наиболее подходящую (для expense/income).
- merchant: магазин/сервис/заведение, если указан (например "Озон", "Пятёрочка", "Netflix", "Яндекс Такси", "Wildberries"), иначе null. Категорию определяй по сути товара, а merchant — где куплено.
- title: краткое название операции (например "Вода", "Такси", "Обед").
- occurred_at: дата-время в ISO 8601, если в тексте есть указание (вчера, сегодня, конкретная дата); иначе null.
- counterparty: имя человека (только для kind="debt"), иначе null.
- direction: "owes_me" (мне должны) или "i_owe" (я должен) — только для долга, иначе null.
- note: дополнительная заметка или null.

Примеры:
"потратил 50 рублей на воду" -> {"kind":"expense","amount":50,"currency":"RUB","category":"Продукты","merchant":null,"title":"Вода","occurred_at":null,"counterparty":null,"direction":null,"note":null}
"купил на озоне наушники за 3000" -> {"kind":"expense","amount":3000,"currency":"RUB","category":"Развлечения","merchant":"Озон","title":"Наушники","occurred_at":null,"counterparty":null,"direction":null,"note":null}
"продукты в пятёрочке 1200" -> {"kind":"expense","amount":1200,"currency":"RUB","category":"Продукты","merchant":"Пятёрочка","title":"Продукты","occurred_at":null,"counterparty":null,"direction":null,"note":null}
"дал Егору 500 рублей" -> {"kind":"debt","amount":500,"currency":"RUB","category":null,"merchant":null,"title":"Долг Егору","occurred_at":null,"counterparty":"Егор","direction":"owes_me","note":null}
"пришла зарплата 80000" -> {"kind":"income","amount":80000,"currency":"RUB","category":"Зарплата","merchant":null,"title":"Зарплата","occurred_at":null,"counterparty":null,"direction":null,"note":null}`;

// Текущая дата по Москве — чтобы модель корректно понимала "вчера/сегодня"
export function currentDateNote() {
  const now = new Date();
  const msk = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(now);
  return `Сейчас (часовой пояс Europe/Moscow): ${msk}. Относительные даты ("вчера", "сегодня", "в понедельник") вычисляй от этого момента и возвращай в occurred_at в ISO 8601.`;
}

async function chat(messages, model = config.ai.chatModel) {
  const res = await fetch(`${config.ai.openaiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.ai.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

/** Вызов модели с инструментами (function calling). Возвращает message целиком. */
export async function chatWithTools(messages, tools, model = config.ai.chatModel, temperature = 0.3) {
  const res = await fetch(`${config.ai.openaiBase}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.ai.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, tools, temperature }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message || { content: '' };
}

function normalize(parsed) {
  const out = {
    kind: parsed.kind === 'income' ? 'income' : parsed.kind === 'debt' ? 'debt' : 'expense',
    amount: Math.abs(Number(parsed.amount) || 0),
    currency: parsed.currency || 'RUB',
    category: parsed.category || 'Прочее',
    merchant: parsed.merchant || null,
    title: parsed.title || null,
    occurred_at: parsed.occurred_at || null,
    counterparty: parsed.counterparty || null,
    direction: parsed.direction === 'i_owe' ? 'i_owe' : parsed.direction === 'owes_me' ? 'owes_me' : null,
    note: parsed.note || null,
  };
  if (out.kind === 'debt' && !out.direction) out.direction = 'owes_me';
  return out;
}

/** Разобрать трату/доход/долг из текста */
export async function parseExpenseText(text) {
  const parsed = await chat([
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${currentDateNote()}` },
    { role: 'user', content: text },
  ]);
  return normalize(parsed);
}

/** Разобрать операцию со скриншота (например чек/уведомление Т-Банка) */
export async function parseExpenseImage(dataUrl) {
  const parsed = await chat(
    [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\n${currentDateNote()}` },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Извлеки операцию с этого скриншота (банковское уведомление/чек).' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    config.ai.visionModel,
  );
  return normalize(parsed);
}

const REIMBURSEMENT_PROMPT = `Ты разбираешь голосовые и текстовые записи для личного учёта денег.
Верни строго JSON без пояснений.

Определи kind:
- "reimbursement" — пользователь сам заплатил за рабочую/компанейскую покупку и компания должна вернуть деньги;
- "debt" — обычный долг между людьми или организациями.

Поля для reimbursement:
- amount: сумма числом;
- purpose: коротко, за что заплачено;
- merchant: магазин, сервис или заведение, если названо;
- location: адрес, город или место, если названо отдельно;
- company: кто должен компенсировать, по умолчанию "Компания";
- occurred_at: дата и время расхода ISO 8601, если можно определить;
- due_date: срок возврата YYYY-MM-DD, если назван;
- note: остальные важные подробности.

Поля для debt:
- amount, counterparty, direction ("owes_me" или "i_owe"), occurred_at, due_date, note.

Не выдумывай неизвестные данные. Если пользователь говорит просто «компенсация 500 рублей за такси»,
это reimbursement: amount=500, purpose="Такси", company="Компания".`;

/** Разобрать компенсацию компании или обычный долг в редактируемый черновик. */
export async function parseReimbursementInput({ text, image, preferredKind = 'reimbursement' }) {
  const userContent = [];
  if (text) userContent.push({ type: 'text', text });
  else userContent.push({ type: 'text', text: 'Разбери данные на изображении.' });
  if (image) userContent.push({ type: 'image_url', image_url: { url: image } });
  const parsed = await chat(
    [
      { role: 'system', content: `${REIMBURSEMENT_PROMPT}\n\n${currentDateNote()}\nПредпочтительный тип формы: ${preferredKind}.` },
      { role: 'user', content: userContent },
    ],
    image ? config.ai.visionModel : config.ai.chatModel,
  );
  const kind = parsed.kind === 'debt' ? 'debt' : 'reimbursement';
  return {
    kind,
    amount: Math.abs(Number(parsed.amount) || 0) || null,
    purpose: parsed.purpose || parsed.title || null,
    merchant: parsed.merchant || null,
    location: parsed.location || null,
    company: parsed.company || (kind === 'reimbursement' ? 'Компания' : null),
    counterparty: parsed.counterparty || null,
    direction: parsed.direction === 'i_owe' ? 'i_owe' : 'owes_me',
    occurred_at: parsed.occurred_at || null,
    due_date: parsed.due_date || null,
    note: parsed.note || null,
  };
}

/** Создать вторую структурированную версию заметки, не меняя оригинал. */
export async function structureNote(text) {
  const source = String(text || '').trim();
  if (!source) return '';
  const parsed = await chat([
    {
      role: 'system',
      content: `Ты — редактор личных заметок. Структурируй русский текст, сохранив ВСЕ факты,
формулировки, числа, имена, ссылки, решения и сомнения автора. Ничего не выдумывай и не удаляй.
Исправь только явные оговорки и повторы. Используй короткие заголовки, абзацы, списки и чек-листы,
когда это действительно делает текст понятнее. Верни строго JSON: {"structured":"полная версия текста"}.`,
    },
    { role: 'user', content: source },
  ]);
  return typeof parsed.structured === 'string' ? parsed.structured.trim() : '';
}

// ---------- УльянаOS: ИИ-подружка ----------

// Характер: саркастичная, но в душе заботливая подружка. Мемный русский, лёгкий троллинг.
const ULYANA_PERSONA = `Ты — Ульяна, ИИ-подружка внутри секретного приложения «УльянаOS».
Характер: саркастичная, дерзкая, но в глубине души заботливая лучшая подруга.
Стиль речи: живой разговорный русский, мемы, лёгкий троллинг, эмодзи в меру.
Подкалываешь, но всегда заканчиваешь поддержкой. Отвечай коротко (1–4 предложения),
будто переписываешься в мессенджере. Без занудства и морали. Обращайся на «ты».`;

// Простой текстовый ответ модели (без JSON-формата)
async function chatText(messages, model = config.ai.chatModel, temperature = 0.85) {
  const res = await fetch(`${config.ai.openaiBase}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.ai.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

/** Чат с Ульяной. history — массив [{role:'user'|'assistant', content}]. */
export async function ulyanaChat(history) {
  const safe = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-16);
  const reply = await chatText([{ role: 'system', content: ULYANA_PERSONA }, ...safe]);
  return reply || 'Чёт я зависла, повтори 😅';
}

/** ИИ-диагноз плача в характере Ульяны. Возвращает {verdict, recommendation}. */
export async function ulyanaDiagnose(input) {
  const { intensity, reason, duration, note, mood_before, mood_after, score } = input || {};
  const facts = [
    `сила плача: ${intensity ?? '?'}/10`,
    `причина: ${reason || 'не указана'}`,
    `длилось: ${duration ?? '?'} мин`,
    mood_before ? `настроение до: ${mood_before}` : null,
    mood_after ? `настроение после: ${mood_after}` : null,
    note ? `комментарий: «${note}»` : null,
    score != null ? `балл слёзометра: ${score}/100` : null,
  ].filter(Boolean).join('; ');

  const parsed = await chat([
    {
      role: 'system',
      content: `${ULYANA_PERSONA}
Сейчас ты — «Слёзометр 3000» и ставишь шуточный диагноз по данным о плаче подруги.
Верни СТРОГО JSON без пояснений, поля:
- verdict: 1–2 предложения — саркастичный, но тёплый диагноз, опирайся на данные.
- recommendation: 1 короткое предложение — что делать дальше (с юмором, но по-доброму).
Без морализаторства. Живой русский, можно эмодзи.`,
    },
    { role: 'user', content: `Данные о плаче: ${facts}. Поставь диагноз.` },
  ]);
  return {
    verdict: typeof parsed.verdict === 'string' ? parsed.verdict : null,
    recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : null,
  };
}

/** Транскрибация голоса через Whisper */
export async function transcribeAudio(buffer, filename = 'audio.m4a', mime = 'audio/m4a') {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), filename);
  form.append('model', config.ai.voiceModel);
  form.append('language', 'ru');

  const res = await fetch(`${config.ai.openaiBase}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.ai.key}` },
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Whisper ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.text || '';
}
