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

export function activityPayload(props, now = Date.now()) {
  const live = props.working + props.waiting > 0;
  const ts = Math.floor(now / 1000);
  return {
    aps: {
      timestamp: ts,
      event: live ? 'update' : 'end',
      'content-state': { name: 'ArraRings', props: JSON.stringify(props) },
      ...(live ? { 'stale-date': ts + 300 } : { 'dismissal-date': ts + 600 }),
    },
  };
}

function send(token, payload) {
  return new Promise((resolve) => {
    let status = 0;
    try {
      const req = apns().request({
        ':method': 'POST', ':path': `/3/device/${token}`, authorization: `bearer ${auth()}`,
        'apns-push-type': 'liveactivity', 'apns-topic': TOPIC, 'apns-priority': '5',
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

/** The agents changed (or a minute passed): move the rings on the user's phone. */
export async function pushRings(userId, agents, { force = false } = {}) {
  const props = ringsProps(agents);
  const body = JSON.stringify({ ...props, updated: 0 });
  const prev = lastSent.get(userId);
  if (!force && prev && prev.body === body) return;
  // Apple rations these: not more than every 20 s per user
  if (prev && Date.now() - prev.at < 20_000 && !force) return;
  lastSent.set(userId, { body, at: Date.now() });
  const { rows } = await query('SELECT token FROM ara_live_activities WHERE user_id = $1', [userId]);
  const payload = activityPayload(props);
  for (const { token } of rows) {
    const status = await send(token, payload);
    // 410: the activity is over (ended or removed): forget its token
    if (status === 410 || status === 400) await query('DELETE FROM ara_live_activities WHERE token = $1', [token]).catch(() => {});
  }
}

// the minutes on the rings go on while agents work
const latest = new Map(); // userId -> agents
export function rememberAgents(userId, agents) { latest.set(userId, agents); }
setInterval(() => {
  for (const [userId, agents] of latest) {
    if (agents.some((a) => a.state === 'working')) pushRings(userId, agents, { force: true }).catch(() => {});
  }
}, 60_000).unref?.();
