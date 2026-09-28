import { transcribeAudio } from '../ai.js';

export default async function aiRoutes(app) {
  // Голос -> текст: диктовка в поле ввода агенту или Аре
  app.post('/ai/transcribe', { preHandler: app.auth }, async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'Нужен аудиофайл' });
    const buffer = await file.toBuffer();
    const text = await transcribeAudio(buffer, file.filename || 'audio.m4a', file.mimetype);
    return { text: text || '' };
  });
}
