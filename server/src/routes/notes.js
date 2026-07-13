import { one, query } from '../db.js';
import { structureNote } from '../ai.js';

export default async function noteRoutes(app) {
  // Список заметок
  app.get('/notes', { preHandler: app.auth }, async (request) => {
    const { rows } = await query(
      'SELECT id, title, body, structured_body, structured_at, color, updated_at, created_at FROM notes WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 200',
      [request.user.id],
    );
    return { notes: rows };
  });

  // Создать
  app.post('/notes', { preHandler: app.auth }, async (request) => {
    const { title, body, structured_body, color } = request.body || {};
    const note = await one(
      `INSERT INTO notes (user_id, title, body, structured_body, structured_at, color)
       VALUES ($1,$2,$3,$4,CASE WHEN $4::text IS NULL THEN NULL ELSE now() END,$5)
       RETURNING id, title, body, structured_body, structured_at, color, updated_at, created_at`,
      [request.user.id, title || null, body || '', structured_body ?? null, color || null],
    );
    return { note };
  });

  // Обновить
  app.put('/notes/:id', { preHandler: app.auth }, async (request, reply) => {
    const { title, body, structured_body, color } = request.body || {};
    const hasStructured = Object.prototype.hasOwnProperty.call(request.body || {}, 'structured_body');
    const note = await one(
      `UPDATE notes SET title = $1, body = $2, color = $3,
         structured_body = CASE WHEN $4::boolean THEN $5 ELSE structured_body END,
         structured_at = CASE WHEN $4::boolean THEN CASE WHEN $5::text IS NULL THEN NULL ELSE now() END ELSE structured_at END,
         updated_at = now()
       WHERE id = $6 AND user_id = $7
       RETURNING id, title, body, structured_body, structured_at, color, updated_at, created_at`,
      [title || null, body || '', color || null, hasStructured, structured_body ?? null, request.params.id, request.user.id],
    );
    if (!note) return reply.code(404).send({ error: 'Заметка не найдена' });
    return { note };
  });

  // Создать AI-версию отдельно. Исходный body не меняется.
  app.post('/notes/structure', { preHandler: app.auth }, async (request, reply) => {
    const text = String(request.body?.text || '').trim();
    if (!text) return reply.code(400).send({ error: 'Заметка пустая' });
    if (text.length > 60000) return reply.code(400).send({ error: 'Заметка слишком большая' });
    const structuredBody = await structureNote(text);
    if (!structuredBody) return reply.code(502).send({ error: 'ИИ не вернул текст' });
    return { structuredBody };
  });

  // Удалить
  app.delete('/notes/:id', { preHandler: app.auth }, async (request) => {
    await query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [request.params.id, request.user.id]);
    return { ok: true };
  });
}
