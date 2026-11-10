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
      mascotId: a.mascotId || 0,
      title: a.title || a.project,
      project: a.project,
      state: a.state === 'working' ? 'work' : a.state === 'waiting' ? 'wait' : 'done',
      min: a.since ? Math.max(0, Math.round((now - a.since) / 60000)) : 0,
      where: a.device === 'pc' ? 'ПК' : 'ноутбук',
      note: String(a.task || '').replace(/\s+/g, ' ').trim().slice(0, 60),
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
  return { ...ringsProps(calling, now), waiting: calling.length, working: 0 };
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

// Compatibility with old clients: a retired push-to-start token is never saved.
export async function saveStartToken(userId) {
  await query('DELETE FROM ara_live_start WHERE user_id = $1', [userId]);
}

function send(token, payload, priority = '5') {
  return new Promise((resolve) => {
    let status = 0;
    let response = '';
    try {
      const req = apns().request({
        ':method': 'POST', ':path': `/3/device/${token}`, authorization: `bearer ${auth()}`,
        'apns-push-type': 'liveactivity', 'apns-topic': TOPIC, 'apns-priority': priority,
      });
      req.setTimeout(10_000, () => { req.close(); resolve(0); });
      req.on('response', (h) => { status = Number(h[':status']); });
      req.on('data', (chunk) => { if (response.length < 1024) response += chunk; });
      req.on('end', () => {
        {
          let reason = status === 200 ? 'Accepted' : 'Unknown';
          try { reason = JSON.parse(response).reason || reason; } catch {}
          console.info('Arra Live Activity APNs:', status, reason);
        }
        resolve(status);
      });
      req.on('error', (error) => { console.warn('Arra Live Activity transport:', error.code || error.name); resolve(0); });
      req.end(JSON.stringify(payload));
    } catch (error) {
      console.warn('Arra Live Activity transport:', error.code || error.name);
      resolve(0);
    }
  });
}

export async function saveActivityToken(userId, token, layoutVersion = 1) {
  await query(
    `INSERT INTO ara_live_activities (token, user_id, layout_version) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET user_id = $2, layout_version = $3, updated_at = now()`,
    [token, userId, layoutVersion],
  );
  retired.delete(userId);
  return disableActivities(userId);
}

const retired = new Set();
const retiring = new Map();

/** End existing cards through APNs, including phones still running old builds. */
export function disableActivities(userId, { force = false } = {}) {
  if (retiring.has(userId)) return retiring.get(userId);
  if (retired.has(userId) && !force) return Promise.resolve();
  const task = (async () => {
    await saveStartToken(userId);
    const { rows } = await query('SELECT token FROM ara_live_activities WHERE user_id = $1', [userId]);
    const payload = activityPayload({ agents: [], working: 0, waiting: 0, updated: Date.now() });
    let complete = true;
    for (const { token } of rows) {
      const status = await send(token, payload, '10');
      if (status === 200 || status === 400 || status === 410) {
        await query('DELETE FROM ara_live_activities WHERE token = $1', [token]);
      } else complete = false; // Retry on the next snapshot if APNs is unavailable.
    }
    if (complete) retired.add(userId);
  })().finally(() => retiring.delete(userId));
  retiring.set(userId, task);
  return task;
}

// Legacy exports: snapshots only retire cards, never start/update them.
export function pushRings(userId) { return disableActivities(userId); }
export function rememberAgents() {}
export function activityNeedsUpdate(previous, body, now = Date.now()) {
  return !previous || !previous.delivered || previous.body !== body || now - previous.at >= 120_000;
}
