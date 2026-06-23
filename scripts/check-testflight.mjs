import { execFileSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const KEY_ID = process.env.ASC_KEY_ID, ISSUER_ID = process.env.ASC_ISSUER_ID, P8_PATH = process.env.ASC_P8_PATH;
const APP_ID = process.env.ASC_APP_ID || '6782562444';
const API = 'https://api.appstoreconnect.apple.com';
const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const inp = `${b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: ISSUER_ID, iat: now, exp: now + 1000, aud: 'appstoreconnect-v1' }))}`;
const s = createSign('SHA256'); s.update(inp);
const JWT = `${inp}.${b64url(s.sign({ key: readFileSync(P8_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' }))}`;
function curl(method, path) {
  const out = execFileSync('curl', ['-sS', '--globoff', '-X', method, `${API}${path}`, '-H', `Authorization: Bearer ${JWT}`, '-w', '\n%{http_code}', '--max-time', '60', '--retry', '4', '--retry-all-errors'], { encoding: 'utf8', maxBuffer: 10485760 });
  const i = out.lastIndexOf('\n');
  return { code: Number(out.slice(i + 1).trim()), data: out.slice(0, i) ? JSON.parse(out.slice(0, i)) : null };
}

const builds = curl('GET', `/v1/builds?filter[app]=${APP_ID}&sort=-version&limit=1&include=buildBetaDetail,betaGroups`);
const b = builds.data?.data?.[0];
console.log('BUILD', b?.id, JSON.stringify(b?.attributes, null, 2));
const detail = (builds.data?.included || []).find((x) => x.type === 'buildBetaDetails');
console.log('BETA DETAIL', JSON.stringify(detail?.attributes, null, 2));

const groups = curl('GET', `/v1/apps/${APP_ID}/betaGroups?limit=50`);
for (const g of groups.data?.data || []) {
  console.log('GROUP', g.id, JSON.stringify(g.attributes));
  const testers = curl('GET', `/v1/betaGroups/${g.id}/betaTesters?limit=50`);
  for (const t of testers.data?.data || []) console.log('  TESTER', t.attributes.email, 'state=', t.attributes.state, 'inviteType=', t.attributes.inviteType);
  const bg = curl('GET', `/v1/betaGroups/${g.id}/builds?limit=10`);
  console.log('  BUILDS in group:', (bg.data?.data || []).map((x) => x.id).join(', ') || 'none');
}
