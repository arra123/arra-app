// Временное хранилище файлов «Arra»: картинки/видео из переписки агентов
// (компьютер → телефон) и фото с телефона (телефон → компьютер).
// Файлы живут на диске сервера сутки, индекс — в памяти.
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.heic': 'image/heic', '.mp4': 'video/mp4', '.m4v': 'video/mp4',
  '.mov': 'video/quicktime', '.webm': 'video/webm', '.pdf': 'application/pdf',
};

export function mimeFor(name, fallback = 'application/octet-stream') {
  return MIME[extname(String(name || '')).toLowerCase()] || fallback;
}

export class TooLarge extends Error {}

export function createBlobStore({ dir, maxBytes = 512 * 1024 * 1024, ttlMs = 24 * 3600 * 1000, now = Date.now } = {}) {
  const index = new Map(); // id -> { id, userId, name, mime, size, path, createdAt, source }
  const bySource = new Map(); // `${userId}\n${source}` -> id (кеш файлов с компьютера)

  async function init() {
    await mkdir(dir, { recursive: true });
    // Индекс в памяти пропал после рестарта — старые файлы больше не нужны.
    for (const name of await readdir(dir).catch(() => [])) await rm(join(dir, name), { force: true });
  }

  async function save(userId, stream, { name, mime, source } = {}) {
    const id = randomUUID();
    const clean = basename(String(name || 'file')).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120) || 'file';
    const path = join(dir, `${id}${extname(clean).slice(0, 10)}`);
    let size = 0;
    const limiter = new Transform({
      transform(chunk, _enc, done) {
        size += chunk.length;
        if (size > maxBytes) done(new TooLarge(`Файл больше ${Math.round(maxBytes / 1048576)} МБ`));
        else done(null, chunk);
      },
    });
    try {
      await pipeline(stream, limiter, createWriteStream(path));
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
    const blob = { id, userId, name: clean, mime: mime || mimeFor(clean), size, path, createdAt: now(), source: source || null };
    index.set(id, blob);
    if (source) bySource.set(`${userId}\n${source}`, id);
    return blob;
  }

  function get(userId, id) {
    const blob = index.get(id);
    return blob && blob.userId === userId ? blob : null;
  }

  /** Уже скачанный с компьютера файл (по пути), если он ещё свежий. */
  function bySourcePath(userId, source, maxAgeMs = 10 * 60 * 1000) {
    const id = bySource.get(`${userId}\n${source}`);
    const blob = id ? index.get(id) : null;
    return blob && now() - blob.createdAt < maxAgeMs ? blob : null;
  }

  async function sweep() {
    const cutoff = now() - ttlMs;
    for (const blob of [...index.values()]) {
      if (blob.createdAt >= cutoff) continue;
      index.delete(blob.id);
      if (blob.source && bySource.get(`${blob.userId}\n${blob.source}`) === blob.id) bySource.delete(`${blob.userId}\n${blob.source}`);
      await rm(blob.path, { force: true });
    }
  }

  return { init, save, get, bySourcePath, sweep };
}

/** Отдать файл с поддержкой Range — без неё AVPlayer на iPhone не играет mp4. */
export async function sendBlob(request, reply, blob) {
  const { size } = await stat(blob.path);
  reply.header('Content-Type', blob.mime);
  reply.header('Accept-Ranges', 'bytes');
  reply.header('Cache-Control', 'private, max-age=86400');
  reply.header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(blob.name)}`);
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.range || '').trim());
  if (range && size > 0) {
    let start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
    let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) {
      reply.header('Content-Range', `bytes */${size}`);
      return reply.code(416).send();
    }
    reply.code(206);
    reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
    reply.header('Content-Length', end - start + 1);
    return reply.send(createReadStream(blob.path, { start, end }));
  }
  reply.header('Content-Length', size);
  return reply.send(createReadStream(blob.path));
}
