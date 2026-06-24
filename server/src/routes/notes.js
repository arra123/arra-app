import { one, query } from '../db.js';

export default async function noteRoutes(app) {
  // Список заметок
  app.get('/notes', { preHandler: app.auth }, async (request) => {
    const { rows } = await query(
      'SELECT id, title, body, color, updated_at, created_at FROM notes WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 200',
      [request.user.id],
    );
    return { notes: rows };
  });

  // Создать
  app.post('/notes', { preHandler: app.auth }, async (request) => {
    const { title, body, color } = request.body || {};
    const note = await one(
      'INSERT INTO notes (user_id, title, body, color) VALUES ($1,$2,$3,$4) RETURNING id, title, body, color, updated_at, created_at',
      [request.user.id, title || null, body || '', color || null],
    );
    return { note };
  });

  // Обновить
  app.put('/notes/:id', { preHandler: app.auth }, async (request, reply) => {
    const { title, body, color } = request.body || {};
    const note = await one(
      `UPDATE notes SET title = $1, body = $2, color = $3, updated_at = now()
       WHERE id = $4 AND user_id = $5
       RETURNING id, title, body, color, updated_at, created_at`,
      [title || null, body || '', color || null, request.params.id, request.user.id],
    );
    if (!note) return reply.code(404).send({ error: 'Заметка не найдена' });
    return { note };
  });

  // Удалить
  app.delete('/notes/:id', { preHandler: app.auth }, async (request) => {
    await query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [request.params.id, request.user.id]);
    return { ok: true };
  });
}
