import { saveActivityToken, saveStartToken } from '../ara/live-activity.js';
import { savePushToken } from '../push.js';

export default async function pushRoutes(app) {
  // Телефон присылает свой Expo push-токен после входа
  app.post('/push/token', { preHandler: app.auth }, async (request, reply) => {
    const token = request.body?.token;
    if (!token || typeof token !== 'string') return reply.code(400).send({ error: 'Нужен token' });
    await savePushToken(request.user.id, token, request.body?.platform);
    return { ok: true };
  });

  // The phone's Live Activity («Кольца») push token: the server moves the rings
  app.post('/push/activity', { preHandler: app.auth }, async (request, reply) => {
    const token = request.body?.token;
    if (!token || typeof token !== 'string') return reply.code(400).send({ error: 'Нужен token' });
    await saveActivityToken(request.user.id, token);
    return { ok: true };
  });

  // The token that lets the server START the block while the app is closed
  app.post('/push/activity-start', { preHandler: app.auth }, async (request, reply) => {
    const token = request.body?.token;
    if (!token || typeof token !== 'string') return reply.code(400).send({ error: 'Нужен token' });
    await saveStartToken(request.user.id, token);
    return { ok: true };
  });
}
