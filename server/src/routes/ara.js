import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

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

  // Иконки проектов: компьютер кладёт PNG (ключ устройства), телефон показывает
  const iconDir = join(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'), 'project-icons');
  app.addContentTypeParser('image/png', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  const iconName = (n) => (/^[\w.-]{1,80}\.png$/.test(n) ? n : null);
  app.put('/ara/icon/:name', async (request, reply) => {
    const device = await deviceByToken(String(request.query?.token || request.headers['x-device-token'] || ''));
    const name = iconName(String(request.params.name || ''));
    if (!device || !name) return reply.code(401).send({ error: 'Нужен ключ устройства' });
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length > 200_000) return reply.code(400).send({ error: 'Нужен PNG до 200 КБ' });
    await mkdir(iconDir, { recursive: true });
    await writeFile(join(iconDir, name), body);
    return { ok: true };
  });
  app.get('/ara/icon/:name', async (request, reply) => {
    const name = iconName(String(request.params.name || ''));
    if (!name) return reply.code(404).send();
    try {
      const data = await readFile(join(iconDir, name));
      return reply.header('content-type', 'image/png').header('cache-control', 'public, max-age=3600').send(data);
    } catch {
      return reply.code(404).send();
    }
  });

  // Фото с телефона → файл на компьютере агента. Отвечает путём на компьютере.
  // query: agentKey (агент, которому пишем) или device (laptop | pc, для чата с Arra и запуска).
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
