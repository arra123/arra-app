// Live Activity «Кольца»: the server updates it through APNs while the app is
// closed (the app itself updates it while it is open). Content state is what
// expo-widgets expects: { name: 'ArraRings', props: '<json>' }.
import { connect } from 'node:http2';
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { query } from '../db.js';

const TOPIC = 'com.arratima.aura.push-type.liveactivity';
const CREDENTIALS = process.env.APNS_CREDENTIALS_PATH || '/opt/noda/credentials/apns.json';
let credential = null;
let jwt = '';
let jwtAt = 0;
let session = null;

function auth() {
  if (!credential) credential = JSON.parse(readFileSync(CREDENTIALS, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (!jwt || now - jwtAt > 3000) {
    const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const body = `${enc({ alg: 'ES256', kid: credential.keyId })}.${enc({ iss: credential.teamId, iat: now })}`;
    jwt = `${body}.${sign('sha256', Buffer.from(body), { key: createPrivateKey(credential.key), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    jwtAt = now;
  }
  return jwt;
}

function apns() {
  if (!session || session.closed || session.destroyed) {
    session = connect('https://api.push.apple.com');
    session.on('error', () => { session = null; });
    session.unref?.();
  }
  return session;
}

/** Agents → the rings (the same as the app's src/widgets/props.ts). */
export function ringsProps(agents, now = Date.now()) {
  const shown = agents
    .filter((a) => a.state === 'working' || a.state === 'waiting' || a.state === 'error')
    .sort((a, b) => Number(b.state === 'working') - Number(a.state === 'working'));
  return {
    agents: shown.map((a) => ({
      key: a.key,
      title: a.title || a.project,
      project: a.project,
      state: a.state === 'working' ? 'work' : a.state === 'waiting' ? 'wait' : 'done',
      min: a.since ? Math.max(0, Math.round((now - a.since) / 60000)) : 0,
    })),
    working: shown.filter((a) => a.state === 'working').length,
    waiting: shown.filter((a) => a.state === 'waiting').length,
    updated: now,
  };
}

/** Who needs the user right now: stopped (or failed) within the last 15 minutes. */
const FRESH_MS = 15 * 60_000;
export function callingProps(agents, now = Date.now()) {
  const calling = agents.filter((a) => (a.state === 'waiting' || a.state === 'error') && a.since && now - a.since < FRESH_MS);
  return { ...ringsProps(calling, now), working: agents.filter((a) => a.state === 'working').length };
}

export function activityPayload(props, now = Date.now()) {
  const live = props.agents.length > 0;
  const ts = Math.floor(now / 1000);
  return {
    aps: {
      timestamp: ts,
      event: live ? 'update' : 'end',
      'content-state': { name: 'ArraRings', props: JSON.stringify(props) },
      ...(live ? { 'stale-date': ts + 300 } : { 'dismissal-date': ts }),
    },
  };
}

/** Starts the block while the app is closed (the push-to-start token, iOS 17.2+). */
export function startPayload(props, now = Date.now()) {
  const ts = Math.floor(now / 1000);
  const first = props.agents[0];
  return {
    aps: {
      timestamp: ts,
      event: 'start',
      'content-state': { name: 'ArraRings', props: JSON.stringify(props) },
      'attributes-type': 'LiveActivityAttributes',
      attributes: {},
      'stale-date': ts + 900,
      alert: { title: props.agents.length === 1 ? 'Агент ждёт тебя' : `${props.agents.length} агента ждут тебя`, body: first ? first.title : '' },
    },
  };
}

export async function saveStartToken(userId, token) {
  await query(
    `INSERT INTO ara_live_start (user_id, token) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET token = $2, updated_at = now()`,
    [userId, token],
  );
}

function send(token, payload, priority = '5') {
  return new Promise((resolve) => {
    let status = 0;
    try {
      const req = apns().request({
        ':method': 'POST', ':path': `/3/device/${token}`, authorization: `bearer ${auth()}`,
        'apns-push-type': 'liveactivity', 'apns-topic': TOPIC, 'apns-priority': priority,
      });
      req.setTimeout(10_000, () => { req.close(); resolve(0); });
      req.on('response', (h) => { status = Number(h[':status']); });
      req.on('data', () => {});
      req.on('end', () => resolve(status));
      req.on('error', () => resolve(0));
      req.end(JSON.stringify(payload));
    } catch {
      resolve(0);
    }
  });
}

export async function saveActivityToken(userId, token) {
  await query(
    `INSERT INTO ara_live_activities (token, user_id) VALUES ($1, $2)
     ON CONFLICT (token) DO UPDATE SET user_id = $2, updated_at = now()`,
    [token, userId],
  );
}

const lastSent = new Map(); // userId -> { body, at }
const started = new Map(); // userId -> { keys: Set of agent keys the block was started for, at }

/**
 * The agents changed (or a minute passed). The block is on the screen only
 * while someone needs the user: it is updated, or started from here when the
 * app is closed, and ended as soon as nobody waits (or 15 minutes passed).
 */
export async function pushRings(userId, agents, { force = false } = {}) {
  const props = callingProps(agents);
  const body = JSON.stringify({ ...props, updated: 0, agents: props.agents.map((a) => [a.key, a.min]) });
  const prev = lastSent.get(userId);
  if (!force && prev && prev.body === body) return;
  // Apple rations these: not more than every 20 s per user
  if (prev && Date.now() - prev.at < 20_000 && !force) return;
  lastSent.set(userId, { body, at: Date.now() });
  const { rows } = await query('SELECT token FROM ara_live_activities WHERE user_id = $1', [userId]);
  const payload = activityPayload(props);
  let alive = 0;
  for (const { token } of rows) {
    const status = await send(token, payload);
    if (status === 200) alive += 1;
    // 410: the activity is over (ended or removed): forget its token
    if (status === 410 || status === 400) await query('DELETE FROM ara_live_activities WHERE token = $1', [token]).catch(() => {});
  }
  if (!props.agents.length) { started.delete(userId); return; }
  // nobody shows it yet: start it from here, once per agent that began to wait
  if (alive === 0) {
    const was = started.get(userId);
    const fresh = props.agents.filter((a) => !was || !was.keys.has(a.key));
    if (!fresh.length) return;
    const row = await query('SELECT token FROM ara_live_start WHERE user_id = $1', [userId]).then((r) => r.rows[0]).catch(() => null);
    if (!row) return;
    const status = await send(row.token, startPayload(props), '10');
    if (status === 200) started.set(userId, { keys: new Set(props.agents.map((a) => a.key)), at: Date.now() });
    else if (status === 410 || status === 400) await query('DELETE FROM ara_live_start WHERE user_id = $1', [userId]).catch(() => {});
  }
}

// the minutes on the rings go on while agents work
const latest = new Map(); // userId -> agents
export function rememberAgents(userId, agents) { latest.set(userId, agents); }
setInterval(() => {
  for (const [userId, agents] of latest) {
    // while someone waits: the minutes go on, and after 15 minutes the block leaves
    if (lastSent.get(userId)?.body?.includes('"agents":[[')) pushRings(userId, agents).catch(() => {});
  }
}, 60_000).unref?.();
