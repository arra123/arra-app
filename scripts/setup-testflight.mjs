/**
 * Ensures that every processed iOS build is automatically available to the
 * existing internal TestFlight testers.
 *
 * Required env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_P8_PATH.
 * Optional env: ASC_APP_ID (defaults to Noda's App Store Connect id).
 */
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';

const KEY_ID = process.env.ASC_KEY_ID;
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const P8_PATH = process.env.ASC_P8_PATH;
const APP_ID = process.env.ASC_APP_ID || '6782562444';
const API = 'https://api.appstoreconnect.apple.com';

if (!KEY_ID || !ISSUER_ID || !P8_PATH) {
  console.error('Set ASC_KEY_ID, ASC_ISSUER_ID and ASC_P8_PATH before running this script.');
  process.exit(1);
}

const key = fs.readFileSync(P8_PATH, 'utf8');
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function token() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })}.${b64({
    iss: ISSUER_ID,
    iat: now,
    exp: now + 600,
    aud: 'appstoreconnect-v1',
  })}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), {
    key,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${unsigned}.${signature}`;
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok && response.status !== 409) {
    throw new Error(`${response.status}: ${JSON.stringify(body?.errors || body)}`);
  }
  return { status: response.status, body };
}

const groupResponse = await api(
  `/v1/betaGroups?filter[app]=${APP_ID}&limit=100&fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds`,
);
const internalGroups = (groupResponse.body?.data || []).filter((group) => group.attributes.isInternalGroup);
let automaticGroup = internalGroups.find((group) => group.attributes.hasAccessToAllBuilds);

if (!automaticGroup) {
  const created = await api('/v1/betaGroups', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'betaGroups',
        attributes: {
          name: 'Автообновления',
          isInternalGroup: true,
          hasAccessToAllBuilds: true,
        },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } },
      },
    }),
  });
  automaticGroup = created.body.data;
}

const testerIds = new Set();
for (const group of internalGroups) {
  const testers = await api(`/v1/betaGroups/${group.id}/betaTesters?limit=200&fields[betaTesters]=state`);
  for (const tester of testers.body?.data || []) testerIds.add(tester.id);
}

if (testerIds.size) {
  await api(`/v1/betaGroups/${automaticGroup.id}/relationships/betaTesters`, {
    method: 'POST',
    body: JSON.stringify({
      data: [...testerIds].map((id) => ({ type: 'betaTesters', id })),
    }),
  });
}

console.log(JSON.stringify({
  groupId: automaticGroup.id,
  groupName: automaticGroup.attributes.name,
  hasAccessToAllBuilds: automaticGroup.attributes.hasAccessToAllBuilds,
  testerCount: testerIds.size,
}, null, 2));
