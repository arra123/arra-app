// Генерация iOS-учёток (distribution cert + App Store provisioning profile)
// напрямую через App Store Connect API, чтобы EAS собрал неинтерактивно.
import { execFileSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const KEY_ID = process.env.ASC_KEY_ID;
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const P8_PATH = process.env.ASC_P8_PATH;
const BUNDLE_ID = process.env.BUNDLE_ID || 'com.aura.app';
const APP_NAME = 'Aura';
const P12_PASSWORD = 'aura-dist';

const dir = resolve(process.cwd(), 'credentials');
const API = 'https://api.appstoreconnect.apple.com';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function makeJWT() {
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 1000, aud: 'appstoreconnect-v1' };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = readFileSync(P8_PATH, 'utf8');
  const signer = createSign('SHA256');
  signer.update(signingInput);
  const sig = signer.sign({ key, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${b64url(sig)}`;
}

let JWT;
// Запросы через curl (Node fetch/undici нестабилен с Apple API из этой сети)
function curlOnce(method, path, body) {
  const args = ['-sS', '--globoff', '-X', method, `${API}${path}`,
    '-H', `Authorization: Bearer ${JWT}`,
    '-H', 'Content-Type: application/json',
    '-w', '\n%{http_code}', '--max-time', '60',
    '--retry', '4', '--retry-delay', '2', '--retry-all-errors'];
  if (body) {
    const tmp = resolve(dir, '_req.json');
    writeFileSync(tmp, JSON.stringify(body));
    args.push('--data', `@${tmp}`);
  }
  const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const idx = out.lastIndexOf('\n');
  const code = Number(out.slice(idx + 1).trim());
  const text = out.slice(0, idx);
  return { code, data: text ? JSON.parse(text) : null };
}

function apple(method, path, body) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const { code, data } = curlOnce(method, path, body);
      if (code < 200 || code >= 300) {
        throw new Error(`Apple ${method} ${path} -> ${code}: ${JSON.stringify(data?.errors || data)}`);
      }
      return data;
    } catch (e) {
      lastErr = e;
      const stderr = e.stderr ? e.stderr.toString() : '';
      console.log(`  [retry ${attempt}] ${method} ${path}: ${e.message.split('\n')[0]} ${stderr.slice(0, 120)}`);
      execFileSync('node', ['-e', 'setTimeout(()=>{}, 2500)']); // пауза
    }
  }
  throw lastErr;
}

async function main() {
  JWT = makeJWT();
  console.log('JWT ok');

  // 1) RSA-ключ + CSR
  const keyPath = resolve(dir, 'dist.key');
  const csrPath = resolve(dir, 'dist.csr');
  execFileSync('openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', csrPath, '-subj', `/CN=${APP_NAME} Distribution/O=${APP_NAME}/C=US`]);
  const csr = readFileSync(csrPath, 'utf8');
  console.log('CSR ok');

  // 2) Distribution certificate — сперва чистим старые IOS_DISTRIBUTION (избегаем лимита/дублей)
  const old = await apple('GET', '/v1/certificates?filter[certificateType]=IOS_DISTRIBUTION&limit=200');
  for (const c of old.data || []) {
    try {
      await apple('DELETE', `/v1/certificates/${c.id}`);
      console.log('Revoked old cert:', c.id);
    } catch (e) {
      console.log('skip revoke', c.id, e.message);
    }
  }

  let certId, certContent;
  const cert = await apple('POST', '/v1/certificates', {
    data: { type: 'certificates', attributes: { certificateType: 'IOS_DISTRIBUTION', csrContent: csr } },
  });
  certId = cert.data.id;
  certContent = cert.data.attributes.certificateContent;
  console.log('Certificate created:', certId);

  // DER -> PEM -> P12
  const derPath = resolve(dir, 'cert.der');
  const certPemPath = resolve(dir, 'cert.pem');
  const p12Path = resolve(dir, 'dist.p12');
  writeFileSync(derPath, Buffer.from(certContent, 'base64'));
  execFileSync('openssl', ['x509', '-inform', 'DER', '-in', derPath, '-out', certPemPath]);
  execFileSync('openssl', ['pkcs12', '-export', '-legacy', '-inkey', keyPath, '-in', certPemPath,
    '-out', p12Path, '-name', APP_NAME, '-passout', `pass:${P12_PASSWORD}`]);
  console.log('P12 ok');

  // 3) Bundle ID (создать, если нет)
  let bundleDbId;
  const existing = await apple('GET', `/v1/bundleIds?filter[identifier]=${encodeURIComponent(BUNDLE_ID)}&limit=200`);
  const found = (existing.data || []).find((b) => b.attributes.identifier === BUNDLE_ID);
  if (found) {
    bundleDbId = found.id;
    console.log('Bundle ID exists:', bundleDbId);
  } else {
    const created = await apple('POST', '/v1/bundleIds', {
      data: { type: 'bundleIds', attributes: { identifier: BUNDLE_ID, name: APP_NAME.replace(/[^A-Za-z0-9 ]/g, ''), platform: 'IOS' } },
    });
    bundleDbId = created.data.id;
    console.log('Bundle ID created:', bundleDbId);
  }

  // 4) App Store provisioning profile
  const profile = await apple('POST', '/v1/profiles', {
    data: {
      type: 'profiles',
      attributes: { name: `${APP_NAME} App Store`, profileType: 'IOS_APP_STORE' },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id: bundleDbId } },
        certificates: { data: [{ type: 'certificates', id: certId }] },
      },
    },
  });
  const profilePath = resolve(dir, 'profile.mobileprovision');
  writeFileSync(profilePath, Buffer.from(profile.data.attributes.profileContent, 'base64'));
  console.log('Profile ok');

  // 5) credentials.json для EAS
  writeFileSync(
    resolve(process.cwd(), 'credentials.json'),
    JSON.stringify(
      {
        ios: {
          provisioningProfilePath: 'credentials/profile.mobileprovision',
          distributionCertificate: { path: 'credentials/dist.p12', password: P12_PASSWORD },
        },
      },
      null,
      2,
    ),
  );
  console.log('DONE: credentials.json written');
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
