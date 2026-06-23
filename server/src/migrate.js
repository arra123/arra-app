import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, '../migrations');

async function run() {
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    process.stdout.write(`-> ${file} ... `);
    await pool.query(sql);
    console.log('ok');
  }
  console.log('Миграции применены.');
  await pool.end();
}

run().catch((err) => {
  console.error('Ошибка миграции:', err.message);
  process.exit(1);
});
