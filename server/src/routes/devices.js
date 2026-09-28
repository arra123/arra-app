import { randomUUID } from 'node:crypto';

import { hub } from '../ara/instance.js';
import { one, query } from '../db.js';
import { compactDeviceRows, normalizeDeviceRole } from '../devices.js';

export default async function deviceRoutes(app) {
  // ---- Ключи устройств (ноутбук / ПК): выдаёт экран «Подключить компьютер» ----
  app.post('/pc/token', { preHandler: app.auth }, async (request) => {
    const body = request.body || {};
    const name = String(body.name || 'Компьютер').trim().slice(0, 100) || 'Компьютер';
    const deviceKey = String(body.deviceKey || '').trim().slice(0, 128) || null;
    const role = normalizeDeviceRole(body.role, name);
    const hostname = String(body.hostname || '').trim().slice(0, 100) || null;
    const platform = String(body.platform || '').trim().slice(0, 40) || null;
    const rotate = body.rotate === true;

    // Одна постоянная запись на физическое устройство (device_key), без дублей.
    let rec = deviceKey ? await one(
      'SELECT id, token FROM pc_tokens WHERE user_id = $1 AND device_key = $2',
      [request.user.id, deviceKey],
    ) : null;

    if (rec) {
      const token = rotate ? randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '') : rec.token;
      rec = await one(
        `UPDATE pc_tokens
         SET token = $3, name = $4, role = $5, hostname = COALESCE($6, hostname), platform = COALESCE($7, platform)
         WHERE id = $1 AND user_id = $2
         RETURNING id, token, name, role, hostname, created_at`,
        [rec.id, request.user.id, token, name, role, hostname, platform],
      );
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
    const online = hub.onlineTokenIds(request.user.id);
    return { tokens: compactDeviceRows(rows, online), online: online.length > 0, onlineIds: online };
  });

  app.delete('/pc/tokens/:id', { preHandler: app.auth }, async (request) => {
    await query('DELETE FROM pc_tokens WHERE id = $1 AND user_id = $2', [request.params.id, request.user.id]);
    return { ok: true };
  });

  // ---- WebSocket компьютера (ara-link) ----
  app.get('/agent', { websocket: true }, async (socket, request) => {
    // Сообщения могут прийти, пока идёт запрос в БД — копим их.
    const early = [];
    const onEarly = (raw) => early.push(raw);
    socket.on('message', onEarly);

    const token = request.query?.token;
    const row = token ? await one('SELECT id, user_id, name, role FROM pc_tokens WHERE token = $1', [token]) : null;
    if (!row) {
      try { socket.send(JSON.stringify({ type: 'error', message: 'invalid token' })); } catch {}
      socket.close(4401, 'invalid token');
      return;
    }
    const userId = row.user_id;
    const tokenId = row.id;
    await query('UPDATE pc_tokens SET last_seen = now() WHERE id = $1', [tokenId]).catch(() => {});
    hub.deviceConnected(userId, tokenId, { name: row.name, role: row.role }, socket);

    const handle = (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg?.type === 'ping') {
        try { socket.send(JSON.stringify({ type: 'pong' })); } catch {}
        return;
      }
      hub.deviceMessage(userId, tokenId, msg).catch((error) => request.log.warn({ err: error }, 'ara device message'));
    };
    socket.off('message', onEarly);
    socket.on('message', handle);
    for (const raw of early) handle(raw);

    // last_seen раз в минуту, пока сокет жив
    const seen = setInterval(() => {
      query('UPDATE pc_tokens SET last_seen = now() WHERE id = $1', [tokenId]).catch(() => {});
    }, 60_000);
    const close = () => {
      clearInterval(seen);
      hub.deviceDisconnected(userId, tokenId, socket);
    };
    socket.on('close', close);
    socket.on('error', close);
  });
}
