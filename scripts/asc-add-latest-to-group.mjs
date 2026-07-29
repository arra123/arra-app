// Проверяет доступ последнего или указанного билда во внутренней бета-группе.
// Группы с hasAccessToAllBuilds уже получают новые билды автоматически; для
// остальных скрипт создаёт явную связь. Примеры:
//   node scripts/asc-add-latest-to-group.mjs
//   node scripts/asc-add-latest-to-group.mjs 83
import crypto from 'crypto';
import fs from 'fs';

const KEY_ID = '63Y56V3L2D';
const ISS = '63274269-2c9e-473b-a82d-c8c68c3718ab';
const APP = '6782562444';
const P8 = 'credentials/AuthKey_63Y56V3L2D.p8';
const TARGET_VERSION = process.argv[2] || null;
const MAX_ATTEMPTS = Number(process.env.ASC_MAX_ATTEMPTS || 30);

const pem = fs.readFileSync(P8, 'utf8');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function token() {
  const now = Math.floor(Date.now() / 1000);
  const data = b64u({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }) + '.' + b64u({ iss: ISS, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' });
  const sig = crypto.sign('SHA256', Buffer.from(data), { key: pem, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return data + '.' + sig;
}

const api = async (path, opts = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
        ...opts,
        headers: {
          Authorization: `Bearer ${token()}`,
          ...(opts.headers || {}),
        },
      });
      if (response.status < 500 || attempt === 4) return response;
      await response.arrayBuffer();
    } catch (error) {
      lastError = error;
      if (attempt === 4) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
  }
  throw lastError;
};

// 1. Последний загруженный билд — ждём, пока Apple закончит обработку (VALID)
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
let build = null;
let r;
let j;
for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
  const versionFilter = TARGET_VERSION ? `&filter[version]=${encodeURIComponent(TARGET_VERSION)}` : '';
  r = await api(`/v1/builds?filter[app]=${APP}${versionFilter}&sort=-uploadedDate&limit=10&fields[builds]=version,processingState`);
  j = await r.json();
  build = TARGET_VERSION
    ? (j.data || []).find((candidate) => candidate.attributes.version === TARGET_VERSION)
    : j.data?.[0];
  if (!build) {
    console.log(`Билд ${TARGET_VERSION || 'последний'} ещё не появился в App Store Connect`);
    if (attempt + 1 < MAX_ATTEMPTS) await sleep(30000);
    continue;
  }
  const st = build.attributes.processingState;
  console.log(`Билд ${build.attributes.version}: ${st}`);
  if (st === 'VALID') break;
  if (st === 'FAILED' || st === 'INVALID') { console.error('Обработка билда не удалась'); process.exit(1); }
  if (attempt + 1 < MAX_ATTEMPTS) await sleep(30000); // PROCESSING — ждём 30 с
}
if (!build || build.attributes.processingState !== 'VALID') {
  console.error(`Билд ${TARGET_VERSION || 'последний'} не стал доступен за отведённое время`);
  process.exit(1);
}

// 2. Группа «Внутренние»
r = await api(`/v1/betaGroups?filter[app]=${APP}&fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds`);
j = await r.json();
const group = (j.data || []).find((g) => g.attributes.isInternalGroup) || j.data?.[0];
if (!group) { console.error('Бета-группа не найдена'); process.exit(1); }

if (group.attributes.hasAccessToAllBuilds) {
  console.log(`✔ Билд ${build.attributes.version} доступен группе «${group.attributes.name}» через режим «все билды»`);
  process.exit(0);
}

// 3. Проверить связь до POST: повторное назначение Apple может вернуть 422,
// хотя билд уже виден нужной группе.
r = await api(`/v1/builds/${build.id}/betaGroups?fields[betaGroups]=name,isInternalGroup&limit=200`);
j = await r.json();
const alreadyAssigned = (j.data || []).some((candidate) => candidate.id === group.id);
if (alreadyAssigned) {
  console.log(`✔ Билд ${build.attributes.version} уже доступен группе «${group.attributes.name}»`);
  process.exit(0);
}

// 4. Добавить билд в группу.
r = await api(`/v1/betaGroups/${group.id}/relationships/builds`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: [{ type: 'builds', id: build.id }] }),
});
if (r.status === 204) {
  console.log(`✔ Билд ${build.attributes.version} добавлен в группу «${group.attributes.name}»`);
} else {
  console.error(`Статус ${r.status}: ${await r.text()}`);
  process.exit(1);
}
