#!/usr/bin/env node
/**
 * Заливка симуляторной сборки на Appetize.io (просмотр приложения в браузере на ПК).
 *
 * Нужен бесплатный аккаунт appetize.io → Settings → API token (вид tok_...).
 * Положи его в .env:  APPETIZE_API_KEY=tok_xxx
 * (необязательно) APPETIZE_PUBLIC_KEY=...  — чтобы ОБНОВИТЬ уже созданное приложение,
 * а не плодить новые. После первой заливки скрипт сам подскажет publicKey.
 *
 * Использование:
 *   node scripts/upload-appetize.mjs <путь-к-сборке.tar.gz | .zip | .app>
 *   node scripts/upload-appetize.mjs            # возьмёт последнюю сборку из EAS
 *
 * iOS-симуляторная сборка EAS приходит как .tar.gz с .app внутри — Appetize это принимает.
 */
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

function envFromDotenv(key) {
  try {
    const line = readFileSync(new URL('../.env', import.meta.url), 'utf8')
      .split(/\r?\n/).find((l) => l.startsWith(key + '='));
    return line ? line.slice(key.length + 1).trim() : null;
  } catch { return null; }
}

const API_KEY = process.env.APPETIZE_API_KEY || envFromDotenv('APPETIZE_API_KEY');
const PUBLIC_KEY = process.env.APPETIZE_PUBLIC_KEY || envFromDotenv('APPETIZE_PUBLIC_KEY');

if (!API_KEY) {
  console.error('Нет APPETIZE_API_KEY. Заведи бесплатный аккаунт на appetize.io,\n' +
    'возьми API token в настройках и добавь в .env:  APPETIZE_API_KEY=tok_xxx');
  process.exit(1);
}

let filePath = process.argv[2];

// Если файл не передан — берём последнюю iOS-сборку из EAS
if (!filePath) {
  console.log('Файл не указан — ищу последнюю сборку в EAS…');
  const out = execFileSync('npx', ['eas-cli@latest', 'build:list', '--platform', 'ios',
    '--limit', '1', '--json', '--non-interactive'], { encoding: 'utf8' });
  const builds = JSON.parse(out);
  const url = builds?.[0]?.artifacts?.applicationArchiveUrl || builds?.[0]?.artifacts?.buildUrl;
  if (!url) { console.error('Не нашёл артефакт сборки. Укажи путь к файлу вручную.'); process.exit(1); }
  console.log('Качаю артефакт:', url);
  filePath = 'eas-sim-build.tar.gz';
  execFileSync('curl', ['-L', '-o', filePath, url], { stdio: 'inherit' });
}

if (!existsSync(filePath)) { console.error('Файл не найден:', filePath); process.exit(1); }

const form = new FormData();
form.append('platform', 'ios');
const buf = readFileSync(filePath);
form.append('file', new Blob([buf]), basename(filePath));

const method = PUBLIC_KEY ? 'POST' : 'POST';
const url = PUBLIC_KEY
  ? `https://api.appetize.io/v2/apps/${PUBLIC_KEY}`
  : 'https://api.appetize.io/v2/apps';

console.log(`Заливаю ${basename(filePath)} на Appetize (${PUBLIC_KEY ? 'обновление' : 'новое приложение'})…`);
const res = await fetch(url, { method, headers: { 'X-API-KEY': API_KEY }, body: form });
const data = await res.json().catch(() => ({}));
if (!res.ok) { console.error('Ошибка Appetize:', res.status, JSON.stringify(data)); process.exit(1); }

console.log('\nГотово! Приложение в браузере:');
console.log('  ', data.publicURL || `https://appetize.io/app/${data.publicKey}`);
if (!PUBLIC_KEY && data.publicKey) {
  console.log('\nЧтобы в следующий раз обновлять это же приложение, добавь в .env:');
  console.log('   APPETIZE_PUBLIC_KEY=' + data.publicKey);
}
