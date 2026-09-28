import { config } from './config.js';

/** Транскрибация голоса через Whisper */
export async function transcribeAudio(buffer, filename = 'audio.m4a', mime = 'audio/m4a') {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), filename);
  form.append('model', config.ai.voiceModel);
  form.append('language', 'ru');

  const res = await fetch(`${config.ai.openaiBase}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.ai.key}` },
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Whisper ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.text || '';
}
