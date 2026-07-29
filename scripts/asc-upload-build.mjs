import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const KEY_ID = '63Y56V3L2D';
const ISSUER_ID = '63274269-2c9e-473b-a82d-c8c68c3718ab';
const APP_ID = '6782562444';
const KEY_PATH = 'credentials/AuthKey_63Y56V3L2D.p8';
const API_BASE = 'https://api.appstoreconnect.apple.com';

const [ipaArgument, shortVersion, buildVersion] = process.argv.slice(2);
if (!ipaArgument || !shortVersion || !buildVersion) {
  console.error('Usage: node scripts/asc-upload-build.mjs <ipa> <short-version> <build-version>');
  process.exit(2);
}

const ipaPath = path.resolve(ipaArgument);
const ipaName = path.basename(ipaPath);
const ipa = fs.readFileSync(ipaPath);
const key = fs.readFileSync(KEY_PATH, 'utf8');

const base64Url = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

function createToken() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = [
    base64Url({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }),
    base64Url({
      iss: ISSUER_ID,
      iat: now,
      exp: now + 600,
      aud: 'appstoreconnect-v1',
    }),
  ].join('.');
  const signature = crypto
    .sign('SHA256', Buffer.from(unsigned), {
      key,
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64url');
  return `${unsigned}.${signature}`;
}

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(endpoint, options = {}, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${createToken()}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : null;
      if (!response.ok) {
        const details = (body?.errors || [])
          .map((error) =>
            [error.status, error.code, error.title, error.detail]
              .filter(Boolean)
              .join(' — '),
          )
          .join('\n');
        throw new Error(
          `App Store Connect ${response.status} ${response.statusText}${
            details ? `\n${details}` : ''
          }`,
        );
      }
      return body;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

async function uploadPart(operation, partNumber) {
  const offset = Number(operation.offset);
  const length = Number(operation.length);
  const body = ipa.subarray(offset, offset + length);
  const headers = Object.fromEntries(
    (operation.requestHeaders || []).map(({ name, value }) => [name, value]),
  );

  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(operation.url, {
        method: operation.method,
        headers,
        body,
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      console.log(
        `Часть ${partNumber}: загружено ${Math.round(length / 1024)} КиБ`,
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 4) break;
      console.log(`Часть ${partNumber}: повтор ${attempt + 1}/4`);
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`Не удалось загрузить часть ${partNumber}: ${lastError}`);
}

const existing = await request(
  `/v1/apps/${APP_ID}/buildUploads?filter[cfBundleShortVersionString]=${encodeURIComponent(
    shortVersion,
  )}&filter[cfBundleVersion]=${encodeURIComponent(
    buildVersion,
  )}&filter[platform]=IOS&limit=10`,
);

const activeUpload = (existing.data || []).find(({ attributes }) =>
  ['AWAITING_UPLOAD', 'PROCESSING', 'COMPLETE'].includes(
    attributes?.state?.state,
  ),
);

if (activeUpload) {
  const state = activeUpload.attributes.state.state;
  console.log(
    `App Store Connect уже содержит загрузку ${shortVersion} (${buildVersion}): ${state}`,
  );
  process.exit(state === 'COMPLETE' || state === 'PROCESSING' ? 0 : 3);
}

console.log(
  `Создаю прямую загрузку ${ipaName}: ${Math.round(ipa.length / 1024)} КиБ`,
);

const buildUpload = await request('/v1/buildUploads', {
  method: 'POST',
  body: JSON.stringify({
    data: {
      type: 'buildUploads',
      attributes: {
        cfBundleShortVersionString: shortVersion,
        cfBundleVersion: buildVersion,
        platform: 'IOS',
      },
      relationships: {
        app: {
          data: { type: 'apps', id: APP_ID },
        },
      },
    },
  }),
});

const uploadId = buildUpload.data.id;
const fileReservation = await request('/v1/buildUploadFiles', {
  method: 'POST',
  body: JSON.stringify({
    data: {
      type: 'buildUploadFiles',
      attributes: {
        assetType: 'ASSET',
        fileName: ipaName,
        fileSize: ipa.length,
        uti: 'com.apple.ipa',
      },
      relationships: {
        buildUpload: {
          data: { type: 'buildUploads', id: uploadId },
        },
      },
    },
  }),
});

const fileId = fileReservation.data.id;
const operations = fileReservation.data.attributes.uploadOperations || [];
console.log(`Apple зарезервировал частей: ${operations.length}`);

for (let index = 0; index < operations.length; index += 3) {
  const batch = operations.slice(index, index + 3);
  await Promise.all(
    batch.map((operation, batchIndex) =>
      uploadPart(operation, index + batchIndex + 1),
    ),
  );
}

const checksum = crypto.createHash('md5').update(ipa).digest('hex');
await request(`/v1/buildUploadFiles/${fileId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    data: {
      type: 'buildUploadFiles',
      id: fileId,
      attributes: {
        uploaded: true,
        sourceFileChecksums: {
          composite: {
            algorithm: 'MD5',
            hash: checksum,
          },
        },
      },
    },
  }),
});

const result = await request(
  `/v1/buildUploads/${uploadId}?fields[buildUploads]=cfBundleShortVersionString,cfBundleVersion,state,platform,createdDate,uploadedDate`,
);
const state = result.data.attributes.state;
console.log(`Загрузка передана Apple: ${state.state}`);
for (const detail of [
  ...(state.errors || []),
  ...(state.warnings || []),
  ...(state.infos || []),
]) {
  console.log(
    [detail.severity, detail.code, detail.message].filter(Boolean).join(' — '),
  );
}
