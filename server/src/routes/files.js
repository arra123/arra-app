import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { extname, join } from 'node:path';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { compactDeviceRows, normalizeDeviceRole } from '../devices.js';
import { addAgent, isAgentOnline, isClientOnline, notifyDevice, notifyUser, onlineTokenIds, relayToAgents, relayToClients, removeAgent } from '../ws.js';

export default async function fileRoutes(app) {
  await mkdir(config.uploadDir, { recursive: true });

  // Загрузка файла с телефона. targetTokenId (необязательно, в query) — на какой ПК отправить.
  app.post('/files', { preHandler: app.auth }, async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'Нужен файл' });
    let targetTokenId = request.query?.targetTokenId || null;

    // Проверяем, что устройство принадлежит пользователю
    if (targetTokenId) {
      const own = await one('SELECT id FROM pc_tokens WHERE id = $1 AND user_id = $2', [
        targetTokenId,
        request.user.id,
      ]);
      if (!own) targetTokenId = null;
    }

    const id = randomUUID();
    const safeExt = extname(file.filename || '').slice(0, 10);
    const storageName = `${id}${safeExt}`;
    const storagePath = join(config.uploadDir, storageName);
    // Пишем стримом на диск — большие видео не держим в памяти
    await pipeline(file.file, createWriteStream(storagePath));
    if (file.file.truncated) {
      await rm(storagePath, { force: true });
      return reply.code(413).send({ error: 'Файл больше 1 ГБ — не потянем' });
    }
    const size = (await stat(storagePath)).size;

    const rec = await one(
      `INSERT INTO files (id, user_id, original_name, mime, size, storage_path, status, target_token_id)
       VALUES ($1,$2,$3,$4,$5,$6,'uploaded',$7)
       RETURNING id, original_name, mime, size, status, target_token_id, created_at`,
      [id, request.user.id, file.filename || storageName, file.mimetype, size, storagePath, targetTokenId],
    );

    // Маршрутизация: на выбранный ПК (или всем, если устройство не указано)
    let delivered;
    if (targetTokenId) {
      delivered = notifyDevice(request.user.id, targetTokenId, { type: 'new_file', file: rec });
    } else {
      notifyUser(request.user.id, { type: 'new_file', file: rec });
      delivered = isAgentOnline(request.user.id);
    }

    return { file: rec, agentOnline: isAgentOnline(request.user.id), delivered };
  });

  // Список файлов
  app.get('/files', { preHandler: app.auth }, async (request) => {
    const { rows } = await query(
      `SELECT id, original_name, mime, size, status, target_token_id, delivered_at, created_at
       FROM files WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [request.user.id],
    );
    return { files: rows, agentOnline: isAgentOnline(request.user.id) };
  });

  // Скачивание файла. Доступ: JWT (приложение) ИЛИ pc-токен (агент на ПК через ?token=)
  app.get('/files/:id/download', async (request, reply) => {
    let userId = null;
    const qToken = request.query?.token;
    if (qToken) {
      const row = await one('SELECT user_id FROM pc_tokens WHERE token = $1', [qToken]);
      if (row) userId = row.user_id;
    } else {
      try {
        await request.jwtVerify();
        userId = request.user.id;
      } catch {
        /* ignore */
      }
    }
    if (!userId) return reply.code(401).send({ error: 'Не авторизован' });

    const f = await one('SELECT * FROM files WHERE id = $1 AND user_id = $2', [
      request.params.id,
      userId,
    ]);
    if (!f) return reply.code(404).send({ error: 'Файл не найден' });

    reply.header('Content-Type', f.mime || 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(f.original_name)}"`);
    return reply.send(createReadStream(f.storage_path));
  });

  // Агент помечает файл доставленным
  app.post('/files/:id/delivered', async (request, reply) => {
    const token = request.query?.token || request.body?.token;
    const row = token ? await one('SELECT user_id FROM pc_tokens WHERE token = $1', [token]) : null;
    if (!row) return reply.code(401).send({ error: 'Нужен pc-токен' });
    await query(
      `UPDATE files SET status='delivered', delivered_at=now() WHERE id=$1 AND user_id=$2`,
      [request.params.id, row.user_id],
    );
    return { ok: true };
  });

  // ---- Токены агента на ПК ----
  app.post('/pc/token', { preHandler: app.auth }, async (request) => {
    const body = request.body || {};
    const name = String(body.name || 'Мой ПК').trim().slice(0, 100) || 'Мой ПК';
    const deviceKey = String(body.deviceKey || '').trim().slice(0, 128) || null;
    const role = normalizeDeviceRole(body.role, name);
    const hostname = String(body.hostname || '').trim().slice(0, 100) || null;
    const platform = String(body.platform || '').trim().slice(0, 40) || null;
    const existingToken = String(body.existingToken || '').trim() || null;

    // Сначала ищем постоянную запись физического устройства. Если Noda уже
    // установлена, привязываем прежний токен к device_key, не создавая дубль.
    let rec = deviceKey ? await one(
      `SELECT id, token, name, role, hostname, created_at
       FROM pc_tokens WHERE user_id = $1 AND device_key = $2`,
      [request.user.id, deviceKey],
    ) : null;
    if (!rec && existingToken) rec = await one(
      `SELECT id, token, name, role, hostname, created_at
       FROM pc_tokens WHERE user_id = $1 AND token = $2`,
      [request.user.id, existingToken],
    );

    if (rec) {
      rec = await one(
        `UPDATE pc_tokens
         SET name = $3, device_key = COALESCE($4, device_key), role = $5,
             hostname = $6, platform = $7, last_seen = now()
         WHERE id = $1 AND user_id = $2
         RETURNING id, token, name, role, hostname, created_at`,
        [rec.id, request.user.id, name, deviceKey, role, hostname, platform],
      );
      // Если после переустановки приложение принесло другой старый токен,
      // постоянная запись уже выбрана по device_key — лишний токен больше не нужен.
      if (existingToken && existingToken !== rec.token) {
        await query('DELETE FROM pc_tokens WHERE user_id = $1 AND token = $2 AND id <> $3', [
          request.user.id, existingToken, rec.id,
        ]);
      }
    } else {
      const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
      rec = await one(
        `INSERT INTO pc_tokens (user_id, token, name, device_key, role, hostname, platform)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, token, name, role, hostname, created_at`,
        [request.user.id, token, name, deviceKey, role, hostname, platform],
      );
    }
    return { pcToken: rec };
  });

  app.get('/pc/tokens', { preHandler: app.auth }, async (request) => {
    const { rows } = await query(
      `SELECT id, name, role, hostname, device_key, last_seen, created_at
       FROM pc_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
      [request.user.id],
    );
    const online = onlineTokenIds(request.user.id);
    const tokens = compactDeviceRows(rows, online);
    return { tokens, online: online.length > 0, onlineIds: online };
  });

  // Удалить устройство
  app.delete('/pc/tokens/:id', { preHandler: app.auth }, async (request) => {
    await query('DELETE FROM pc_tokens WHERE id = $1 AND user_id = $2', [request.params.id, request.user.id]);
    return { ok: true };
  });

  // ---- WebSocket для агента на ПК ----
  app.get('/agent', { websocket: true }, async (socket, request) => {
    const token = request.query?.token;
    const row = token ? await one('SELECT id, user_id FROM pc_tokens WHERE token = $1', [token]) : null;
    if (!row) {
      socket.send(JSON.stringify({ type: 'error', message: 'invalid token' }));
      socket.close();
      return;
    }
    const userId = row.user_id;
    const tokenId = row.id;
    await query('UPDATE pc_tokens SET last_seen = now() WHERE token = $1', [token]);
    addAgent(userId, tokenId, socket);
    socket.send(JSON.stringify({ type: 'connected', deviceId: tokenId }));
    socket.send(JSON.stringify({ type: 'presence', phoneOnline: isClientOnline(userId) }));

    // Досылаем непринятые файлы (если ПК был офлайн в момент загрузки)
    try {
      const { rows: pending } = await query(
        `SELECT id, original_name, mime, size, status, target_token_id, created_at
         FROM files
         WHERE user_id = $1 AND status = 'uploaded' AND (target_token_id IS NULL OR target_token_id = $2)
         ORDER BY created_at ASC LIMIT 20`,
        [userId, tokenId],
      );
      for (const f of pending) socket.send(JSON.stringify({ type: 'new_file', file: f }));
    } catch {
      /* ignore */
    }

    // Сообщения ОТ ПК-агента: вывод терминала, файлы, ответы Claude → пересылаем телефону(ам)
    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg && msg.to === 'client') {
        // помечаем, с какого устройства пришло, чтобы телефон мог сопоставить
        msg.deviceId = tokenId;
        relayToClients(userId, msg);
      } else if (msg && msg.to === 'agent') {
        // Noda на ноутбуке может запустить перенос на домашнем ПК и получать
        // ход операции обратно через тот же защищённый канал.
        const targetId = msg.deviceId || null;
        const event = { ...msg, to: 'pc', sourceDeviceId: tokenId };
        delete event.deviceId;
        const delivered = relayToAgents(userId, event, targetId);
        if (!delivered) {
          notifyDevice(userId, tokenId, {
            to: 'pc', type: 'pc_offline', reqId: msg.reqId || null, targetDeviceId: targetId,
          });
        }
      }
    });

    socket.on('close', () => removeAgent(userId, tokenId, socket));
    socket.on('error', () => removeAgent(userId, tokenId, socket));
  });
}
