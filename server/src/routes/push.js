import { disableActivities, saveActivityToken, saveStartToken } from '../ara/live-activity.js';
import { savePushToken, sendPushToUser } from '../push.js';

export default async function pushRoutes(app) {
  // Телефон присылает свой Expo push-токен после входа
  app.post('/push/token', { preHandler: app.auth }, async (request, reply) => {
    const token = request.body?.token;
    if (!token || typeof token !== 'string') return reply.code(400).send({ error: 'Нужен token' });
    await savePushToken(request.user.id, token, request.body?.platform);
    return { ok: true };
  });

  app.delete('/push/activity', { preHandler: app.auth }, async (request) => {
    await disableActivities(request.user.id, { force: true });
    return { ok: true, disabled: true };
  });

  app.post('/push/test', { preHandler: app.auth }, async (request, reply) => {
    const result = await sendPushToUser(request.user.id, 'Arra · проверка уведомлений',
      'Уведомления включены. Здесь будут сообщения о завершении работы агентов.', { type: 'ara.test' });
    if (!result.accepted) return reply.code(503).send({ error: result.error || 'Телефон не зарегистрирован. Включи уведомления и повтори.' });
    return { ok: true, accepted: result.accepted };
  });

  // Old builds may still register tokens: immediately retire their cards.
  app.post('/push/activity', { preHandler: app.auth }, async (request, reply) => {
    const token = request.body?.token;
    if (!token || typeof token !== 'string') return reply.code(400).send({ error: 'Нужен token' });
    await saveActivityToken(request.user.id, token, request.body?.layoutVersion === 2 ? 2 : 1);
    return { ok: true, disabled: true };
  });
  app.post('/push/activity-start', { preHandler: app.auth }, async (request) => {
    await saveStartToken(request.user.id);
    return { ok: true, disabled: true };
  });
}
