import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { buildRtcConfig } from '../src/rtc.js';

const result = buildRtcConfig({
  userId: 'user/with unsafe chars',
  turnUrl: 'turn:5.42.122.102:3478?transport=udp, turn:5.42.122.102:3478?transport=tcp',
  turnSecret: 'unit-test-secret',
  credentialTtlSeconds: 3600,
  nowSeconds: 1_700_000_000,
});

assert.equal(result.relay, true);
assert.equal(result.ttl, 3600);
assert.equal(result.iceServers.length, 3);
assert.deepEqual(result.iceServers[2].urls, [
  'turn:5.42.122.102:3478?transport=udp',
  'turn:5.42.122.102:3478?transport=tcp',
]);
assert.equal(result.iceServers[2].username, '1700003600:userwithunsafechars');
assert.equal(
  result.iceServers[2].credential,
  createHmac('sha1', 'unit-test-secret').update(result.iceServers[2].username).digest('base64'),
);

const stunOnly = buildRtcConfig({ userId: 'user', credentialTtlSeconds: 10 });
assert.equal(stunOnly.relay, false);
assert.equal(stunOnly.ttl, 300);
assert.equal(stunOnly.iceServers.length, 2);

console.log(JSON.stringify({ ok: true, relay: result.relay, iceServers: result.iceServers.length }));
