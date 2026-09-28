import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';

import { makeAuthHook } from './auth.js';
import { config } from './config.js';
import aiRoutes from './routes/ai.js';
import araRoutes from './routes/ara.js';
import authRoutes from './routes/auth.js';
import deviceRoutes from './routes/devices.js';
import pushRoutes from './routes/push.js';
import relayRoutes from './routes/relay.js';

// В журнал не пишем ключи и JWT из query (?token=…)
const redact = (url) => String(url || '').replace(/([?&](?:token|t)=)[^&]*/g, '$1***');
const app = Fastify({
  logger: {
    serializers: {
      req: (req) => ({ method: req.method, url: redact(req.url), hostname: req.hostname, remoteAddress: req.ip }),
    },
  },
  bodyLimit: 25 * 1024 * 1024,
});

await app.register(cors, { origin: true });
await app.register(jwt, { secret: config.jwtSecret });
// Фото и видео — до 512 МБ; сохраняются стримом, память не раздувают
await app.register(multipart, { limits: { fileSize: 512 * 1024 * 1024 } });
await app.register(websocket, { options: { maxPayload: 8 * 1024 * 1024 } });

// app.auth — хук для защищённых маршрутов
app.decorate('auth', makeAuthHook(app));

app.get('/health', async () => ({ ok: true, service: 'ara', time: new Date().toISOString() }));

await app.register(authRoutes);
await app.register(pushRoutes);
await app.register(aiRoutes);
await app.register(deviceRoutes);
await app.register(relayRoutes);
await app.register(araRoutes);

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Сервер «Ары» на порту ${config.port}, схема БД: ${config.db.schema}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
