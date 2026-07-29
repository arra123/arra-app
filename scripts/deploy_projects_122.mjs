import { createRequire } from "node:module";
import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
const require = createRequire("C:/Claude/Work/09_Sotrudniki/package.json");
const { Client } = require("ssh2");
const password = process.env.SERVER_122_PASSWORD;
if (!password) throw new Error("SERVER_122_PASSWORD is required");
const root = "C:/Claude/Tima/07_Appstore/scripts/_deploy122";
const archives = ["bem-box.tgz","cards.tgz","pvz.tgz","graflab-eu.tgz","graflab-extension.zip"];

function exec(conn, command) {
  return new Promise((resolve, reject) => conn.exec(command, (error, stream) => {
    if (error) return reject(error);
    let out = "";
    stream.on("data", c => out += c);
    stream.stderr.on("data", c => out += c);
    stream.on("close", code => code === 0 ? resolve(out) : reject(new Error(out || `exit ${code}`)));
  }));
}
function upload(sftp, local, remote) {
  return new Promise((resolve, reject) => {
    const input = createReadStream(local);
    const output = sftp.createWriteStream(remote, { mode: 0o600 });
    input.on("error", reject); output.on("error", reject); output.on("close", resolve); input.pipe(output);
  });
}
const b64 = value => Buffer.from(value).toString("base64");
const unit = (name, description, port, command) => `[Unit]\nDescription=${description}\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nWorkingDirectory=/opt/${name}\nEnvironmentFile=/opt/${name}/.env\nEnvironment=NODE_ENV=production\nEnvironment=HOST=127.0.0.1\nEnvironment=PORT=${port}\nExecStart=${command}\nRestart=always\nRestartSec=3\nUser=root\n\n[Install]\nWantedBy=multi-user.target\n`;
const caddyBlock = `\n# codex-managed projects-122\npvz.5.42.122.102.sslip.io {\n  encode zstd gzip\n  reverse_proxy 127.0.0.1:4101\n}\ncards.5.42.122.102.sslip.io {\n  encode zstd gzip\n  reverse_proxy 127.0.0.1:4102\n}\ngraflab.5.42.122.102.sslip.io {\n  encode zstd gzip\n  reverse_proxy 127.0.0.1:4103\n}\nbem-box.5.42.122.102.sslip.io {\n  encode zstd gzip\n  root * /var/www/bem-box\n  try_files {path} {path}/ /index.html\n  file_server\n}\nextension.5.42.122.102.sslip.io {\n  encode zstd gzip\n  root * /var/www/graflab-extension\n  file_server\n}\n`;

const conn = new Client();
await new Promise((resolve, reject) => conn.once("ready", resolve).once("error", reject).connect({host:"5.42.122.102",username:"root",password,readyTimeout:30000}));
try {
  const sftp = await new Promise((resolve, reject) => conn.sftp((e, s) => e ? reject(e) : resolve(s)));
  for (const name of archives) {
    const local = join(root, name); process.stdout.write(`Uploading ${name} (${Math.round(statSync(local).size/1048576)} MB)...\n`);
    await upload(sftp, local, `/tmp/${name}`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g,"-");
  await exec(conn, `set -e
mkdir -p /var/backups/projects-122/${stamp}
for d in /opt/cards /opt/pvz /opt/graflab-eu /var/www/bem-box /var/www/graflab-extension; do [ ! -e "$d" ] || cp -a "$d" /var/backups/projects-122/${stamp}/; done
rm -rf /opt/cards /opt/pvz /opt/graflab-eu /var/www/bem-box /var/www/graflab-extension
mkdir -p /opt/cards /opt/pvz /opt/graflab-eu /var/www/bem-box /var/www/graflab-extension
tar -xzf /tmp/cards.tgz -C /opt/cards
tar -xzf /tmp/pvz.tgz -C /opt/pvz
tar -xzf /tmp/graflab-eu.tgz -C /opt/graflab-eu
tar -xzf /tmp/bem-box.tgz -C /var/www/bem-box
cp /tmp/graflab-extension.zip /var/www/graflab-extension/graflab-extension.zip
printf '%s' '${b64('<!doctype html><meta charset="utf-8"><title>GRAFLAB Hub</title><style>body{font:16px system-ui;background:#111;color:#eee;display:grid;place-items:center;min-height:100vh}a{padding:14px 20px;background:#7048e8;color:white;border-radius:10px;text-decoration:none}</style><a href="graflab-extension.zip" download>Скачать GRAFLAB Hub</a>')}' | base64 -d > /var/www/graflab-extension/index.html
mkdir -p /opt/cards/output '/opt/cards/карточки'
cd /opt/cards && npm ci --omit=dev
cd /opt/pvz && npm ci --omit=dev
cd /opt/graflab-eu && npm ci && npm run build
printf '%s' '${b64(unit("cards","GRAFLAB Cards",4102,"/usr/bin/node /opt/cards/server.mjs"))}' | base64 -d > /etc/systemd/system/cards.service
printf '%s' '${b64(unit("pvz","PVZ analytics",4101,"/usr/bin/node /opt/pvz/server.mjs"))}' | base64 -d > /etc/systemd/system/pvz.service
printf '%s' '${b64(unit("graflab-eu","GRAFLAB Buds EU",4103,"/usr/bin/node /opt/graflab-eu/build/index.js"))}' | base64 -d > /etc/systemd/system/graflab-eu.service
cp /etc/caddy/Caddyfile /var/backups/projects-122/${stamp}/Caddyfile
sed -i '/# codex-managed projects-122/,$d' /etc/caddy/Caddyfile
printf '%s' '${b64(caddyBlock)}' | base64 -d >> /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now cards.service pvz.service graflab-eu.service
systemctl restart cards.service pvz.service graflab-eu.service caddy.service
sleep 5
curl -fsS http://127.0.0.1:4101/api/health
curl -fsS http://127.0.0.1:4102/api/health
curl -fsS -I http://127.0.0.1:4103/ | head -1
curl -fsS -I https://bem-box.5.42.122.102.sslip.io/ | head -1
curl -fsS -I https://extension.5.42.122.102.sslip.io/ | head -1
rm -f /tmp/bem-box.tgz /tmp/cards.tgz /tmp/pvz.tgz /tmp/graflab-eu.tgz /tmp/graflab-extension.zip`);
  console.log(`Backup: /var/backups/projects-122/${stamp}`);
  console.log("Projects deployed and health-checked");
} finally { conn.end(); }
