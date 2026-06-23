// Создаёт (или находит) запись приложения в App Store Connect и печатает её ascAppId.
import { execFileSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const KEY_ID = process.env.ASC_KEY_ID;
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const P8_PATH = process.env.ASC_P8_PATH;
const BUNDLE_ID = process.env.BUNDLE_ID || 'com.arratima.aura';
const NAME = process.env.APP_NAME || 'Aura';
const SKU = process.env.APP_SKU || 'aura-2026';
const API = 'https://api.appstoreconnect.apple.com';

function b64url(b) {
  return Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function jwt() {
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 1000, aud: 'appstoreconnect-v1' };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const s = createSign('SHA256');
  s.update(input);
  return `${input}.${b64url(s.sign({ key: readFileSync(P8_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' }))}`;
}
const JWT = jwt();

function curl(method, path, body) {
  const args = ['-sS', '--globoff', '-X', method, `${API}${path}`,
    '-H', `Authorization: Bearer ${JWT}`, '-H', 'Content-Type: application/json',
    '-w', '\n%{http_code}', '--max-time', '60', '--retry', '4', '--retry-all-errors', '--retry-delay', '2'];
  if (body) { execFileSync('node', ['-e', `require('fs').writeFileSync('/tmp/_app.json', process.argv[1])`, JSON.stringify(body)]); args.push('--data', '@/tmp/_app.json'); }
  const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const i = out.lastIndexOf('\n');
  return { code: Number(out.slice(i + 1).trim()), data: out.slice(0, i) ? JSON.parse(out.slice(0, i)) : null };
}

// 1) Уже есть?
const found = curl('GET', `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=10`);
if (found.code === 200 && found.data?.data?.length) {
  console.log('APP_ID=' + found.data.data[0].id);
  process.exit(0);
}

// 2) Нужен resource id зарегистрированного bundleId
const b = curl('GET', `/v1/bundleIds?filter[identifier]=${encodeURIComponent(BUNDLE_ID)}&limit=10`);
const bundleResId = b.data?.data?.find((x) => x.attributes.identifier === BUNDLE_ID)?.id;
if (!bundleResId) {
  console.error('Bundle ID не зарегистрирован, сперва запусти gen-ios-credentials.mjs');
  process.exit(1);
}

// 3) Создаём приложение
const create = curl('POST', '/v1/apps', {
  data: {
    type: 'apps',
    attributes: { name: NAME, primaryLocale: 'en-US', bundleId: BUNDLE_ID, sku: SKU },
    relationships: { bundleId: { data: { type: 'bundleIds', id: bundleResId } } },
  },
});
if (create.code >= 200 && create.code < 300) {
  console.log('APP_ID=' + create.data.data.id);
} else {
  console.error('CREATE FAILED', create.code, JSON.stringify(create.data?.errors || create.data));
  process.exit(1);
}
