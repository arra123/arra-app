import { hub } from '../ara/instance.js';
import { keepAlive } from '../ara/keepalive.js';
import { one } from '../db.js';

/**
 * WS-канал приложения (телефон). Авторизация: JWT в query (?token=<jwt>),
 * т.к. заголовки в RN WebSocket недоступны. Сообщения ara.* уходят в хаб,
 * он отвечает ara.state / ara.transcript / ara.result / ara.ask.*.
 */
export default async function relayRoutes(app) {
  app.get('/client', { websocket: true }, async (socket, request) => {
    let userId = null;
    try {
      userId = app.jwt.verify(request.query?.token)?.id || null;
    } catch {
      /* invalid */
    }
    // a computer (its ara-link device key) sees the other computer the same
    // way the phone does: tito on the laptop away from home reads the PC here
    if (!userId && typeof request.query?.token === 'string' && request.query.token) {
      try {
        userId = (await one('SELECT user_id FROM pc_tokens WHERE token = $1', [request.query.token]))?.user_id || null;
      } catch {
        /* no such device */
      }
    }
    if (!userId) {
      try { socket.send(JSON.stringify({ type: 'error', message: 'unauthorized' })); } catch {}
      socket.close(4401, 'unauthorized');
      return;
    }

    hub.clientConnected(userId, socket);
    keepAlive(socket);

    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg?.type === 'ping') {
        try { socket.send(JSON.stringify({ type: 'pong' })); } catch {}
      }
      hub.clientMessage(userId, socket, msg);
    });

    const close = () => hub.clientDisconnected(userId, socket);
    socket.on('close', close);
    socket.on('error', close);
  });
}
