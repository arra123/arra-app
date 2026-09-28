import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Локально читаем общий .env из корня проекта; на сервере — server/.env
dotenv.config({ path: resolve(__dirname, '../.env') });
dotenv.config({ path: resolve(__dirname, '../../.env') });

export const config = {
  port: Number(process.env.APP_BACKEND_PORT || 4000),
  host: '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',

  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    schema: process.env.DB_SCHEMA || 'apple',
  },

  ai: {
    key: process.env.PROXY_API_KEY,
    openaiBase: process.env.PROXY_OPENAI_BASE || 'https://api.proxyapi.ru/openai/v1',
    chatModel: process.env.AI_CHAT_MODEL || 'gpt-4o',
    visionModel: process.env.AI_VISION_MODEL || 'gpt-4o',
    voiceModel: process.env.AI_VOICE_MODEL || 'whisper-1',
  },

  // Куда складывать загруженные файлы на сервере
  uploadDir: process.env.UPLOAD_DIR || resolve(__dirname, '../uploads'),
};
