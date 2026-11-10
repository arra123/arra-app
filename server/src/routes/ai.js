import { cleanTalkMessages, speakAudio, talkReply, transcribeAudio } from '../ai.js';
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

  // Разговор голосом: реплики -> короткий ответ, который удобно произнести.
  app.post('/ai/talk', { preHandler: app.auth }, async (request, reply) => {
    const messages = cleanTalkMessages(request.body?.messages);
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return reply.code(400).send({ error: 'Нужны реплики разговора, последняя — от пользователя' });
    }
    try {
      const text = await talkReply(messages);
      if (!text) return reply.code(502).send({ error: 'Модель ответила пусто' });
      return { text };
    } catch (error) {
      request.log.warn({ talk: error?.message }, 'talk failed');
      return reply.code(502).send({ error: 'Ассистент не ответил. Попробуй ещё раз.' });
    }
  });

  // Ответ голосом: текст -> mp3.
  app.post('/ai/speak', { preHandler: app.auth }, async (request, reply) => {
    const text = typeof request.body?.text === 'string' ? request.body.text.trim() : '';
    if (!text) return reply.code(400).send({ error: 'Нужен текст' });
    try {
      const audio = await speakAudio(text);
      return reply.header('Content-Type', 'audio/mpeg').header('Cache-Control', 'no-store').send(audio);
    } catch (error) {
      request.log.warn({ speak: error?.message }, 'speak failed');
      return reply.code(502).send({ error: 'Не получилось озвучить ответ' });
    }
  });
}
