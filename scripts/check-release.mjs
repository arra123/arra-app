// Read-only: verify the requested release, not just whichever old build is latest.
import crypto from 'node:crypto';
import fs from 'node:fs';

const expected = process.argv[2];
if (!expected) throw new Error('Usage: node scripts/check-release.mjs 2.0.1');
const now = Math.floor(Date.now() / 1000);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const body = encode({ alg: 'ES256', kid: '63Y56V3L2D', typ: 'JWT' }) + '.' +
  encode({ iss: '63274269-2c9e-473b-a82d-c8c68c3718ab', iat: now, exp: now + 600, aud: 'appstoreconnect-v1' });
const signature = crypto.sign('sha256', Buffer.from(body), {
  key: fs.readFileSync(new URL('../credentials/AuthKey_63Y56V3L2D.p8', import.meta.url)),
  dsaEncoding: 'ieee-p1363',
}).toString('base64url');
async function get(path) {
  const response = await fetch('https://api.appstoreconnect.apple.com' + path, {
    headers: { Authorization: 'Bearer ' + body + '.' + signature },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error('App Store Connect HTTP ' + response.status + ': ' + JSON.stringify(
      (error.errors || []).map(item => ({ code: item.code, detail: item.detail }))));
  }
  return response.json();
}
const payload = await get('/v1/builds?filter[app]=6782562444&sort=-uploadedDate&limit=30&include=preReleaseVersion&fields[builds]=version,processingState,uploadedDate,preReleaseVersion&fields[preReleaseVersions]=version');
const releases = new Map((payload.included || []).map(item => [item.id, item.attributes.version]));
const build = payload.data.find(item => releases.get(item.relationships?.preReleaseVersion?.data?.id) === expected);
if (!build) {
  console.log(JSON.stringify({ release: expected, uploaded: false }));
} else {
  // Apple does not support GET /builds/{id}/betaGroups. Read group -> builds.
  const groups = await get('/v1/betaGroups?filter[app]=6782562444&fields[betaGroups]=name,isInternalGroup');
  const memberships = [];
  for (const group of groups.data) {
    const builds = await get('/v1/betaGroups/' + group.id + '/builds?limit=200&fields[builds]=version');
    if (builds.data.some(item => item.id === build.id)) {
      memberships.push({ name: group.attributes.name, internal: group.attributes.isInternalGroup });
    }
  }
  console.log(JSON.stringify({ release: expected, build: build.attributes.version,
    processingState: build.attributes.processingState, uploadedDate: build.attributes.uploadedDate,
    groups: memberships }));
}
