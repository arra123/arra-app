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
