import fs from 'node:fs/promises';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:4186/';
const output = path.resolve(process.argv[3] || 'noda-v2/preview.png');
const width = Number(process.argv[4] || 1600);
const height = Number(process.argv[5] || 1000);
const section = process.argv[6] || 'projects';
const project = process.argv[7] || '';
const targets = await fetch('http://127.0.0.1:9334/json/list').then((response) => response.json());
const target = targets.find((item) => item.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('Chrome target not found');

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
await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
await command('Page.navigate', { url });
await wait(1400);
await command('Runtime.evaluate', { expression: "const input=document.querySelector('#loginPassword'); if(input){input.value='2244'; document.querySelector('#loginForm')?.requestSubmit();}" });
await wait(1800);
if (section !== 'projects') {
  await command('Runtime.evaluate', { expression: `document.querySelector('[data-section="${section}"]')?.click()` });
  await wait(500);
}
if (section === 'projects' && project) {
  await command('Runtime.evaluate', { expression: `document.querySelector('[data-project="${project}"]')?.click()` });
  await wait(500);
}
const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile(output, Buffer.from(shot.data, 'base64'));
const audit = await command('Runtime.evaluate', {
  expression: `({
    title: document.title,
    activeSection: document.querySelector('[data-section].active')?.dataset.section || '',
    projectScreens: document.querySelectorAll('.screen-shot').length,
    projectButtons: document.querySelectorAll('.project-btn').length,
    bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  })`,
  returnByValue: true
});
console.log(JSON.stringify({ output, section, audit: audit.result?.value }));
socket.close();
