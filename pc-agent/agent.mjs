// Агент Aura для ПК.
// Слушает сервер по WebSocket; когда с телефона приходит файл — скачивает его
// в указанную папку и копирует путь к файлу в буфер обмена Windows.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfgPath = resolve(__dirname, 'config.json');
if (!existsSync(cfgPath)) {
  console.error('Нет config.json. Скопируй config.example.json -> config.json и впиши token и folder.');
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const API = cfg.apiUrl.replace(/\/$/, '');
const WS = API.replace(/^http/, 'ws') + '/agent?token=' + encodeURIComponent(cfg.token);
const FOLDER = cfg.folder;
mkdirSync(FOLDER, { recursive: true });

function copyToClipboard(text) {
  // Кладём путь к файлу в буфер обмена через PowerShell
  const ps = execFile('powershell', ['-NoProfile', '-Command', '$in = $args[0]; Set-Clipboard -Value $in', text], (err) => {
    if (err) console.error('Не смог скопировать в буфер:', err.message);
  });
  ps.on('error', (e) => console.error('PowerShell недоступен:', e.message));
}

async function downloadFile(file) {
  const url = `${API}/files/${file.id}/download?token=${encodeURIComponent(cfg.token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Уникальное имя, чтобы не перезатирать
  const safe = (file.original_name || `${file.id}.bin`).replace(/[\\/:*?"<>|]/g, '_');
  let target = join(FOLDER, safe);
  if (existsSync(target)) {
    const dot = safe.lastIndexOf('.');
    const base = dot > 0 ? safe.slice(0, dot) : safe;
    const ext = dot > 0 ? safe.slice(dot) : '';
    target = join(FOLDER, `${base}_${Date.now()}${ext}`);
  }
  writeFileSync(target, buf);
  return target;
}

async function handleNewFile(file) {
  try {
    const path = await downloadFile(file);
    console.log(`✓ Файл получен: ${path}`);
    if (cfg.copyPathToClipboard !== false) {
      copyToClipboard(path);
      console.log('  ↳ путь скопирован в буфер обмена');
    }
    // Сообщаем серверу, что доставлено
    await fetch(`${API}/files/${file.id}/delivered?token=${encodeURIComponent(cfg.token)}`, { method: 'POST' }).catch(() => {});
  } catch (e) {
    console.error('Ошибка приёма файла:', e.message);
  }
}

let ws;
let reconnectDelay = 2000;

function connect() {
  console.log('Подключаюсь к Aura…');
  ws = new WebSocket(WS);

  ws.on('open', () => {
    reconnectDelay = 2000;
    console.log('● Агент Aura на связи. Жду файлы. Папка:', FOLDER);
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === 'connected') console.log('Сервер подтвердил подключение.');
    else if (msg.type === 'new_file' && msg.file) handleNewFile(msg.file);
    else if (msg.type === 'error') console.error('Сервер:', msg.message);
  });

  ws.on('close', () => {
    console.log(`Соединение закрыто. Переподключусь через ${reconnectDelay / 1000}с…`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
  });

  ws.on('error', (e) => {
    console.error('Ошибка соединения:', e.message);
  });
}

connect();
