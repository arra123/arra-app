// Ждёт обработки сборки Apple и настраивает internal-тестирование:
// создаёт/находит внутреннюю группу, привязывает сборку, добавляет тестировщика.
import { execFileSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const KEY_ID = process.env.ASC_KEY_ID;
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const P8_PATH = process.env.ASC_P8_PATH;
const APP_ID = process.env.ASC_APP_ID || '6782562444';
const TESTER_EMAIL = process.env.TESTER_EMAIL || 'dane22334455@gmail.com';
const TESTER_FIRST = process.env.TESTER_FIRST || 'Danila';
const TESTER_LAST = process.env.TESTER_LAST || 'Aura';
const API = 'https://api.appstoreconnect.apple.com';

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: ISSUER_ID, iat: now, exp: now + 1000, aud: 'appstoreconnect-v1' }))}`;
  const s = createSign('SHA256'); s.update(input);
  return `${input}.${b64url(s.sign({ key: readFileSync(P8_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' }))}`;
}
let JWT = jwt();
function curl(method, path, body) {
  const args = ['-sS', '--globoff', '-X', method, `${API}${path}`,
    '-H', `Authorization: Bearer ${JWT}`, '-H', 'Content-Type: application/json',
    '-w', '\n%{http_code}', '--max-time', '60', '--retry', '5', '--retry-all-errors', '--retry-delay', '3'];
  if (body) { execFileSync('node', ['-e', "require('fs').writeFileSync('/tmp/_tf.json', process.argv[1])", JSON.stringify(body)]); args.push('--data', '@/tmp/_tf.json'); }
  const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const i = out.lastIndexOf('\n');
  return { code: Number(out.slice(i + 1).trim()), data: out.slice(0, i) ? JSON.parse(out.slice(0, i)) : null };
}
const sleep = (ms) => execFileSync('node', ['-e', `setTimeout(()=>{}, ${ms})`]);

async function main() {
  // 1) Ждём, пока сборка обработается (processingState=VALID)
  let build;
  for (let i = 0; i < 30; i++) {
    JWT = jwt();
    const r = curl('GET', `/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=1`);
    build = r.data?.data?.[0];
    const state = build?.attributes?.processingState;
    console.log(`[${i}] processingState=${state || '—'}`);
    if (state === 'VALID') break;
    if (state === 'FAILED' || state === 'INVALID') { console.error('Сборка не прошла обработку Apple'); process.exit(1); }
    sleep(30000);
  }
  if (!build) { console.error('Сборка не найдена'); process.exit(1); }
  const buildId = build.id;
  console.log('Build VALID:', buildId);

  // 2) Внутренняя группа
  JWT = jwt();
  const groups = curl('GET', `/v1/apps/${APP_ID}/betaGroups?limit=200`);
  let group = (groups.data?.data || []).find((g) => g.attributes.isInternalGroup);
  if (!group) {
    const created = curl('POST', '/v1/betaGroups', {
      data: { type: 'betaGroups', attributes: { name: 'Внутренние', isInternalGroup: true },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } } },
    });
    if (created.code >= 300) { console.error('Группа:', created.code, JSON.stringify(created.data?.errors)); process.exit(1); }
    group = created.data.data;
    console.log('Создана внутренняя группа:', group.id);
  } else {
    console.log('Внутренняя группа есть:', group.id);
  }

  // 3a) Авто-доступ ко всем сборкам (чтобы будущие билды появлялись сами)
  JWT = jwt();
  const patch = curl('PATCH', `/v1/betaGroups/${group.id}`, {
    data: { type: 'betaGroups', id: group.id, attributes: { hasAccessToAllBuilds: true } },
  });
  console.log('hasAccessToAllBuilds:', patch.code < 300 ? 'on' : JSON.stringify(patch.data?.errors));

  // 3b) Привязываем текущую сборку к группе (на случай, если авто-доступ недоступен)
  JWT = jwt();
  const link = curl('POST', `/v1/betaGroups/${group.id}/relationships/builds`, { data: [{ type: 'builds', id: buildId }] });
  console.log('Привязка сборки:', link.code < 300 ? 'ok' : JSON.stringify(link.data?.errors));

  // 4) Добавляем тестировщика
  JWT = jwt();
  const tester = curl('POST', '/v1/betaTesters', {
    data: { type: 'betaTesters', attributes: { email: TESTER_EMAIL, firstName: TESTER_FIRST, lastName: TESTER_LAST },
      relationships: { betaGroups: { data: [{ type: 'betaGroups', id: group.id }] } } },
  });
  if (tester.code < 300) console.log('Тестировщик добавлен:', TESTER_EMAIL);
  else console.log('Тестировщик:', tester.code, JSON.stringify(tester.data?.errors));

  console.log('DONE');
}
main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
