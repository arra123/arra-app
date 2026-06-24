import { parseExpenseImage, parseExpenseText, transcribeAudio } from '../ai.js';
import { one } from '../db.js';

// Сохранить разобранную операцию в нужную таблицу
async function persist(userId, parsed, source, rawInput) {
  if (parsed.kind === 'debt') {
    const debt = await one(
      `INSERT INTO debts (user_id, counterparty, amount, currency, direction, note)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, counterparty, amount, currency, direction, note, settled, created_at`,
      [userId, parsed.counterparty || 'Без имени', parsed.amount, parsed.currency, parsed.direction, parsed.note],
    );
    return { type: 'debt', debt };
  }
  const tx = await one(
    `INSERT INTO transactions (user_id, type, amount, currency, category, merchant, title, note, occurred_at, source, raw_input)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, now()),$10,$11)
     RETURNING id, type, amount, currency, category, merchant, title, note, occurred_at, source`,
    [
      userId, parsed.kind, parsed.amount, parsed.currency, parsed.category, parsed.merchant,
      parsed.title, parsed.note, parsed.occurred_at, source, rawInput,
    ],
  );
  return { type: 'transaction', transaction: tx };
}

export default async function aiRoutes(app) {
  // Текст -> разбор -> (опц.) сохранение
  app.post('/ai/text', { preHandler: app.auth }, async (request, reply) => {
    const text = request.body?.text;
    if (!text) return reply.code(400).send({ error: 'Нужен text' });
    const parsed = await parseExpenseText(text);
    const save = request.body?.save !== false;
    const saved = save ? await persist(request.user.id, parsed, 'text', text) : null;
    return { parsed, saved };
  });

  // Скриншот (data URL base64) -> разбор -> (опц.) сохранение
  app.post('/ai/image', { preHandler: app.auth }, async (request, reply) => {
    const image = request.body?.image;
    if (!image) return reply.code(400).send({ error: 'Нужен image (data URL)' });
    const parsed = await parseExpenseImage(image);
    const save = request.body?.save !== false;
    const saved = save ? await persist(request.user.id, parsed, 'screenshot', null) : null;
    return { parsed, saved };
  });

  // Голос -> чистый текст (для диктовки в заметках, без разбора трат)
  app.post('/ai/transcribe', { preHandler: app.auth }, async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'Нужен аудиофайл' });
    const buffer = await file.toBuffer();
    const text = await transcribeAudio(buffer, file.filename || 'audio.m4a', file.mimetype);
    return { text: text || '' };
  });

  // Голос (multipart audio) -> транскрипция -> разбор -> (опц.) сохранение
  app.post('/ai/voice', { preHandler: app.auth }, async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'Нужен аудиофайл' });
    const buffer = await file.toBuffer();
    const text = await transcribeAudio(buffer, file.filename || 'audio.m4a', file.mimetype);
    if (!text.trim()) return { text, parsed: null, saved: null };
    const parsed = await parseExpenseText(text);
    const saved = await persist(request.user.id, parsed, 'voice', text);
    return { text, parsed, saved };
  });
}
