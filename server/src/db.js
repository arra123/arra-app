import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: 10,
  // Все запросы выполняются в нашей изолированной схеме `apple`
  options: `-c search_path=${config.db.schema}`,
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Вернуть первую строку или null */
export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}
