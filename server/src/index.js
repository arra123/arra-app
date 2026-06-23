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
import relayRoutes from './routes/relay.js';
import transactionRoutes from './routes/transactions.js';

const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 });

await app.register(cors, { origin: true });
await app.register(jwt, { secret: config.jwtSecret });
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
await app.register(websocket);

// app.auth — хук для защищённых маршрутов
app.decorate('auth', makeAuthHook(app));

// Здоровье сервиса
app.get('/health', async () => ({ ok: true, service: 'aura', time: new Date().toISOString() }));

await app.register(authRoutes);
await app.register(transactionRoutes);
await app.register(debtRoutes);
await app.register(aiRoutes);
await app.register(assistantRoutes);
await app.register(fileRoutes);
await app.register(noteRoutes);
await app.register(relayRoutes);

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Aura backend на порту ${config.port}, схема БД: ${config.db.schema}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
