// Хаб протокола ara.*: держит в памяти подключённые компьютеры (ara-link) и
// телефоны, последний снимок каждого компьютера, подписки на переписку агентов,
// и маршрутизирует команды телефон → компьютер с ответами обратно.
//
// Сеть и БД сюда передаются зависимостями (deps), поэтому хаб целиком
// проверяется тестами с поддельными сокетами (tests/ara.test.mjs).
import {
  mergeHosts,
  normalizeDevice,
  normalizeSnapshot,
  pickAskHost,
  pickHostForDevice,
  publicState,
  pushText,
  trackStates,
} from './state.js';

const OPEN = 1;
// «Claude закончил» only when it really did: it worked for a while and then
// stayed waiting (the state flickers working <-> waiting between steps, every
// flicker was a push); and not more often than once in 2 min per agent
const PUSH_COOLDOWN_MS = 120_000;
const PUSH_SETTLE_MS = 25_000;
const PUSH_MIN_WORK_MS = 15_000;
const CLIENT_ALIVE_MS = 40_000;

function emit(socket, event) {
  if (!socket || (socket.readyState !== undefined && socket.readyState !== OPEN)) return false;
  try {
    socket.send(JSON.stringify(event));
    return true;
  } catch {
    return false;
  }
}

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

/**
 * deps: {
 *   now?: () => number,
 *   sendPush?: (userId, title, body, data) => void,
 *   loadStates?: (userId) => Promise<Map<key, {state, since}>>,
 *   saveStates?: (userId, rows: {key, state, project, since}[]) => void,
 *   deleteStates?: (userId, keys: string[]) => void,
 *   blobs?: blob store (для кеша ara.file),
 *   timeouts?: { command, file, ask, upload } в мс,
 * }
 */
export function createHub(deps = {}) {
  const now = deps.now || Date.now;
  // Больше, чем ждёт сам ara-link (ara-pc по ssh до 40 с), иначе команда выполнится,
  // а телефон покажет ошибку и человек повторит (например, два терминала при запуске).
  const timeouts = { command: 45_000, launch: 60_000, file: 120_000, ask: 180_000, upload: 120_000, ...(deps.timeouts || {}) };
  const users = new Map();
  const pending = new Map();
  let seq = 0;

  function user(userId) {
    let u = users.get(userId);
    if (!u) {
      u = {
        hosts: new Map(), // tokenId -> { tokenId, name, device, sockets: Set, snapshot, at }
        clients: new Map(), // socket -> { watch: key | null }
        since: new Map(), // key -> { state, since }
        statesLoaded: null,
        merged: mergeHosts([]),
        lastState: '',
        transcripts: new Map(), // key -> последняя переписка (для нового подписчика)
        watchSent: new Map(), // tokenId -> json отправленного ara.watch
        lastPush: new Map(),
        pendingPush: new Map(), // key -> { transition, at }: waits to see the agent really stopped
      };
      users.set(userId, u);
    }
    return u;
  }

  const hostList = (u) => [...u.hosts.values()];

  function sendToHost(u, tokenId, event) {
    const host = u.hosts.get(tokenId);
    if (!host) return false;
    const sockets = [...host.sockets];
    // Самый свежий сокет — последний (при переподключении старый может ещё висеть)
    for (let i = sockets.length - 1; i >= 0; i--) if (emit(sockets[i], event)) return true;
    return false;
  }

  function stateMessage(u) {
    return { type: 'ara.state', ...publicState(u.merged, u.since), at: now() };
  }

  function broadcastState(u, force = false) {
    const body = JSON.stringify(publicState(u.merged, u.since));
    if (!force && body === u.lastState) return;
    u.lastState = body;
    const message = stateMessage(u);
    for (const socket of u.clients.keys()) emit(socket, message);
  }

  function findItem(u, key) {
    return u.merged.agents.find((a) => a.key === key) || u.merged.recent.find((r) => r.key === key) || null;
  }

  function watchEntry(item) {
    return {
      key: item.key,
      device: item.device,
      agent: item.agent,
      term: item.term ?? null,
      transcript: item.transcript,
    };
  }

  /** Сообщить каждому компьютеру, чью переписку сейчас смотрят телефоны. */
  function syncWatches(u) {
    const watched = new Set();
    for (const client of u.clients.values()) if (client.watch) watched.add(client.watch);
    const perHost = new Map([...u.hosts.keys()].map((id) => [id, []]));
    for (const key of watched) {
      const tokenId = u.merged.hostOf.get(key);
      const item = findItem(u, key);
      if (tokenId && item && perHost.has(tokenId)) perHost.get(tokenId).push(watchEntry(item));
    }
    for (const [tokenId, agents] of perHost) {
      agents.sort((a, b) => a.key.localeCompare(b.key));
      const body = JSON.stringify(agents);
      if (u.watchSent.get(tokenId) === body) continue;
      if (sendToHost(u, tokenId, { type: 'ara.watch', agents })) u.watchSent.set(tokenId, body);
    }
  }

  /** Покрывает ли какой-то онлайн-компьютер машину device (иначе агент просто не виден). */
  function covered(u, device) {
    return hostList(u).some((h) => h.snapshot && (h.snapshot.device === device || (device === 'pc' && h.snapshot.pcOnline)));
  }

  async function refresh(userId) {
    const u = user(userId);
    u.merged = mergeHosts(hostList(u));
    if (!u.statesLoaded) {
      u.statesLoaded = Promise.resolve()
        .then(() => deps.loadStates?.(userId))
        .then((saved) => {
          for (const [key, value] of saved || []) if (!u.since.has(key)) u.since.set(key, value);
        })
        .catch(() => {});
    }
    await u.statesLoaded;

    const prev = u.since;
    const { next, transitions, removed } = trackStates(prev, u.merged.agents, now());
    const gone = [];
    for (const key of removed) {
      const device = key.split(':')[1];
      if (covered(u, device)) gone.push(key);
      else next.set(key, prev.get(key)); // компьютер офлайн — помним состояние до его возвращения
    }
    u.since = next;

    const changed = u.merged.agents
      .filter((a) => prev.get(a.key)?.state !== a.state)
      .map((a) => ({ key: a.key, state: a.state, project: a.project, since: next.get(a.key).since }));
    if (changed.length) Promise.resolve(deps.saveStates?.(userId, changed)).catch(() => {});
    if (gone.length) Promise.resolve(deps.deleteStates?.(userId, gone)).catch(() => {});

    for (const transition of transitions) {
      if (transition.to === 'error' || (transition.worked ?? Infinity) >= PUSH_MIN_WORK_MS) {
        u.pendingPush.set(transition.agent.key, { transition, at: now() });
      }
    }
    for (const [key, p] of u.pendingPush) {
      const cur = next.get(key);
      // it went back to work (or is gone): not finished after all
      if (!cur || cur.state !== p.transition.to) u.pendingPush.delete(key);
      else if (now() - p.at >= PUSH_SETTLE_MS) {
        u.pendingPush.delete(key);
        maybePush(u, userId, p.transition);
      }
    }
    broadcastState(u);
    syncWatches(u);
  }

  function maybePush(u, userId, transition) {
    const key = transition.agent.key;
    // Экран этого агента открыт на телефоне, и телефон жив (пингует) — человек и так видит.
    // Уснувший телефон с открытым экраном перестаёт пинговать, и push уходит.
    for (const client of u.clients.values()) if (client.watch === key && now() - client.at < CLIENT_ALIVE_MS) return;
    const last = u.lastPush.get(key) || 0;
    if (now() - last < PUSH_COOLDOWN_MS) return;
    u.lastPush.set(key, now());
    const { title, body } = pushText(transition);
    Promise.resolve(deps.sendPush?.(userId, title, body, { type: 'ara.agent', agentKey: key, state: transition.to }))
      .catch(() => {});
  }

  // ---------- ожидающие ответа запросы ----------

  function clientReply(entry, event) {
    if (entry.resolve) {
      if (event.ok === false || event.type === 'ara.ask.error') entry.reject(new Error(event.error || 'Ошибка на компьютере'));
      else entry.resolve(event);
      return;
    }
    emit(entry.socket, { ...event, reqId: entry.reqId });
  }

  function failMessage(entry, error) {
    return entry.kind === 'ask'
      ? { type: 'ara.ask.error', ok: false, error, text: error }
      : { type: 'ara.result', ok: false, error };
  }

  function finish(id, event) {
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(id);
    clientReply(entry, event);
  }

  function arm(id) {
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => finish(id, failMessage(entry, 'Компьютер не ответил')), timeouts[entry.kind] || timeouts.command);
    entry.timer.unref?.();
  }

  function forward(u, userId, target, payload, entry) {
    if (!target || !u.hosts.has(target)) {
      clientReply(entry, failMessage(entry, 'Компьютер не в сети'));
      return null;
    }
    const id = `s${++seq}`;
    pending.set(id, { ...entry, userId, tokenId: target });
    arm(id);
    if (!sendToHost(u, target, { ...payload, reqId: id })) {
      finish(id, failMessage(entry, 'Компьютер не в сети'));
      return null;
    }
    return id;
  }

  // ---------- компьютеры ----------

  function deviceConnected(userId, tokenId, info, socket) {
    const u = user(userId);
    let host = u.hosts.get(tokenId);
    if (!host) {
      host = { tokenId, name: info?.name || '', device: normalizeDevice(info?.role, null), sockets: new Set(), snapshot: null, at: 0 };
      u.hosts.set(tokenId, host);
    }
    host.sockets.add(socket);
    u.watchSent.delete(tokenId);
    emit(socket, { type: 'ara.welcome', deviceId: tokenId, phoneOnline: u.clients.size > 0 });
  }

  function deviceDisconnected(userId, tokenId, socket) {
    const u = users.get(userId);
    const host = u?.hosts.get(tokenId);
    if (!host) return;
    host.sockets.delete(socket);
    if (host.sockets.size) return;
    u.hosts.delete(tokenId);
    u.watchSent.delete(tokenId);
    for (const [id, entry] of pending) {
      if (entry.userId === userId && entry.tokenId === tokenId) finish(id, failMessage(entry, 'Компьютер отключился'));
    }
    refresh(userId).catch(() => {});
  }

  async function deviceMessage(userId, tokenId, msg) {
    const u = user(userId);
    const host = u.hosts.get(tokenId);
    if (!host || !msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'ara.hello':
        host.device = normalizeDevice(msg.device, host.device || 'laptop');
        return;
      case 'ara.snapshot':
        host.snapshot = normalizeSnapshot(msg, host.device || 'laptop');
        host.device = host.snapshot.device;
        host.at = now();
        await refresh(userId);
        return;
      case 'ara.transcript': {
        const key = text(msg.agentKey, 200);
        if (!key || u.merged.hostOf.get(key) !== tokenId || !msg.data || typeof msg.data !== 'object') return;
        u.transcripts.set(key, msg.data);
        const event = { type: 'ara.transcript', agentKey: key, data: msg.data };
        for (const [socket, client] of u.clients) if (client.watch === key) emit(socket, event);
        return;
      }
      case 'ara.result':
      case 'ara.ask.delta':
      case 'ara.ask.action':
      case 'ara.ask.done':
      case 'ara.ask.error': {
        const id = String(msg.reqId || '');
        const entry = pending.get(id);
        if (!entry || entry.userId !== userId || entry.tokenId !== tokenId) return;
        const { reqId: _drop, ...rest } = msg;
        if (msg.type === 'ara.ask.delta' || msg.type === 'ara.ask.action') {
          arm(id);
          clientReply(entry, rest);
          return;
        }
        if (entry.kind === 'ask' && msg.type === 'ara.result') {
          finish(id, msg.ok === false ? failMessage(entry, msg.error || 'Arra не ответила') : { type: 'ara.ask.done' });
          return;
        }
        finish(id, rest);
        return;
      }
      default:
    }
  }

  // ---------- телефоны ----------

  function clientConnected(userId, socket) {
    const u = user(userId);
    u.clients.set(socket, { watch: null, at: now() });
    emit(socket, stateMessage(u));
    for (const tokenId of u.hosts.keys()) sendToHost(u, tokenId, { type: 'presence', phoneOnline: true });
  }

  function clientDisconnected(userId, socket) {
    const u = users.get(userId);
    if (!u || !u.clients.has(socket)) return;
    u.clients.delete(socket);
    for (const [id, entry] of pending) {
      if (entry.socket === socket) {
        clearTimeout(entry.timer);
        pending.delete(id);
      }
    }
    syncWatches(u);
    if (!u.clients.size) for (const tokenId of u.hosts.keys()) sendToHost(u, tokenId, { type: 'presence', phoneOnline: false });
  }

  function clientMessage(userId, socket, msg) {
    const u = user(userId);
    const client = u.clients.get(socket);
    if (!client || !msg || typeof msg.type !== 'string') return;
    client.at = now();
    if (msg.type === 'ping') return;
    const entry = { socket, reqId: msg.reqId ?? null, kind: 'command' };
    const key = text(msg.agentKey, 200);
    const item = key ? findItem(u, key) : null;

    switch (msg.type) {
      case 'ara.hello':
      case 'ara.refresh':
        emit(socket, stateMessage(u));
        return;
      case 'ara.subscribe':
        client.watch = key || null;
        if (key && u.transcripts.has(key)) emit(socket, { type: 'ara.transcript', agentKey: key, data: u.transcripts.get(key) });
        syncWatches(u);
        return;
      case 'ara.unsubscribe':
        client.watch = null;
        syncWatches(u);
        return;
      case 'ara.send':
      case 'ara.stop':
      case 'ara.close':
      case 'ara.key':
      case 'ara.model': {
        if (!item || item.term == null) {
          emit(socket, { type: 'ara.result', reqId: entry.reqId, ok: false, error: 'Агент уже закрыт' });
          return;
        }
        const payload = { type: msg.type, agent: watchEntry(item) };
        if (msg.type === 'ara.send') {
          payload.text = text(msg.text, 20_000);
          payload.images = Array.isArray(msg.images) ? msg.images.filter((p) => typeof p === 'string').slice(0, 10) : [];
        }
        if (msg.type === 'ara.model') payload.model = text(msg.model, 80);
        // a key press in the agent's terminal: a digit of an answer, then Enter
        if (msg.type === 'ara.key') {
          payload.keys = (Array.isArray(msg.keys) ? msg.keys : [])
            .filter((k) => typeof k === 'string' && /^([0-9]|enter|escape|up|down|space|tab)$/.test(k)).slice(0, 8);
        }
        forward(u, userId, u.merged.hostOf.get(key), payload, entry);
        return;
      }
      case 'ara.launch': {
        const device = normalizeDevice(msg.device, 'laptop');
        forward(u, userId, pickHostForDevice(hostList(u), device), {
          type: 'ara.launch',
          device,
          agent: msg.agent === 'codex' ? 'codex' : 'claude',
          dir: text(msg.dir, 400),
          task: text(msg.task, 20_000),
          model: text(msg.model, 80),
        }, { ...entry, kind: 'launch' });
        return;
      }
      case 'ara.ask': {
        const history = Array.isArray(msg.history)
          ? msg.history.slice(-30).map((m) => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', text: text(m?.text, 8000) }))
          : [];
        forward(u, userId, pickAskHost(hostList(u)), {
          type: 'ara.ask',
          chatId: text(msg.chatId, 80),
          prompt: text(msg.prompt, 20_000),
          history,
          style: msg.style === 'talk' ? 'talk' : 'brief',
          model: ['haiku', 'sonnet', 'opus'].includes(msg.model) ? msg.model : 'sonnet',
        }, { ...entry, kind: 'ask' });
        return;
      }
      case 'ara.file': {
        const path = text(msg.path, 1000);
        if (!path.startsWith('/')) {
          emit(socket, { type: 'ara.result', reqId: entry.reqId, ok: false, error: 'Нужен абсолютный путь' });
          return;
        }
        const target = key ? u.merged.hostOf.get(key) : pickAskHost(hostList(u));
        const scope = key || `chat:${text(msg.chatId, 80)}`;
        // Кеш — только в той же переписке: компьютер проверял путь именно для неё
        const cached = deps.blobs?.bySourcePath(userId, `${target}:${scope}:${path}`);
        if (cached) {
          emit(socket, { type: 'ara.result', reqId: entry.reqId, ok: true, ...blobInfo(cached) });
          return;
        }
        forward(u, userId, target, {
          type: 'ara.file',
          path,
          agentKey: key || null,
          chatId: text(msg.chatId, 80) || null,
        }, { ...entry, kind: 'file', path, scope });
        return;
      }
      default:
    }
  }

  function blobInfo(blob) {
    return { url: `/ara/blob/${blob.id}`, blobId: blob.id, name: blob.name, mime: blob.mime, size: blob.size };
  }

  // ---------- файлы (вызывается из HTTP-маршрутов) ----------

  /** Компьютер загружает файл по запросу ara.file. Вернёт запись, если запрос ждёт. */
  function pendingFile(userId, tokenId, id) {
    const entry = pending.get(String(id || ''));
    if (!entry || entry.kind !== 'file' || entry.uploading || entry.userId !== userId || entry.tokenId !== tokenId) return null;
    // Большое видео может грузиться долго — пока идёт загрузка, таймер не нужен:
    // закончится либо fileReady, либо fileFailed из HTTP-маршрута.
    clearTimeout(entry.timer);
    entry.uploading = true;
    return { id, path: entry.path, source: `${tokenId}:${entry.scope}:${entry.path}` };
  }

  function fileReady(id, blob) {
    finish(id, { type: 'ara.result', ok: true, ...blobInfo(blob) });
  }

  function fileFailed(id, error) {
    const entry = pending.get(id);
    if (entry) finish(id, failMessage(entry, error));
  }

  /** Фото с телефона → на компьютер, где живёт агент (или на device). Вернёт путь там. */
  function deliverUpload(userId, { agentKey, device }, blob) {
    const u = user(userId);
    const item = agentKey ? findItem(u, agentKey) : null;
    const targetDevice = item?.device || normalizeDevice(device, 'laptop');
    const target = item ? u.merged.hostOf.get(agentKey) : pickHostForDevice(hostList(u), targetDevice);
    return new Promise((resolve, reject) => {
      forward(u, userId, target, {
        type: 'ara.upload',
        url: `/ara/blob/${blob.id}`,
        name: blob.name,
        size: blob.size,
        device: targetDevice,
      }, { kind: 'upload', resolve, reject, socket: null, reqId: null });
    });
  }

  /** Голос с телефона → текст на ноутбуке (Handy, модель GigaAM): бесплатно и по-русски. */
  function transcribe(userId, blob) {
    const u = user(userId);
    const target = pickHostForDevice(hostList(u), 'laptop');
    return new Promise((resolve, reject) => {
      forward(u, userId, target, {
        type: 'ara.transcribe',
        url: `/ara/blob/${blob.id}`,
        name: blob.name,
      }, { kind: 'upload', resolve, reject, socket: null, reqId: null });
    });
  }

  /** Ключ удалён или перевыпущен — закрыть соединения этого компьютера. */
  function disconnectToken(userId, tokenId) {
    const host = users.get(userId)?.hosts.get(tokenId);
    if (!host) return;
    for (const socket of [...host.sockets]) {
      try {
        socket.close(4401, 'token revoked');
      } catch {
        /* уже закрыт */
      }
      deviceDisconnected(userId, tokenId, socket);
    }
  }

  function onlineTokenIds(userId) {
    return [...(users.get(userId)?.hosts.keys() || [])];
  }

  return {
    deviceConnected,
    deviceDisconnected,
    deviceMessage,
    clientConnected,
    clientDisconnected,
    clientMessage,
    pendingFile,
    transcribe,
    fileReady,
    fileFailed,
    deliverUpload,
    onlineTokenIds,
    disconnectToken,
    // для тестов
    _users: users,
    _pending: pending,
  };
}
