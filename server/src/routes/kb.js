// «Поделиться в Arra» → the knowledge base on the computer.
// The phone (the app with its login, or an iOS Shortcut with the share key)
// posts a link, a text or a file; the computer asks for what is waiting, takes
// it into ara-kb/inbox and marks it taken.
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { config } from '../config.js';
import { one, query } from '../db.js';

const dir = join(config.uploadDir, 'kb');
const clean = (name) => basename(String(name || 'file')).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120) || 'file';
const firstUrl = (text) => (String(text || '').match(/https?:\/\/[^\s<>"']+/) || [null])[0];

export default async function kbRoutes(app) {
  await mkdir(dir, { recursive: true });

  // who is asking: the app's login (Bearer JWT) or the share key (?key= / X-Share-Key)
  async function userOf(request) {
    const key = String(request.query?.key || request.headers['x-share-key'] || '').trim();
    if (key) {
      const row = await one('SELECT user_id FROM kb_share_keys WHERE key = $1', [key]);
      return row ? row.user_id : null;
    }
    try {
      await request.jwtVerify();
      return request.user.id;
    } catch {
      return null;
    }
  }

  // the share key (made on first ask): for the computer and for an iOS Shortcut
  app.get('/kb/key', { preHandler: app.auth }, async (request) => {
    let row = await one('SELECT key FROM kb_share_keys WHERE user_id = $1', [request.user.id]);
    if (!row) {
      const key = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
      row = await one(
        'INSERT INTO kb_share_keys (user_id, key) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING key',
        [request.user.id, key],
      );
    }
    return { key: row.key };
  });

  // share: JSON { url, text, title } or a multipart file (fields url / text / title allowed too)
  app.post('/kb/share', async (request, reply) => {
    const userId = await userOf(request);
    if (!userId) return reply.code(401).send({ error: 'Не авторизован' });
    const saved = [];
    const add = async (item) => {
      const id = randomUUID();
      await query(
        `INSERT INTO kb_inbox (id, user_id, kind, url, title, body, file_name, file_path, file_mime)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, userId, item.kind, item.url || null, item.title || null, item.body || null,
          item.fileName || null, item.filePath || null, item.fileMime || null],
      );
      saved.push({ id, kind: item.kind });
    };
    const addText = async (fields) => {
      const text = String(fields.text || '').trim().slice(0, 20000);
      const url = String(fields.url || '').trim().split('\n')[0] || firstUrl(text);
      const title = String(fields.title || '').trim().slice(0, 300);
      if (url) await add({ kind: 'link', url: url.slice(0, 2000), title, body: text && text !== url ? text : null });
      else if (text) await add({ kind: 'text', title, body: text });
    };

    if (request.isMultipart()) {
      const fields = {};
      let realFiles = 0;
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          const name = clean(part.filename || 'file');
          const mime = String(part.mimetype || '');
          // an iOS Shortcut sends a shared link or text as a tiny text file
          if (mime.startsWith('text/') || /\.(txt|url|webloc)$/i.test(name)) {
            const chunks = [];
            let size = 0;
            for await (const chunk of part.file) { size += chunk.length; if (size <= 200000) chunks.push(chunk); }
            const body = Buffer.concat(chunks).toString('utf8');
            fields.text = [fields.text, body].filter(Boolean).join('\n');
            continue;
          }
          const id = randomUUID();
          const path = join(dir, `${id}${extname(name).slice(0, 10)}`);
          try {
            await pipeline(part.file, createWriteStream(path));
          } catch (error) {
            await rm(path, { force: true });
            return reply.code(500).send({ error: error.message });
          }
          await add({ kind: 'file', fileName: name, filePath: path, fileMime: mime || null });
          realFiles += 1;
        } else {
          fields[part.fieldname] = [fields[part.fieldname], part.value].filter(Boolean).join('\n');
        }
      }
      // next to a real file the text field is usually just its name: keep it only if it has a link
      if (!realFiles || firstUrl(fields.text) || fields.url) await addText(fields);
    } else {
      await addText(request.body || {});
    }
    if (!saved.length) return reply.code(400).send({ error: 'Нечего сохранять: нужен url, text или файл' });
    return { ok: true, saved };
  });

  // what is waiting for the computer
  app.get('/kb/inbox', async (request, reply) => {
    const userId = await userOf(request);
    if (!userId) return reply.code(401).send({ error: 'Не авторизован' });
    const { rows } = await query(
      `SELECT id, kind, url, title, body, file_name, file_mime, created_at
       FROM kb_inbox WHERE user_id = $1 AND taken_at IS NULL ORDER BY created_at LIMIT 50`,
      [userId],
    );
    return { items: rows };
  });

  app.get('/kb/file/:id', async (request, reply) => {
    const userId = await userOf(request);
    if (!userId) return reply.code(401).send({ error: 'Не авторизован' });
    const row = await one('SELECT file_name, file_path, file_mime FROM kb_inbox WHERE id = $1 AND user_id = $2', [request.params.id, userId]);
    if (!row || !row.file_path) return reply.code(404).send();
    reply.header('content-type', row.file_mime || 'application/octet-stream');
    return reply.send(createReadStream(row.file_path));
  });

  // the computer took it: the file leaves the server
  app.post('/kb/inbox/:id/taken', async (request, reply) => {
    const userId = await userOf(request);
    if (!userId) return reply.code(401).send({ error: 'Не авторизован' });
    const row = await one(
      'UPDATE kb_inbox SET taken_at = now() WHERE id = $1 AND user_id = $2 RETURNING file_path',
      [request.params.id, userId],
    );
    if (!row) return reply.code(404).send();
    if (row.file_path) await rm(row.file_path, { force: true });
    return { ok: true };
  });
}
