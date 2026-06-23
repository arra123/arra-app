import { savePushToken } from '../push.js';

export default async function pushRoutes(app) {
  // Телефон присылает свой Expo push-токен после входа
  app.post('/push/token', { preHandler: app.auth }, async (request, reply) => {
    const token = request.body?.token;
    if (!token || typeof token !== 'string') return reply.code(400).send({ error: 'Нужен token' });
    await savePushToken(request.user.id, token, request.body?.platform);
    return { ok: true };
  });
}
