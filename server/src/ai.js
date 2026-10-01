import { config } from './config.js';

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

/** Сколько последних реплик разговора уходит модели и какой длины реплика. */
const TALK_MAX_MESSAGES = 24;
const TALK_MAX_CHARS = 4000;
/** Длиннее вслух не читаем: ответ в разговоре — 1–3 предложения. */
export const SPEAK_MAX_CHARS = 1200;

const TALK_SYSTEM = [
  'Ты Arra — голосовой ассистент в телефоне. Идёт живой разговор голосом: твой ответ будет произнесён вслух.',
  'Отвечай по-русски, коротко и разговорно: одно-три предложения, как в беседе с хорошим знакомым.',
  'Никакой разметки, списков, ссылок, кода и эмодзи — только то, что удобно слушать.',
  'Реплики собеседника распознаны с голоса и могут содержать ошибки: догадывайся по смыслу, а если не поняла — коротко переспроси.',
  'Не знаешь ответа или нужны свежие данные, которых у тебя нет, — так и скажи.',
].join(' ');

/** Оставляет из присланного только пригодные реплики: роль, непустой текст, разумная длина. */
export function cleanTalkMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const clean = [];
  for (const m of messages) {
    const role = m?.role === 'assistant' ? 'assistant' : m?.role === 'user' ? 'user' : null;
    const content = typeof m?.content === 'string' ? m.content.trim().slice(0, TALK_MAX_CHARS) : '';
    if (role && content) clean.push({ role, content });
  }
  return clean.slice(-TALK_MAX_MESSAGES);
}

async function failure(res, what) {
  const txt = await res.text().catch(() => '');
  const error = new Error(`${what} ${res.status}: ${txt.slice(0, 300)}`);
  error.status = res.status;
  return error;
}

/** Быстрый короткий ответ для разговора голосом. */
export async function talkReply(messages, { now = new Date() } = {}) {
  const date = now.toLocaleString('ru-RU', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Moscow' });
  const res = await fetch(`${config.ai.openaiBase}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.ai.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ai.talkModel,
      messages: [{ role: 'system', content: `${TALK_SYSTEM} Сейчас ${date} по Москве.` }, ...messages],
      max_tokens: 300,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw await failure(res, 'Talk');
  const data = await res.json();
  return String(data?.choices?.[0]?.message?.content || '').trim();
}

/** Текст -> речь (mp3). */
export async function speakAudio(text) {
  const body = {
    model: config.ai.speakModel,
    voice: config.ai.speakVoice,
    input: text.slice(0, SPEAK_MAX_CHARS),
    response_format: 'mp3',
  };
  // «Как говорить» понимают только модели gpt-4o-*-tts; tts-1 на это поле ругается
  if (config.ai.speakInstructions && /^gpt-/.test(config.ai.speakModel)) body.instructions = config.ai.speakInstructions;
  const res = await fetch(`${config.ai.openaiBase}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.ai.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw await failure(res, 'Speech');
  return Buffer.from(await res.arrayBuffer());
}
