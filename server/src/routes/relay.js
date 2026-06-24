import { query } from '../db.js';
import { addClient, onlineTokenIds, relayToAgents, removeClient } from '../ws.js';

/**
 * WS-канал для приложения (телефон/веб): релей «телефон → ПК-агент».
 * Авторизация: JWT в query (?token=<jwt>), т.к. заголовки в RN WebSocket недоступны.
 * Сообщения с телефона: { to:'pc', deviceId?, type, ... } → пересылаются ПК-агенту.
 * Ответы ПК-агента ({ to:'client', ... }) приходят сюда через relayToClients (см. files.js).
 */
export default async function relayRoutes(app) {
  app.get('/client', { websocket: true }, async (socket, request) => {
    const token = request.query?.token;
    let userId = null;
    try {
      const payload = app.jwt.verify(token);
      userId = payload?.id || null;
    } catch {
      /* invalid */
    }
    if (!userId) {
      try { socket.send(JSON.stringify({ type: 'error', message: 'unauthorized' })); } catch {}
      socket.close();
      return;
    }

    addClient(userId, socket);

    // Сразу сообщим, какие ПК сейчас онлайн
    sendOnlineDevices(userId, socket).catch(() => {});

    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object') return;

      // Запрос списка устройств
      if (msg.type === 'list_devices') {
        sendOnlineDevices(userId, socket).catch(() => {});
        return;
      }

      // Всё остальное с пометкой to:'pc' — пересылаем агенту
      if (msg.to === 'pc') {
        const deviceId = msg.deviceId || null;
        const delivered = relayToAgents(userId, msg, deviceId);
        if (!delivered) {
          try {
            socket.send(JSON.stringify({ type: 'pc_offline', reqId: msg.reqId || null }));
          } catch {}
        }
      }
    });

    socket.on('close', () => removeClient(userId, socket));
    socket.on('error', () => removeClient(userId, socket));
  });
}

async function sendOnlineDevices(userId, socket) {
  const { rows } = await query(
    'SELECT id, name FROM pc_tokens WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  const online = onlineTokenIds(userId);
  const devices = rows.map((t) => ({ id: t.id, name: t.name, online: online.includes(t.id) }));
  try {
    socket.send(JSON.stringify({ type: 'devices', devices }));
  } catch {}
}
