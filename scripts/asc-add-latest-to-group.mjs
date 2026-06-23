// Добавляет последний загруженный билд в бета-группу «Внутренние».
// eas submit заливает билд в App Store Connect, но НЕ кладёт его в группу тестировщиков —
// без этого билд не виден в TestFlight. Запускать после каждого `eas submit`:
//   node scripts/asc-add-latest-to-group.mjs
import crypto from 'crypto';
import fs from 'fs';

const KEY_ID = '63Y56V3L2D';
const ISS = '63274269-2c9e-473b-a82d-c8c68c3718ab';
const APP = '6782562444';
const P8 = 'credentials/AuthKey_63Y56V3L2D.p8';

const pem = fs.readFileSync(P8, 'utf8');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function token() {
  const now = Math.floor(Date.now() / 1000);
  const data = b64u({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }) + '.' + b64u({ iss: ISS, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' });
  const sig = crypto.sign('SHA256', Buffer.from(data), { key: pem, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return data + '.' + sig;
}

const H = { Authorization: `Bearer ${token()}` };
const api = async (path, opts = {}) => fetch(`https://api.appstoreconnect.apple.com${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });

// 1. Последний загруженный билд — ждём, пока Apple закончит обработку (VALID)
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
let build = null;
let r;
let j;
for (let attempt = 0; attempt < 30; attempt++) {
  r = await api(`/v1/builds?filter[app]=${APP}&sort=-uploadedDate&limit=1&fields[builds]=version,processingState`);
  j = await r.json();
  build = j.data?.[0];
  if (!build) { console.error('Билды не найдены'); process.exit(1); }
  const st = build.attributes.processingState;
  console.log(`Билд ${build.attributes.version}: ${st}`);
  if (st === 'VALID') break;
  if (st === 'FAILED' || st === 'INVALID') { console.error('Обработка билда не удалась'); process.exit(1); }
  await sleep(30000); // PROCESSING — ждём 30 с
}

// 2. Группа «Внутренние»
r = await api(`/v1/betaGroups?filter[app]=${APP}&fields[betaGroups]=name,isInternalGroup`);
j = await r.json();
const group = (j.data || []).find((g) => g.attributes.isInternalGroup) || j.data?.[0];
if (!group) { console.error('Бета-группа не найдена'); process.exit(1); }

// 3. Добавить билд в группу (идемпотентно)
r = await api(`/v1/betaGroups/${group.id}/relationships/builds`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: [{ type: 'builds', id: build.id }] }),
});
if (r.status === 204) console.log(`✔ Билд ${build.attributes.version} добавлен в группу «${group.attributes.name}»`);
else console.log(`Статус ${r.status}: ${await r.text()}`);
