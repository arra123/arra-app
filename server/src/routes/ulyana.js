import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { ulyanaChat, ulyanaDiagnose } from '../ai.js';
import { config } from '../config.js';
import { one, query } from '../db.js';

// УльянаOS: Слёзометр (cry_logs) + Пинг-Контроль (pingpong_matches).
export default async function ulyanaRoutes(app) {
  await mkdir(config.uploadDir, { recursive: true });

  // ---------- Слёзометр ----------

  // Создать запись о плаче (JSON). Медиа прикрепляется отдельным запросом.
  app.post('/cry', { preHandler: app.auth }, async (request) => {
    const b = request.body || {};
    const clampInt = (v, lo, hi, def) => {
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
    };
    const rec = await one(
      `INSERT INTO cry_logs
        (user_id, intensity, reason, duration_min, napkins, mood_before, mood_after, score, verdict, recommendation, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        request.user.id,
        clampInt(b.intensity, 1, 10, 5),
        b.reason || null,
        Number.isFinite(Number(b.duration_min)) ? Number(b.duration_min) : 0,
        clampInt(b.napkins, 0, 999, 0),
        b.mood_before || null,
        b.mood_after || null,
        clampInt(b.score, 0, 100, 0),
        b.verdict || null,
        b.recommendation || null,
        b.note || null,
      ],
    );
    return { cry: rec };
  });

  // Прикрепить медиа (фото/видео/аудио) к записи
  app.post('/cry/:id/media', { preHandler: app.auth }, async (request, reply) => {
    const owns = await one('SELECT id FROM cry_logs WHERE id = $1 AND user_id = $2', [
      request.params.id,
      request.user.id,
    ]);
    if (!owns) return reply.code(404).send({ error: 'Запись не найдена' });

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'Нужен файл' });
    const buffer = await file.toBuffer();

    const safeExt = extname(file.filename || '').slice(0, 10);
    const storageName = `cry_${request.params.id}${safeExt}`;
    const storagePath = join(config.uploadDir, storageName);
    await writeFile(storagePath, buffer);

    const mime = file.mimetype || 'application/octet-stream';
    const kind = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file';

    const rec = await one(
      `UPDATE cry_logs SET media_path = $1, media_mime = $2, media_kind = $3
       WHERE id = $4 AND user_id = $5 RETURNING *`,
      [storagePath, mime, kind, request.params.id, request.user.id],
    );
    return { cry: rec };
  });

  // Отдать медиа записи
  app.get('/cry/:id/media', async (request, reply) => {
    let userId = null;
    try {
      await request.jwtVerify();
      userId = request.user.id;
    } catch {
      return reply.code(401).send({ error: 'Не авторизован' });
    }
    const f = await one('SELECT media_path, media_mime FROM cry_logs WHERE id = $1 AND user_id = $2', [
      request.params.id,
      userId,
    ]);
    if (!f || !f.media_path) return reply.code(404).send({ error: 'Медиа нет' });
    reply.header('Content-Type', f.media_mime || 'application/octet-stream');
    return reply.send(createReadStream(f.media_path));
  });

  // Список записей
  app.get('/cry', { preHandler: app.auth }, async (request) => {
    const { rows } = await query(
      `SELECT id, intensity, reason, duration_min, napkins, mood_before, mood_after,
              score, verdict, recommendation, note, media_kind, media_mime,
              (media_path IS NOT NULL) AS has_media, created_at
       FROM cry_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 300`,
      [request.user.id],
    );
    return { cries: rows };
  });

  // Удалить запись
  app.delete('/cry/:id', { preHandler: app.auth }, async (request) => {
    await query('DELETE FROM cry_logs WHERE id = $1 AND user_id = $2', [request.params.id, request.user.id]);
    return { ok: true };
  });

  // Пожизненная (рофельная) статистика плача
  app.get('/cry/stats', { preHandler: app.auth }, async (request) => {
    const s = await one(
      `SELECT
         COUNT(*)::int                         AS total,
         COALESCE(AVG(intensity),0)::numeric(4,1) AS avg_intensity,
         COALESCE(SUM(duration_min),0)::numeric  AS total_minutes,
         COALESCE(SUM(napkins),0)::int           AS total_napkins,
         COALESCE(MAX(intensity),0)::int         AS max_intensity,
         COALESCE(SUM(intensity),0)::int         AS intensity_sum
       FROM cry_logs WHERE user_id = $1`,
      [request.user.id],
    );
    // Топ причина
    const top = await one(
      `SELECT reason, COUNT(*)::int AS n FROM cry_logs
       WHERE user_id = $1 AND reason IS NOT NULL
       GROUP BY reason ORDER BY n DESC LIMIT 1`,
      [request.user.id],
    );
    // «Литры слёз» — шуточная оценка: 8 мл на единицу интенсивности
    const liters = Math.round(((s?.intensity_sum || 0) * 8) / 1000 * 100) / 100;
    return { stats: { ...s, liters, top_reason: top?.reason || null, top_reason_n: top?.n || 0 } };
  });

  // ---------- ИИ-Ульяна ----------

  // Шуточный ИИ-диагноз по данным о плаче (в характере Ульяны)
  app.post('/ulyana/diagnose', { preHandler: app.auth }, async (request, reply) => {
    try {
      const out = await ulyanaDiagnose(request.body || {});
      return out;
    } catch (e) {
      return reply.code(502).send({ error: 'ИИ недоступен', detail: String(e?.message || e) });
    }
  });

  // Чат с Ульяной. Тело: { messages: [{role,content}] }
  app.post('/ulyana/chat', { preHandler: app.auth }, async (request, reply) => {
    try {
      const replyText = await ulyanaChat(request.body?.messages || []);
      return { reply: replyText };
    } catch (e) {
      return reply.code(502).send({ error: 'ИИ недоступен', detail: String(e?.message || e) });
    }
  });

  // ---------- Пинг-Контроль ----------

  app.post('/pingpong', { preHandler: app.auth }, async (request) => {
    const b = request.body || {};
    const rec = await one(
      `INSERT INTO pingpong_matches
        (user_id, player_a, player_b, sets_a, sets_b, sets, winner, best_of)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        request.user.id,
        b.player_a || 'Игрок A',
        b.player_b || 'Игрок B',
        Number.parseInt(b.sets_a, 10) || 0,
        Number.parseInt(b.sets_b, 10) || 0,
        JSON.stringify(Array.isArray(b.sets) ? b.sets : []),
        b.winner === 'a' || b.winner === 'b' ? b.winner : null,
        Number.parseInt(b.best_of, 10) || 5,
      ],
    );
    return { match: rec };
  });

  app.get('/pingpong', { preHandler: app.auth }, async (request) => {
    const { rows } = await query(
      `SELECT id, player_a, player_b, sets_a, sets_b, sets, winner, best_of, created_at
       FROM pingpong_matches WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [request.user.id],
    );
    return { matches: rows };
  });

  app.delete('/pingpong/:id', { preHandler: app.auth }, async (request) => {
    await query('DELETE FROM pingpong_matches WHERE id = $1 AND user_id = $2', [
      request.params.id,
      request.user.id,
    ]);
    return { ok: true };
  });
}
