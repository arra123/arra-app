import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import Fastify from 'fastify';

import { createBlobStore, sendBlob } from '../src/ara/blobs.js';
import { createHub } from '../src/ara/hub.js';
import { mergeHosts, normalizeSnapshot, pickHostForDevice, trackStates } from '../src/ara/state.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

function fakeSocket() {
  return {
    readyState: 1,
    sent: [],
    send(raw) { this.sent.push(JSON.parse(raw)); },
    last(type) { return [...this.sent].reverse().find((m) => m.type === type); },
    all(type) { return this.sent.filter((m) => m.type === type); },
  };
}

const laptopSnapshot = (overrides = {}) => ({
  type: 'ara.snapshot',
  device: 'laptop',
  pcOnline: true,
  live: [
    { agent: 'claude', project: 'helper', cwd: '/home/tima/Claude/helper', ws: 4, term: 58872, busy: true, state: 'working', idle: 0, device: 'laptop', task: 'сделай приложение', transcript: '/t/a.jsonl' },
    { agent: 'codex', project: 'notch', cwd: '/home/tima/pc/notch', ws: 1, term: 700, busy: true, state: 'working', idle: 0, device: 'pc', task: '', transcript: '/pc/b.jsonl' },
  ],
  recent: [{ agent: 'codex', project: 'helper', cwd: '/home/tima/Claude/helper', id: 'sess-1', title: 'первая просьба', mtime: 1790634392, transcript: '/t/r.jsonl' }],
  ...overrides,
});

test('normalizeSnapshot: ключи, устройства, мусор отбрасывается', () => {
  const snap = normalizeSnapshot({ ...laptopSnapshot(), live: [...laptopSnapshot().live, { term: 'x' }, null] });
  assert.equal(snap.device, 'laptop');
  assert.equal(snap.live.length, 2);
  assert.equal(snap.live[0].key, 'live:laptop:58872');
  assert.equal(snap.live[1].key, 'live:pc:700');
  assert.equal(snap.live[1].agent, 'codex');
  assert.equal(snap.recent[0].key, 'recent:laptop:sess-1');
});

test('mergeHosts: агент ПК берётся с самого ПК, если он тоже подключён', () => {
  const laptop = { tokenId: 'L', snapshot: normalizeSnapshot(laptopSnapshot()) };
  const pc = {
    tokenId: 'P',
    snapshot: normalizeSnapshot({ device: 'pc', live: [{ agent: 'codex', project: 'notch', term: 700, state: 'waiting', transcript: '/native.jsonl' }] }),
  };
  const merged = mergeHosts([laptop, pc]);
  assert.equal(merged.agents.length, 2);
  assert.equal(merged.hostOf.get('live:pc:700'), 'P');
  assert.equal(merged.agents.find((a) => a.key === 'live:pc:700').state, 'waiting');
  assert.equal(merged.hostOf.get('live:laptop:58872'), 'L');
  assert.deepEqual(merged.devices.pc, { online: true, via: 'pc' });
  // Без ПК — агент ПК виден через ноутбук
  const viaLaptop = mergeHosts([laptop]);
  assert.equal(viaLaptop.hostOf.get('live:pc:700'), 'L');
  assert.deepEqual(viaLaptop.devices.pc, { online: true, via: 'laptop' });
  assert.equal(pickHostForDevice([laptop], 'pc'), 'L');
  assert.equal(pickHostForDevice([laptop, pc], 'pc'), 'P');
});

test('trackStates: переход working → waiting и since', () => {
  const agent = { key: 'k', state: 'working', idle: 0 };
  const first = trackStates(new Map(), [agent], 1000);
  assert.equal(first.transitions.length, 0);
  assert.equal(first.next.get('k').since, 1000);
  const same = trackStates(first.next, [agent], 5000);
  assert.equal(same.next.get('k').since, 1000);
  const done = trackStates(same.next, [{ ...agent, state: 'waiting' }], 9000);
  assert.equal(done.transitions.length, 1);
  assert.equal(done.transitions[0].to, 'waiting');
  assert.equal(done.next.get('k').since, 9000);
  const back = trackStates(done.next, [{ ...agent, state: 'error' }], 9500);
  assert.equal(back.transitions.length, 0, 'waiting → error не шлёт push');
  assert.deepEqual(trackStates(back.next, [], 10_000).removed, ['k']);
});

function setup(extra = {}) {
  let clock = 1_000_000;
  const pushes = [];
  const saved = [];
  const hub = createHub({
    now: () => clock,
    sendPush: (...args) => pushes.push(args),
    loadStates: async () => new Map(),
    saveStates: (_u, rows) => saved.push(...rows),
    deleteStates: () => {},
    timeouts: { command: 50, ask: 50, file: 50, upload: 50 },
    ...extra,
  });
  return { hub, pushes, saved, advance: (ms) => { clock += ms; } };
}

test('хаб: снимок → состояние телефону, push при завершении', async () => {
  const { hub, pushes, advance } = setup();
  const laptop = fakeSocket();
  const phone = fakeSocket();
  hub.deviceConnected('u1', 'L', { role: 'laptop' }, laptop);
  hub.clientConnected('u1', phone);
  assert.equal(phone.last('ara.state').agents.length, 0);

  await hub.deviceMessage('u1', 'L', laptopSnapshot());
  const state = phone.last('ara.state');
  assert.equal(state.agents.length, 2);
  assert.equal(state.agents[0].since, 1_000_000);
  assert.equal(state.agents[0].idle, undefined, 'idle не уходит на телефон');
  assert.equal(state.recent.length, 1);

  // Тот же снимок (idle изменился) — телефону ничего нового
  const before = phone.all('ara.state').length;
  const again = laptopSnapshot();
  again.live[0].idle = 3;
  await hub.deviceMessage('u1', 'L', again);
  assert.equal(phone.all('ara.state').length, before);

  advance(60_000);
  const finished = laptopSnapshot();
  finished.live[0].state = 'waiting';
  finished.live[0].busy = false;
  await hub.deviceMessage('u1', 'L', finished);
  assert.equal(pushes.length, 0, 'сразу не шлёт: ждёт, что агент действительно остановился');
  advance(26_000);
  await hub.deviceMessage('u1', 'L', finished);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0][0], 'u1');
  assert.match(pushes[0][1], /helper · ждёт ответа/);
  assert.deepEqual(pushes[0][3], { type: 'ara.agent', agentKey: 'live:laptop:58872', state: 'waiting' });
  assert.equal(phone.last('ara.state').agents[0].since, 1_060_000);
});

test('хаб: нет push, если экран агента открыт; подписка шлёт ara.watch и переписку', async () => {
  const { hub, pushes } = setup();
  const laptop = fakeSocket();
  const phone = fakeSocket();
  hub.deviceConnected('u1', 'L', { role: 'laptop' }, laptop);
  hub.clientConnected('u1', phone);
  await hub.deviceMessage('u1', 'L', laptopSnapshot());

  hub.clientMessage('u1', phone, { type: 'ara.subscribe', agentKey: 'live:pc:700' });
  const watch = laptop.last('ara.watch');
  assert.deepEqual(watch.agents, [{ key: 'live:pc:700', device: 'pc', agent: 'codex', term: 700, transcript: '/pc/b.jsonl' }]);

  const data = { messages: [{ role: 'assistant', text: 'готово' }], plan: [] };
  await hub.deviceMessage('u1', 'L', { type: 'ara.transcript', agentKey: 'live:pc:700', data });
  assert.deepEqual(phone.last('ara.transcript'), { type: 'ara.transcript', agentKey: 'live:pc:700', data });

  // второй телефон подписывается — сразу получает кеш
  const phone2 = fakeSocket();
  hub.clientConnected('u1', phone2);
  hub.clientMessage('u1', phone2, { type: 'ara.subscribe', agentKey: 'live:pc:700' });
  assert.deepEqual(phone2.last('ara.transcript').data, data);

  const finished = laptopSnapshot();
  finished.live[1].state = 'waiting';
  await hub.deviceMessage('u1', 'L', finished);
  assert.equal(pushes.length, 0);

  hub.clientDisconnected('u1', phone);
  hub.clientDisconnected('u1', phone2);
  assert.deepEqual(laptop.last('ara.watch').agents, []);
});

test('хаб: ara.send идёт на нужный компьютер, ответ возвращается с исходным reqId', async () => {
  const { hub } = setup();
  const laptop = fakeSocket();
  const phone = fakeSocket();
  hub.deviceConnected('u1', 'L', { role: 'laptop' }, laptop);
  hub.clientConnected('u1', phone);
  await hub.deviceMessage('u1', 'L', laptopSnapshot());

  hub.clientMessage('u1', phone, { type: 'ara.send', reqId: 'c7', agentKey: 'live:laptop:58872', text: 'продолжай', images: ['/home/tima/Pictures/ara-inbox/a.jpg', 5] });
  const forwarded = laptop.last('ara.send');
  assert.equal(forwarded.text, 'продолжай');
  assert.deepEqual(forwarded.images, ['/home/tima/Pictures/ara-inbox/a.jpg']);
  assert.equal(forwarded.agent.term, 58872);
  assert.notEqual(forwarded.reqId, 'c7');

  await hub.deviceMessage('u1', 'L', { type: 'ara.result', reqId: forwarded.reqId, ok: true });
  assert.deepEqual(phone.last('ara.result'), { type: 'ara.result', ok: true, reqId: 'c7' });

  // неизвестный агент
  hub.clientMessage('u1', phone, { type: 'ara.stop', reqId: 'c8', agentKey: 'live:laptop:1' });
  assert.equal(phone.last('ara.result').ok, false);

  // компьютер молчит — таймаут
  hub.clientMessage('u1', phone, { type: 'ara.stop', reqId: 'c9', agentKey: 'live:laptop:58872' });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(phone.last('ara.result'), { type: 'ara.result', ok: false, error: 'Компьютер не ответил', reqId: 'c9' });
});

test('хаб: запуск на ПК через ноутбук и поток ответа Arra', async () => {
  const { hub } = setup();
  const laptop = fakeSocket();
  const phone = fakeSocket();
  hub.deviceConnected('u1', 'L', { role: 'laptop' }, laptop);
  hub.clientConnected('u1', phone);
  await hub.deviceMessage('u1', 'L', laptopSnapshot());

  hub.clientMessage('u1', phone, { type: 'ara.launch', reqId: 'l1', device: 'pc', agent: 'codex', dir: '/home/tima/x', task: 'почини', model: 'gpt-5' });
  assert.equal(laptop.last('ara.launch').device, 'pc');

  hub.clientMessage('u1', phone, { type: 'ara.ask', reqId: 'a1', chatId: 'ch', prompt: 'привет', history: [{ role: 'assistant', text: 'x' }], style: 'talk', model: 'opus' });
  const ask = laptop.last('ara.ask');
  assert.equal(ask.style, 'talk');
  assert.equal(ask.model, 'opus');
  await hub.deviceMessage('u1', 'L', { type: 'ara.ask.delta', reqId: ask.reqId, text: 'При' });
  await hub.deviceMessage('u1', 'L', { type: 'ara.ask.delta', reqId: ask.reqId, text: 'вет' });
  await hub.deviceMessage('u1', 'L', { type: 'ara.ask.done', reqId: ask.reqId });
  assert.deepEqual(phone.all('ara.ask.delta').map((m) => m.text), ['При', 'вет']);
  assert.equal(phone.last('ara.ask.done').reqId, 'a1');
  // после done поздние дельты игнорируются
  await hub.deviceMessage('u1', 'L', { type: 'ara.ask.delta', reqId: ask.reqId, text: '!' });
  assert.equal(phone.all('ara.ask.delta').length, 2);
});

test('хаб: без компьютера — понятная ошибка; отключение компьютера обрывает запросы', async () => {
  const { hub } = setup({ timeouts: { command: 10_000 } });
  const phone = fakeSocket();
  hub.clientConnected('u1', phone);
  hub.clientMessage('u1', phone, { type: 'ara.ask', reqId: 'a1', prompt: 'x' });
  assert.equal(phone.last('ara.ask.error').error, 'Компьютер не в сети');

  const laptop = fakeSocket();
  hub.deviceConnected('u1', 'L', { role: 'laptop' }, laptop);
  await hub.deviceMessage('u1', 'L', laptopSnapshot());
  hub.clientMessage('u1', phone, { type: 'ara.stop', reqId: 's1', agentKey: 'live:laptop:58872' });
  hub.deviceDisconnected('u1', 'L', laptop);
  assert.equal(phone.last('ara.result').error, 'Компьютер отключился');
  await tick();
  assert.equal(phone.last('ara.state').agents.length, 0);
});

test('хаб: состояние офлайн-компьютера не забывается, push после возвращения', async () => {
  const { hub, pushes, advance } = setup();
  const laptop = fakeSocket();
  hub.deviceConnected('u1', 'L', { role: 'laptop' }, laptop);
  await hub.deviceMessage('u1', 'L', laptopSnapshot());
  hub.deviceDisconnected('u1', 'L', laptop);
  await tick();
  const laptop2 = fakeSocket();
  hub.deviceConnected('u1', 'L', { role: 'laptop' }, laptop2);
  const finished = laptopSnapshot();
  finished.live[0].state = 'error';
  await hub.deviceMessage('u1', 'L', finished);
  advance(26_000);
  await hub.deviceMessage('u1', 'L', finished);
  assert.equal(pushes.length, 1);
  assert.match(pushes[0][1], /прервался/);
});

test('хаб: мигание «работает ↔ ждёт» и короткие шаги не шлют push', async () => {
  const { hub, pushes, advance } = setup();
  const laptop = fakeSocket();
  hub.deviceConnected('u1', 'L', { role: 'laptop' }, laptop);
  await hub.deviceMessage('u1', 'L', laptopSnapshot());
  advance(60_000);
  const waiting = laptopSnapshot();
  waiting.live[0].state = 'waiting';
  await hub.deviceMessage('u1', 'L', waiting);
  advance(5_000);
  await hub.deviceMessage('u1', 'L', laptopSnapshot()); // снова работает: не закончил
  advance(5_000);
  await hub.deviceMessage('u1', 'L', waiting); // поработал 5 с — это шаг, не работа
  advance(30_000);
  await hub.deviceMessage('u1', 'L', waiting);
  assert.equal(pushes.length, 0);
});

test('хаб: ara.file и ara.upload', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ara-blobs-'));
  const blobs = createBlobStore({ dir });
  await blobs.init();
  const { hub } = setup({ blobs, timeouts: { file: 1000, upload: 1000 } });
  const laptop = fakeSocket();
  const phone = fakeSocket();
  hub.deviceConnected('u1', 'L', { role: 'laptop' }, laptop);
  hub.clientConnected('u1', phone);
  await hub.deviceMessage('u1', 'L', laptopSnapshot());

  hub.clientMessage('u1', phone, { type: 'ara.file', reqId: 'f1', agentKey: 'live:laptop:58872', path: '/home/tima/shot.png' });
  const ask = laptop.last('ara.file');
  assert.equal(ask.path, '/home/tima/shot.png');
  assert.equal(hub.pendingFile('u1', 'OTHER', ask.reqId), null, 'чужое устройство не может ответить');
  const wanted = hub.pendingFile('u1', 'L', ask.reqId);
  const blob = await blobs.save('u1', Readable.from([Buffer.from('png-bytes')]), { name: 'shot.png', source: wanted.source });
  hub.fileReady(wanted.id, blob);
  const result = phone.last('ara.result');
  assert.equal(result.reqId, 'f1');
  assert.equal(result.url, `/ara/blob/${blob.id}`);
  assert.equal(result.mime, 'image/png');

  // повторный запрос — из кеша, без компьютера
  const asksBefore = laptop.all('ara.file').length;
  hub.clientMessage('u1', phone, { type: 'ara.file', reqId: 'f2', agentKey: 'live:laptop:58872', path: '/home/tima/shot.png' });
  assert.equal(laptop.all('ara.file').length, asksBefore);
  assert.equal(phone.last('ara.result').blobId, blob.id);
  // тот же путь из другой переписки — кеш не используется, компьютер проверит сам
  hub.clientMessage('u1', phone, { type: 'ara.file', reqId: 'f3', chatId: 'c1', path: '/home/tima/shot.png' });
  assert.equal(laptop.all('ara.file').length, asksBefore + 1);
  // пока идёт загрузка, таймер не обрывает запрос; повторно «занять» его нельзя
  const slow = hub.pendingFile('u1', 'L', laptop.last('ara.file').reqId);
  assert.ok(slow);
  assert.equal(hub.pendingFile('u1', 'L', slow.id), null);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.notEqual(phone.last('ara.result').reqId, 'f3');
  hub.fileFailed(slow.id, 'обрыв');
  assert.deepEqual(phone.last('ara.result'), { type: 'ara.result', ok: false, error: 'обрыв', reqId: 'f3' });

  const photo = await blobs.save('u1', Readable.from([Buffer.from('jpg')]), { name: 'IMG 1.jpg' });
  const delivered = hub.deliverUpload('u1', { agentKey: 'live:pc:700' }, photo);
  const up = laptop.last('ara.upload');
  assert.equal(up.device, 'pc');
  assert.equal(up.url, `/ara/blob/${photo.id}`);
  await hub.deviceMessage('u1', 'L', { type: 'ara.result', reqId: up.reqId, ok: true, path: '/home/tima/Pictures/ara-inbox/IMG 1.jpg' });
  assert.equal((await delivered).path, '/home/tima/Pictures/ara-inbox/IMG 1.jpg');

  const failing = hub.deliverUpload('u1', { device: 'laptop' }, photo);
  await hub.deviceMessage('u1', 'L', { type: 'ara.result', reqId: laptop.last('ara.upload').reqId, ok: false, error: 'нет места' });
  await assert.rejects(failing, /нет места/);
  await rm(dir, { recursive: true, force: true });
});

test('blobs: лимит размера и Range для видео', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ara-blobs-'));
  const blobs = createBlobStore({ dir, maxBytes: 10 });
  await blobs.init();
  await assert.rejects(blobs.save('u', Readable.from([Buffer.alloc(11)]), { name: 'big.mp4' }), /Файл больше/);
  const blob = await blobs.save('u', Readable.from([Buffer.from('0123456789')]), { name: '../v.mp4' });
  assert.equal(blob.name, 'v.mp4');
  assert.equal(blob.mime, 'video/mp4');
  assert.equal(blobs.get('other', blob.id), null);

  const app = Fastify();
  app.get('/b', (request, reply) => sendBlob(request, reply, blob));
  const full = await app.inject({ url: '/b' });
  assert.equal(full.statusCode, 200);
  assert.equal(full.body, '0123456789');
  const part = await app.inject({ url: '/b', headers: { range: 'bytes=2-5' } });
  assert.equal(part.statusCode, 206);
  assert.equal(part.body, '2345');
  assert.equal(part.headers['content-range'], 'bytes 2-5/10');
  const tail = await app.inject({ url: '/b', headers: { range: 'bytes=-3' } });
  assert.equal(tail.body, '789');
  const bad = await app.inject({ url: '/b', headers: { range: 'bytes=20-' } });
  assert.equal(bad.statusCode, 416);
  await app.close();
  await writeFile(join(dir, 'x'), '');
  await rm(dir, { recursive: true, force: true });
});

test('хаб: уснувший телефон с открытым экраном не глушит push', async () => {
  const { hub, pushes, advance } = setup();
  const laptop = fakeSocket();
  const phone = fakeSocket();
  hub.deviceConnected('u1', 'L', { role: 'laptop' }, laptop);
  hub.clientConnected('u1', phone);
  await hub.deviceMessage('u1', 'L', laptopSnapshot());
  hub.clientMessage('u1', phone, { type: 'ara.subscribe', agentKey: 'live:laptop:58872' });
  advance(60_000); // телефон молчит минуту — iOS его усыпил
  const finished = laptopSnapshot();
  finished.live[0].state = 'waiting';
  await hub.deviceMessage('u1', 'L', finished);
  advance(26_000);
  await hub.deviceMessage('u1', 'L', finished);
  assert.equal(pushes.length, 1);
});

test('хаб: отозванный ключ отключает компьютер', async () => {
  const { hub } = setup();
  const laptop = fakeSocket();
  laptop.close = function close(code) { this.closedWith = code; };
  const phone = fakeSocket();
  hub.deviceConnected('u1', 'L', { role: 'laptop' }, laptop);
  hub.clientConnected('u1', phone);
  await hub.deviceMessage('u1', 'L', laptopSnapshot());
  hub.disconnectToken('u1', 'L');
  assert.equal(laptop.closedWith, 4401);
  assert.deepEqual(hub.onlineTokenIds('u1'), []);
  await tick();
  assert.equal(phone.last('ara.state').agents.length, 0);
});
