import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';

import { makeAuthHook } from './auth.js';
import { config } from './config.js';
import aiRoutes from './routes/ai.js';
import assistantRoutes from './routes/assistant.js';
import authRoutes from './routes/auth.js';
import debtRoutes from './routes/debts.js';
import fileRoutes from './routes/files.js';
import noteRoutes from './routes/notes.js';
import pushRoutes from './routes/push.js';
import reimbursementRoutes from './routes/reimbursements.js';
import relayRoutes from './routes/relay.js';
import transactionRoutes from './routes/transactions.js';
import ulyanaRoutes from './routes/ulyana.js';

const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 });

app.setErrorHandler((error, request, reply) => {
  // Всегда сохраняем исходную ошибку, URL и reqId в journalctl. Клиенту при
  // этом отдаём короткое объяснение вместо бесполезного Internal Server Error.
  request.log.error({ err: error }, 'request failed');
  const message = String(error?.message || '');
  const isAiUpstream = /^(AI|Whisper)\s+\d+:/i.test(message);
  if (isAiUpstream) {
    const noBalance = /\b402\b|insufficient balance/i.test(message);
    return reply.code(503).send({
      error: noBalance
        ? 'На AI-сервисе закончился баланс. Нужен другой ключ или пополнение.'
        : 'AI-сервис сейчас не отвечает. Попробуйте ещё раз чуть позже.',
      code: noBalance ? 'AI_BALANCE_EMPTY' : 'AI_UPSTREAM_ERROR',
    });
  }

  const statusCode = Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 500
    ? Number(error.statusCode)
    : 500;
  return reply.code(statusCode).send({
    error: statusCode < 500 && message ? message : 'Внутренняя ошибка сервера',
    code: statusCode < 500 ? 'REQUEST_ERROR' : 'INTERNAL_ERROR',
  });
});

await app.register(cors, { origin: true });
await app.register(jwt, { secret: config.jwtSecret });
// Файлы (в т.ч. видео с телефона) — до 1 ГБ; сохраняются стримом, память не раздувают
await app.register(multipart, { limits: { fileSize: 1024 * 1024 * 1024 } });
await app.register(websocket);

// app.auth — хук для защищённых маршрутов
app.decorate('auth', makeAuthHook(app));

// Здоровье сервиса
app.get('/health', async () => ({ ok: true, service: 'aura', time: new Date().toISOString() }));

await app.register(authRoutes);
await app.register(transactionRoutes);
await app.register(debtRoutes);
await app.register(reimbursementRoutes);
await app.register(aiRoutes);
await app.register(assistantRoutes);
await app.register(fileRoutes);
await app.register(noteRoutes);
await app.register(pushRoutes);
await app.register(relayRoutes);
await app.register(ulyanaRoutes);

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Aura backend на порту ${config.port}, схема БД: ${config.db.schema}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
