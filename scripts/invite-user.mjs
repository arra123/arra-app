// Приглашает пользователя в команду App Store Connect (для internal-тестирования под своим Apple ID).
import { execFileSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const KEY_ID = process.env.ASC_KEY_ID;
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const P8_PATH = process.env.ASC_P8_PATH;
const EMAIL = process.env.INVITE_EMAIL;
const FIRST = process.env.INVITE_FIRST || 'Tima';
const LAST = process.env.INVITE_LAST || 'Aura';
const API = 'https://api.appstoreconnect.apple.com';

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const input = `${b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: ISSUER_ID, iat: now, exp: now + 1000, aud: 'appstoreconnect-v1' }))}`;
const sgn = createSign('SHA256'); sgn.update(input);
const JWT = `${input}.${b64url(sgn.sign({ key: readFileSync(P8_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' }))}`;

function curl(method, path, body) {
  const args = ['-sS', '--globoff', '-X', method, `${API}${path}`,
    '-H', `Authorization: Bearer ${JWT}`, '-H', 'Content-Type: application/json',
    '-w', '\n%{http_code}', '--max-time', '60', '--retry', '4', '--retry-all-errors', '--retry-delay', '2'];
  if (body) { execFileSync('node', ['-e', "require('fs').writeFileSync('/tmp/_inv.json', process.argv[1])", JSON.stringify(body)]); args.push('--data', '@/tmp/_inv.json'); }
  const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const i = out.lastIndexOf('\n');
  return { code: Number(out.slice(i + 1).trim()), data: out.slice(0, i) ? JSON.parse(out.slice(0, i)) : null };
}

// Уже приглашён / уже в команде?
const inv = curl('GET', `/v1/userInvitations?filter[email]=${encodeURIComponent(EMAIL)}&limit=10`);
if (inv.data?.data?.length) { console.log('Приглашение уже отправлено ранее:', EMAIL); process.exit(0); }
const users = curl('GET', `/v1/users?filter[username]=${encodeURIComponent(EMAIL)}&limit=10`);
if (users.data?.data?.length) { console.log('Пользователь уже в команде:', EMAIL); process.exit(0); }

const r = curl('POST', '/v1/userInvitations', {
  data: {
    type: 'userInvitations',
    attributes: { email: EMAIL, firstName: FIRST, lastName: LAST, roles: ['APP_MANAGER'], allAppsVisible: true, provisioningAllowed: true },
  },
});
if (r.code >= 200 && r.code < 300) console.log('Приглашение отправлено на', EMAIL);
else { console.error('FAILED', r.code, JSON.stringify(r.data?.errors || r.data)); process.exit(1); }
