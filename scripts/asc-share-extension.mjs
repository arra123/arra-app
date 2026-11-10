// The share extension's App ID and (once its app group is ticked in the
// developer portal) its App Store profile, through the App Store Connect API.
//   node scripts/asc-share-extension.mjs id        register the App ID, turn App Groups on
//   node scripts/asc-share-extension.mjs profile   make credentials/share.mobileprovision
import { execFileSync } from 'node:child_process';
import { createSign, X509Certificate } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const KEY_ID = '63Y56V3L2D';
const ISSUER = '63274269-2c9e-473b-a82d-c8c68c3718ab';
const BUNDLE = 'com.arratima.aura.share-extension';
const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }))}`;
  const s = createSign('SHA256');
  s.update(input);
  return `${input}.${b64url(s.sign({ key: readFileSync(`credentials/AuthKey_${KEY_ID}.p8`, 'utf8'), dsaEncoding: 'ieee-p1363' }))}`;
}
const token = jwt();
function api(method, path, body) {
  const args = ['-sS', '--globoff', '-X', method, `https://api.appstoreconnect.apple.com${path}`, '-H', `Authorization: Bearer ${token}`,
    '-H', 'Content-Type: application/json', '-w', '\n%{http_code}', '--max-time', '60', '--retry', '3', '--retry-all-errors'];
  if (body) args.push('--data', JSON.stringify(body));
  const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const i = out.lastIndexOf('\n');
  const code = Number(out.slice(i + 1));
  const data = out.slice(0, i) ? JSON.parse(out.slice(0, i)) : null;
  if (code >= 300) throw new Error(`${method} ${path} -> ${code}: ${JSON.stringify(data?.errors?.map((e) => e.detail) || data)}`);
  return data;
}
async function bundleId() {
  const found = api('GET', `/v1/bundleIds?filter[identifier]=${BUNDLE}&limit=5`).data.find((b) => b.attributes.identifier === BUNDLE);
  if (found) return found.id;
  return api('POST', '/v1/bundleIds', { data: { type: 'bundleIds', attributes: { identifier: BUNDLE, name: 'Arra Share Extension', platform: 'IOS' } } }).data.id;
}
const what = process.argv[2];
const id = await bundleId();
if (what === 'id') {
  const caps = api('GET', `/v1/bundleIds/${id}/bundleIdCapabilities`).data.map((c) => c.attributes.capabilityType);
  if (!caps.includes('APP_GROUPS')) {
    api('POST', '/v1/bundleIdCapabilities', { data: { type: 'bundleIdCapabilities', attributes: { capabilityType: 'APP_GROUPS' }, relationships: { bundleId: { data: { type: 'bundleIds', id } } } } });
  }
  console.log(`app id ${BUNDLE}: registered, App Groups on (${id})`);
} else if (what === 'profile') {
  const serial = new X509Certificate(readFileSync('credentials/cert.pem')).serialNumber.toUpperCase();
  const cert = api('GET', '/v1/certificates?limit=50').data.find((c) => (c.attributes.serialNumber || '').toUpperCase() === serial);
  if (!cert) throw new Error('distribution certificate not found in App Store Connect');
  const name = `Arra Share AppStore ${new Date().toISOString().slice(0, 10)}`;
  const p = api('POST', '/v1/profiles', { data: { type: 'profiles', attributes: { name, profileType: 'IOS_APP_STORE' },
    relationships: { bundleId: { data: { type: 'bundleIds', id } }, certificates: { data: [{ type: 'certificates', id: cert.id }] } } } });
  writeFileSync('credentials/share.mobileprovision', Buffer.from(p.data.attributes.profileContent, 'base64'));
  console.log('credentials/share.mobileprovision written: ' + name);
} else {
  console.log('usage: id | profile');
}
