// Добавляет свежую обработанную сборку в группу внутренних тестировщиков TestFlight.
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
function curl(method, path, body) {
  const args = ['-sS', '--globoff', '-X', method, `${API}${path}`, '-H', `Authorization: Bearer ${JWT}`, '-w', '\n%{http_code}', '--max-time', '60', '--retry', '4', '--retry-all-errors'];
  if (body) args.push('-H', 'Content-Type: application/json', '-d', JSON.stringify(body));
  const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 10485760 });
  const i = out.lastIndexOf('\n');
  return { code: Number(out.slice(i + 1).trim()), data: out.slice(0, i) ? JSON.parse(out.slice(0, i)) : null };
}

// последние сборки с версией (preReleaseVersion) и статусом
const r = curl('GET', `/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=8&include=preReleaseVersion`);
const incl = r.data?.included || [];
const verOf = (b) => incl.find((x) => x.id === b.relationships?.preReleaseVersion?.data?.id)?.attributes?.version || '?';
const builds = (r.data?.data || []).map((b) => ({ id: b.id, build: b.attributes.version, ver: verOf(b), state: b.attributes.processingState }));
console.log('Сборки:'); builds.forEach((b) => console.log(`  ${b.ver} (build ${b.build}) — ${b.state} — ${b.id}`));

const target = builds.find((b) => b.state === 'VALID');
if (!target) { console.log('Нет готовых (VALID) сборок — Apple ещё обрабатывает. Запусти позже.'); process.exit(2); }

// все внутренние группы
const groups = curl('GET', `/v1/apps/${APP_ID}/betaGroups?limit=50`).data?.data || [];
for (const g of groups) {
  if (!g.attributes.isInternalGroup) continue;
  const res = curl('POST', `/v1/betaGroups/${g.id}/relationships/builds`, { data: [{ type: 'builds', id: target.id }] });
  console.log(`Группа «${g.attributes.name}» (${g.id}): добавление build ${target.build} -> HTTP ${res.code}`, res.code >= 300 ? JSON.stringify(res.data) : 'OK');
}
console.log(`\nГотово. Версия ${target.ver} (build ${target.build}) добавлена в TestFlight. Обнови приложение на телефоне.`);
