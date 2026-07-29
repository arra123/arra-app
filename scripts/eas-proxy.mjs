import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const sourceConfig = path.join(
  process.env.APPDATA || '',
  'com.arra.vpn',
  'ARRA VPN',
  'sing-box.json',
);
const singBox = 'C:\\Program Files\\ARRA VPN\\sing-box.exe';
const runtimeDir = path.join(os.tmpdir(), 'noda-eas-proxy');
const runtimeConfig = path.join(runtimeDir, 'sing-box.json');
const pidFile = path.join(runtimeDir, 'sing-box.pid');
const proxyPort = 17897;

function waitForPort(port, timeoutMs = 15_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Proxy did not open port ${port}`));
          return;
        }
        setTimeout(tryConnect, 250);
      });
    };
    tryConnect();
  });
}

function stop() {
  if (!fs.existsSync(pidFile)) return;
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid);
    } catch {
      // The helper has already stopped.
    }
  }
  fs.rmSync(runtimeDir, { recursive: true, force: true });
}

async function start() {
  stop();
  const config = JSON.parse(fs.readFileSync(sourceConfig, 'utf8'));

  config.log = { level: 'warn', timestamp: false };
  config.inbounds = [{
    type: 'mixed',
    tag: 'eas-proxy',
    listen: '127.0.0.1',
    listen_port: proxyPort,
  }];
  config.route = {
    ...config.route,
    rules: [{ inbound: ['eas-proxy'], outbound: 'proxy' }],
    final: 'proxy',
    auto_detect_interface: true,
  };
  if (config.experimental?.clash_api) {
    config.experimental.clash_api.external_controller = '127.0.0.1:19095';
  }

  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(runtimeConfig, JSON.stringify(config));

  const child = spawn(singBox, ['run', '-c', runtimeConfig], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  fs.writeFileSync(pidFile, String(child.pid));

  try {
    await waitForPort(proxyPort);
  } catch (error) {
    stop();
    throw error;
  }

  process.stdout.write(`http://127.0.0.1:${proxyPort}`);
}

const command = process.argv[2];
if (command === 'start') {
  await start();
} else if (command === 'stop') {
  stop();
} else {
  throw new Error('Usage: node scripts/eas-proxy.mjs <start|stop>');
}
