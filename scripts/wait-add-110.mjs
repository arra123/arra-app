// Ждёт, пока Apple обработает сборку 1.1.0, и добавляет её в группу внутренних тестировщиков.
import { execFileSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const KEY_ID = process.env.ASC_KEY_ID, ISSUER_ID = process.env.ASC_ISSUER_ID, P8_PATH = process.env.ASC_P8_PATH;
const APP_ID = process.env.ASC_APP_ID || '6782562444';
const TARGET = process.env.TARGET_VERSION || '1.1.0';
const API = 'https://api.appstoreconnect.apple.com';
const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const inp = `${b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: ISSUER_ID, iat: now, exp: now + 1000, aud: 'appstoreconnect-v1' }))}`;
  const s = createSign('SHA256'); s.update(inp);
  return `${inp}.${b64url(s.sign({ key: readFileSync(P8_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' }))}`;
}
function curl(method, path, body) {
  const args = ['-sS', '--globoff', '-X', method, `${API}${path}`, '-H', `Authorization: Bearer ${jwt()}`, '-w', '\n%{http_code}', '--max-time', '60', '--retry', '5', '--retry-all-errors'];
  if (body) args.push('-H', 'Content-Type: application/json', '-d', JSON.stringify(body));
  try {
    const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 10485760 });
    const i = out.lastIndexOf('\n');
    return { code: Number(out.slice(i + 1).trim()), data: out.slice(0, i) ? JSON.parse(out.slice(0, i)) : null };
  } catch (e) { return { code: 0, data: null }; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let attempt = 1; attempt <= 30; attempt++) {
  const r = curl('GET', `/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=8&include=preReleaseVersion`);
  const incl = r.data?.included || [];
  const verOf = (b) => incl.find((x) => x.id === b.relationships?.preReleaseVersion?.data?.id)?.attributes?.version || '?';
  const found = (r.data?.data || []).map((b) => ({ id: b.id, build: b.attributes.version, ver: verOf(b), state: b.attributes.processingState }))
    .find((b) => b.ver === TARGET && b.state === 'VALID');
  if (found) {
    const groups = curl('GET', `/v1/apps/${APP_ID}/betaGroups?limit=50`).data?.data || [];
    for (const g of groups) {
      if (!g.attributes.isInternalGroup) continue;
      const res = curl('POST', `/v1/betaGroups/${g.id}/relationships/builds`, { data: [{ type: 'builds', id: found.id }] });
      console.log(`OK: ${TARGET} (build ${found.build}) добавлена в «${g.attributes.name}» -> HTTP ${res.code}`);
    }
    console.log(`ГОТОВО: версия ${TARGET} (build ${found.build}) доступна в TestFlight.`);
    process.exit(0);
  }
  console.log(`[${attempt}] ${TARGET} ещё обрабатывается Apple… жду 60с`);
  await sleep(60000);
}
console.log('Не дождался обработки за отведённое время — запусти scripts/add-latest-build.mjs позже.');
process.exit(1);
