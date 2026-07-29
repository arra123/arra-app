import fs from 'node:fs/promises';
import path from 'node:path';

const url = process.argv[2];
const output = path.resolve(process.argv[3] || 'page.png');
const width = Number(process.argv[4] || 1600);
const height = Number(process.argv[5] || 1000);
const debugPort = Number(process.env.CHROME_DEBUG_PORT || 9334);
if (!url) throw new Error('Usage: node scripts/capture_url.mjs <url> <output> [width] [height]');

const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error(`Chrome target not found on port ${debugPort}`);

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let id = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result || {});
});
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const callId = ++id;
  pending.set(callId, { resolve, reject });
  socket.send(JSON.stringify({ id: callId, method, params }));
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await command('Page.enable');
await command('Runtime.enable');
await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
await command('Page.navigate', { url });
await wait(3500);
const title = await command('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
const version = await command('Runtime.evaluate', { expression: "document.querySelector('script[src*=\"projects.js\"]')?.src || ''", returnByValue: true });
const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile(output, Buffer.from(shot.data, 'base64'));
console.log(JSON.stringify({ output, title: title.result?.value, projectsScript: version.result?.value }));
socket.close();
