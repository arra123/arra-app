import { createHmac } from 'node:crypto';

const safeIdentity = (value) => String(value || '')
  .replace(/[^a-zA-Z0-9_-]/g, '')
  .slice(0, 80) || 'noda';

export function buildRtcConfig({
  userId,
  turnUrl = '',
  turnSecret = '',
  credentialTtlSeconds = 3600,
  nowSeconds = Math.floor(Date.now() / 1000),
} = {}) {
  const ttl = Math.max(300, Number(credentialTtlSeconds) || 3600);
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];

  if (turnUrl && turnSecret) {
    const username = `${nowSeconds + ttl}:${safeIdentity(userId)}`;
    const credential = createHmac('sha1', turnSecret).update(username).digest('base64');
    const urls = String(turnUrl).split(',').map((value) => value.trim()).filter(Boolean);
    if (urls.length) iceServers.push({ urls, username, credential });
  }

  return { iceServers, ttl, relay: iceServers.length > 2 };
}
