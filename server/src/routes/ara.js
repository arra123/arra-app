import { basename } from 'node:path';

import { TooLarge, mimeFor, sendBlob } from '../ara/blobs.js';
import { blobs, hub } from '../ara/instance.js';
import { one } from '../db.js';

async function deviceByToken(token) {
  if (!token || typeof token !== 'string') return null;
  return one('SELECT id, user_id FROM pc_tokens WHERE token = $1', [token]);
}

export default async function araRoutes(app) {
  await blobs.init();
  const sweep = setInterval(() => blobs.sweep().catch(() => {}), 3600_000);
  sweep.unref();
  app.addHook('onClose', async () => clearInterval(sweep));

  // Фото с телефона → файл на компьютере агента. Отвечает путём на компьютере.
  // query: agentKey (агент, которому пишем) или device (laptop | pc, для чата с Арой и запуска).
  app.post('/ara/upload', { preHandler: app.auth }, async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'Нужен файл' });
    let blob;
    try {
      blob = await blobs.save(request.user.id, file.file, {
        name: file.filename || 'photo.jpg',
        mime: file.mimetype || mimeFor(file.filename),
      });
    } catch (error) {
      return reply.code(error instanceof TooLarge ? 413 : 500).send({ error: error.message });
    }
    try {
      const result = await hub.deliverUpload(request.user.id, {
        agentKey: request.query?.agentKey || null,
        device: request.query?.device || null,
      }, blob);
      return { ok: true, path: result.path, name: blob.name };
    } catch (error) {
      return reply.code(502).send({ error: error.message || 'Компьютер не принял файл' });
    }
  });

  // Компьютер загружает файл, который попросил телефон (ara.file). Тело — сырые байты.
  app.register(async (scope) => {
    scope.addContentTypeParser('*', (_request, _payload, done) => done(null));
    scope.post('/ara/blob', async (request, reply) => {
      const device = await deviceByToken(request.query?.token);
      if (!device) return reply.code(401).send({ error: 'Нужен ключ устройства' });
      const wanted = hub.pendingFile(device.user_id, device.id, request.query?.reqId);
      if (!wanted) return reply.code(404).send({ error: 'Файл никто не ждёт' });
      try {
        const name = basename(wanted.path);
        const blob = await blobs.save(device.user_id, request.raw, { name, mime: mimeFor(name), source: wanted.source });
        hub.fileReady(wanted.id, blob);
        return { ok: true, id: blob.id };
      } catch (error) {
        hub.fileFailed(wanted.id, error.message || 'Не удалось передать файл');
        return reply.code(error instanceof TooLarge ? 413 : 500).send({ error: error.message });
      }
    });
  });

  // Скачать файл: телефон (JWT в заголовке Authorization) или компьютер (?token= ключ устройства).
  app.get('/ara/blob/:id', async (request, reply) => {
    let userId = null;
    if (request.query?.token) {
      userId = (await deviceByToken(request.query.token))?.user_id || null;
    } else {
      try {
        userId = (await request.jwtVerify())?.id || null;
      } catch {
        /* не авторизован */
      }
    }
    if (!userId) return reply.code(401).send({ error: 'Не авторизован' });
    const blob = blobs.get(userId, request.params.id);
    if (!blob) return reply.code(404).send({ error: 'Файл не найден' });
    return sendBlob(request, reply, blob);
  });
}
