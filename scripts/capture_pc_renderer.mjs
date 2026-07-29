import fs from 'node:fs/promises';
import path from 'node:path';
import WebSocket from '../pc-app/node_modules/ws/wrapper.mjs';

const debugPort = Number(process.env.CHROME_DEBUG_PORT || 9334);
const outDir = path.resolve(process.argv[2] || '.');
const sections = (process.argv.slice(3).length ? process.argv.slice(3) : ['fin', 'sync', 'notes', 'chat', 'remote']);

const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((r) => r.json());
const target = targets.find((item) => item.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error(`Chrome DevTools page target not found on ${debugPort}`);

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result || {});
});
function command(method, params = {}) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 30000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
  });
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const now = Date.now();
const debts = [
  { id: 'd1', counterparty: 'Компания', amount: 11619, direction: 'owes_me', note: '[Тима] Каршеринг · City Drive + Делимобиль + BelkaCar', occurred_at: new Date(now - 2 * 3600e3).toISOString(), settled: false },
  { id: 'd2', counterparty: 'Компания', amount: 20582, direction: 'owes_me', note: '[Тима] OpenAI', occurred_at: new Date(now - 3 * 3600e3).toISOString(), settled: false },
  { id: 'd3', counterparty: 'Компания', amount: 7200, direction: 'owes_me', note: '[Тима] Пополнение баланса зон', occurred_at: new Date(now - 4 * 3600e3).toISOString(), settled: false },
  { id: 'd4', counterparty: 'Компания', amount: 971, direction: 'owes_me', note: '[Тима] Доставка БАДов курьером', occurred_at: new Date(now - 5 * 3600e3).toISOString(), settled: false },
  { id: 'd5', counterparty: 'Компания', amount: 275, direction: 'owes_me', note: '[Тима] Ингредиенты для напитков', occurred_at: new Date(now - 6 * 3600e3).toISOString(), settled: false },
];
const notes = [
  { id: 'n1', title: 'Идеи для Noda', body: 'Упростить передачу между ноутбуком и ПК.\nПоказывать актуальное устройство.', updated_at: new Date(now - 1800e3).toISOString() },
  { id: 'n2', title: 'На этой неделе', body: 'Проверить TestFlight и обновление ПК.', updated_at: new Date(now - 26 * 3600e3).toISOString() },
  { id: 'n3', title: 'Сайт', body: 'Добавить реальные изображения проектов.', updated_at: new Date(now - 2 * 86400e3).toISOString() },
];
const messages = [
  { id: 'm1', role: 'user', content: 'Запиши компенсацию 824 рубля за BelkaCar' },
  { id: 'm2', role: 'assistant', content: 'Записал: BelkaCar · 824 ₽ · компания должна Тиме.' },
];
const devices = [
  { id: 'laptop-1', name: 'Ноутбук', online: true, role: 'laptop' },
  { id: 'pc-1', name: 'Компьютер', online: true, role: 'pc' },
];

const stub = `(() => {
  const noop = () => {};
  const ok = async (value = {}) => ({ ok: true, ...value });
  const status = { paired: true, hasAuth: true, online: true, folder: 'C:\\\\Claude', mode: 'path', deviceId: 'pc-1', deviceName: 'Компьютер', deviceProfile: { role: 'pc' } };
  const devices = ${JSON.stringify(devices)};
  const debts = ${JSON.stringify(debts)};
  const notes = ${JSON.stringify(notes)};
  const messages = ${JSON.stringify(messages)};
  const api = async (method, endpoint) => {
    if (endpoint.startsWith('/pc/tokens')) return { ok: true, data: { tokens: devices } };
    if (endpoint.startsWith('/debts')) return { ok: true, data: { debts } };
    if (endpoint.startsWith('/notes')) return { ok: true, data: { notes } };
    if (endpoint.startsWith('/ai/messages')) return { ok: true, data: { messages } };
    if (endpoint.startsWith('/files')) return { ok: true, data: { files: [] } };
    return { ok: true, data: {} };
  };
  window.arra = new Proxy({
    api, getStatus: async () => status, appVersion: async () => '1.13.0',
    getHistory: async () => [], getCodeRoot: async () => 'C:\\\\Claude',
    transcribe: async () => ({ ok: true, text: 'Тестовая расшифровка' }),
    remoteScreenSend: ok, remoteSync: ok, sync: ok, syncScan: ok,
  }, { get(target, prop) {
    if (prop in target) return target[prop];
    if (String(prop).startsWith('on')) return noop;
    return async () => ({ ok: true });
  }});
})();`;

await fs.mkdir(outDir, { recursive: true });
await command('Page.enable');
await command('Runtime.enable');
await command('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await command('Page.addScriptToEvaluateOnNewDocument', { source: stub });
await command('Page.navigate', { url: new URL('../pc-app/renderer/index.html', import.meta.url).href });
await wait(2600);

for (const section of sections) {
  await command('Runtime.evaluate', { expression: `document.querySelector('[data-s="${section}"]')?.click()` });
  await wait(section === 'sync' ? 1800 : 900);
  const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(outDir, `pc-${section}.png`);
  await fs.writeFile(file, Buffer.from(shot.data, 'base64'));
  console.log(file);
}

ws.close();
