import { transcribeAudio } from '../ai.js';
import { mimeFor } from '../ara/blobs.js';
import { blobs, hub } from '../ara/instance.js';

export default async function aiRoutes(app) {
  // Голос -> текст: диктовка в поле ввода агенту или Arra. Сначала распознаёт
  // ноутбук (Handy, GigaAM — бесплатно), если его нет в сети — ProxyAPI (Whisper).
  app.post('/ai/transcribe', { preHandler: app.auth }, async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'Нужен аудиофайл' });
    const buffer = await file.toBuffer();
    const name = file.filename || 'audio.m4a';
    let laptopError = '';
    try {
      const { Readable } = await import('node:stream');
      const blob = await blobs.save(request.user.id, Readable.from(buffer), {
        name,
        mime: file.mimetype || mimeFor(name),
      });
      const result = await hub.transcribe(request.user.id, blob);
      return { text: (result.text || '').trim() };
    } catch (error) {
      laptopError = error?.message || 'ноутбук не ответил';
    }
    try {
      const text = await transcribeAudio(buffer, name, file.mimetype);
      return { text: text || '' };
    } catch (error) {
      request.log.warn({ laptopError, whisper: error?.message }, 'transcribe failed');
      return reply.code(502).send({ error: `Не распознал: ${laptopError}` });
    }
  });
}
