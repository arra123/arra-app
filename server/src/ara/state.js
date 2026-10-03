// Чистые функции протокола ara.*: разбор снимков устройств, склейка в одно
// состояние для телефона и поиск переходов агента для push. Без сети и БД —
// всё покрыто тестами в tests/ara.test.mjs.

export const DEVICES = ['laptop', 'pc'];
export const AGENT_STATES = ['working', 'waiting', 'error', 'old'];

const str = (value, max = 400) => (typeof value === 'string' ? value.slice(0, max) : '');
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

export function normalizeDevice(value, fallback = 'laptop') {
  const device = String(value || '').trim().toLowerCase();
  return DEVICES.includes(device) ? device : fallback;
}

export function normalizeAgentKind(value) {
  return String(value || '').toLowerCase().includes('codex') ? 'codex' : 'claude';
}

export function liveKey(device, term) {
  return `live:${device}:${term}`;
}

export function recentKey(device, id) {
  return `recent:${device}:${id}`;
}

/** Снимок от ara-link → проверенный и обрезанный вид. device — чей это снимок. */
// subscription limits from ara-limits: only numbers and short strings go through
function limitsOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pick = (o) => {
    if (!o || typeof o !== 'object') return null;
    const out = {};
    for (const k of ['session', 'sessionReset', 'week', 'weekReset']) if (typeof o[k] === 'number') out[k] = o[k];
    for (const k of ['email', 'plan']) if (typeof o[k] === 'string') out[k] = o[k].slice(0, 120);
    if (o.credit && typeof o.credit === 'object') {
      out.credit = { left: num(o.credit.left), limit: num(o.credit.limit), reset: num(o.credit.reset) };
    }
    return out;
  };
  return { claude: pick(raw.claude), codex: { laptop: pick(raw.codex?.laptop), pc: pick(raw.codex?.pc) }, at: num(raw.at) };
}

export function normalizeSnapshot(msg, fallbackDevice = 'laptop') {
  const device = normalizeDevice(msg?.device, fallbackDevice);
  const live = [];
  for (const raw of Array.isArray(msg?.live) ? msg.live.slice(0, 60) : []) {
    const term = num(raw?.term);
    if (term == null) continue;
    const agentDevice = normalizeDevice(raw.device, device);
    const state = AGENT_STATES.includes(raw.state) ? raw.state : (raw.busy ? 'working' : 'waiting');
    live.push({
      key: liveKey(agentDevice, term),
      mascotId: [0,3,4,5,6,8,11,12,13,14,15,16,19].includes(raw.mascotId) ? raw.mascotId : 0,
      device: agentDevice,
      agent: normalizeAgentKind(raw.agent),
      project: str(raw.project, 120) || 'агент',
      cwd: str(raw.cwd, 400),
      ws: num(raw.ws),
      term,
      title: str(raw.title, 200),
      busy: !!raw.busy,
      compacting: raw.compacting === true,
      state,
      idle: num(raw.idle) ?? 0,
      task: str(raw.task, 400),
      transcript: str(raw.transcript, 600),
      iconName: /^[\w.-]{1,80}\.png$/.test(String(raw.iconName || '')) ? raw.iconName : null,
      model: str(raw.model, 80),
    });
  }
  const recent = [];
  for (const raw of Array.isArray(msg?.recent) ? msg.recent.slice(0, 60) : []) {
    const id = str(raw?.id, 120);
    if (!id) continue;
    const recentDevice = normalizeDevice(raw.device, device);
    recent.push({
      key: recentKey(recentDevice, id),
      mascotId: [0,3,4,5,6,8,11,12,13,14,15,16,19].includes(raw.mascotId) ? raw.mascotId : 0,
      device: recentDevice,
      agent: normalizeAgentKind(raw.agent),
      project: str(raw.project, 120) || 'сессия',
      cwd: str(raw.cwd, 400),
      id,
      title: str(raw.title, 200),
      mtime: num(raw.mtime),
      transcript: str(raw.transcript, 600),
      iconName: /^[\w.-]{1,80}\.png$/.test(String(raw.iconName || '')) ? raw.iconName : null,
    });
  }
  return { device, live, recent, pcOnline: !!msg?.pcOnline, limits: limitsOf(msg?.limits) };
}

/**
 * Склеить снимки всех подключённых устройств.
 * hosts: [{ tokenId, device, snapshot }]. Если агент ПК виден и с ноутбука (через
 * ssh), и с самого ПК, выигрывает устройство, на котором агент реально живёт.
 * Возвращает { agents, recent, devices, hostOf: Map<key, tokenId> }.
 */
export function mergeHosts(hosts) {
  const agents = new Map();
  const recent = new Map();
  const hostOf = new Map();
  const devices = {
    laptop: { online: false, via: null },
    pc: { online: false, via: null },
  };

  const ordered = [...hosts].filter((h) => h.snapshot);
  for (const host of ordered) {
    const own = host.snapshot.device;
    devices[own] = { online: true, via: own };
    if (host.snapshot.pcOnline && own !== 'pc' && !devices.pc.online) devices.pc = { online: true, via: own };

    for (const agent of host.snapshot.live) {
      const prev = agents.get(agent.key);
      const native = agent.device === own;
      if (prev && !(native && !prev.native)) continue;
      agents.set(agent.key, { agent, native });
      hostOf.set(agent.key, host.tokenId);
    }
    for (const item of host.snapshot.recent) {
      const prev = recent.get(item.key);
      const native = item.device === own;
      if (prev && !(native && !prev.native)) continue;
      recent.set(item.key, { item, native });
      hostOf.set(item.key, host.tokenId);
    }
  }

  const deviceOrder = (d) => DEVICES.indexOf(d);
  const agentList = [...agents.values()].map((v) => v.agent)
    .sort((a, b) => deviceOrder(a.device) - deviceOrder(b.device) || (a.ws ?? 99) - (b.ws ?? 99) || a.term - b.term);
  const recentList = [...recent.values()].map((v) => v.item)
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
    .slice(0, 40);
  const limits = ordered.map((h) => h.snapshot.limits).find(Boolean) ?? null;
  return { agents: agentList, recent: recentList, devices, hostOf, limits };
}

/** Устройство, которое выполнит команду для машины device (запуск, ответ Arra). */
export function pickHostForDevice(hosts, device) {
  const online = hosts.filter((h) => h.snapshot || h.device);
  const own = online.find((h) => (h.snapshot?.device || h.device) === device);
  if (own) return own.tokenId;
  if (device === 'pc') {
    const bridge = online.find((h) => h.snapshot?.pcOnline);
    if (bridge) return bridge.tokenId;
  }
  return null;
}

/** Хост для Arra: ноутбук, если есть, иначе любой. */
export function pickAskHost(hosts) {
  return pickHostForDevice(hosts, 'laptop') || hosts[0]?.tokenId || null;
}

/**
 * Обновить «с какого момента в этом состоянии» и найти переходы для push.
 * prev: Map<key, { state, since }>; возвращает { next, transitions, removed }.
 */
export function trackStates(prev, agents, now = Date.now()) {
  const next = new Map();
  const transitions = [];
  for (const agent of agents) {
    const before = prev.get(agent.key);
    if (before && before.state === agent.state) {
      next.set(agent.key, before);
      continue;
    }
    const since = before ? now : now - Math.max(0, agent.idle || 0) * 1000;
    next.set(agent.key, { state: agent.state, since });
    if (before?.state === 'working' && (agent.state === 'waiting' || agent.state === 'error')) {
      // how long it worked: a few seconds of «working» is a flicker, not a job
      transitions.push({ agent, from: before.state, to: agent.state, worked: now - before.since });
    }
  }
  const removed = [...prev.keys()].filter((key) => !next.has(key));
  return { next, transitions, removed };
}

/** Состояние для телефона. idle меняется каждую секунду — наружу отдаём since. */
export function publicState(merged, since) {
  return {
    agents: merged.agents.map(({ idle, ...agent }) => ({
      ...agent,
      since: since.get(agent.key)?.since ?? null,
    })),
    recent: merged.recent,
    devices: merged.devices,
    limits: merged.limits ?? null,
  };
}

export function pushText(transition) {
  const { agent, to } = transition;
  const who = agent.agent === 'codex' ? 'Codex' : 'Claude';
  const where = agent.device === 'pc' ? 'ПК' : 'ноутбук';
  const title = to === 'error' ? `${agent.project} · прервался` : `${agent.project} · ждёт ответа`;
  const lead = to === 'error' ? `${who} остановился с ошибкой (${where})` : `${who} закончил (${where})`;
  const body = agent.task ? `${lead}: ${agent.task}`.slice(0, 180) : lead;
  return { title, body };
}
