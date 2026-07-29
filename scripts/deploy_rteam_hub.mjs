import { createRequire } from "node:module";
import { createReadStream, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("C:/Claude/Work/09_Sotrudniki/package.json");
const { Client } = require("ssh2");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = process.env.RTEAM_SSH_HOST || "147.45.97.155";
const USER = process.env.RTEAM_SSH_USER || "root";
const PASSWORD = process.env.RTEAM_SSH_PASSWORD;
const BASE = "/var/www/rteam.ru";
const PREVIEW_HOST = "rteam.147.45.97.155.nip.io";

if (!PASSWORD) throw new Error("RTEAM_SSH_PASSWORD не задан");

function filesUnder(root) {
  const result = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else result.push({ local: full, rel: relative(root, full).replaceAll("\\", "/") });
    }
  };
  walk(root);
  return result;
}

function exec(conn, command) {
  return new Promise((resolvePromise, reject) => {
    conn.exec(command, (error, stream) => {
      if (error) return reject(error);
      let output = "";
      stream.on("data", (chunk) => { output += chunk; });
      stream.stderr.on("data", (chunk) => { output += chunk; });
      stream.on("close", (code) => code === 0 ? resolvePromise(output) : reject(new Error(output || `exit ${code}`)));
    });
  });
}

function upload(sftp, local, remote) {
  return new Promise((resolvePromise, reject) => {
    const input = createReadStream(local);
    const output = sftp.createWriteStream(remote, { mode: 0o644 });
    input.on("error", reject);
    output.on("error", reject);
    output.on("close", resolvePromise);
    input.pipe(output);
  });
}

const conn = new Client();
await new Promise((resolvePromise, reject) => {
  conn.once("ready", resolvePromise).once("error", reject).connect({
    host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 30000,
  });
});

try {
  const sftp = await new Promise((resolvePromise, reject) => conn.sftp((error, value) => error ? reject(error) : resolvePromise(value)));
  const publicFiles = filesUnder(join(ROOT, "design"));
  const apiFiles = ["server.mjs", "private.json", "config.json"].map((name) => ({
    local: join(ROOT, "hub-api", name), rel: name,
  }));

  await exec(conn, `mkdir -p ${BASE}/public ${BASE}/api`);
  for (const file of publicFiles) {
    const remote = `${BASE}/public/${file.rel}`;
    await exec(conn, `mkdir -p '${dirname(remote).replaceAll("\\", "/")}'`);
    await upload(sftp, file.local, remote);
  }
  for (const file of apiFiles) await upload(sftp, file.local, `${BASE}/api/${file.rel}`);

  const service = `[Unit]
Description=rteam.ru private hub API
After=network.target

[Service]
Type=simple
WorkingDirectory=${BASE}/api
Environment=HUB_PORT=4100
ExecStart=/usr/bin/node ${BASE}/api/server.mjs
Restart=always
RestartSec=3
User=www-data

[Install]
WantedBy=multi-user.target`;

  const nginx = `server {
    listen 80;
    listen [::]:80;
    server_name rteam.ru www.rteam.ru rteam.147.45.97.155.nip.io;
    root ${BASE}/public;
    index index.html;

    location /hub-api/ {
        proxy_pass http://127.0.0.1:4100/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}`;

  const encodedService = Buffer.from(service).toString("base64");
  const encodedNginx = Buffer.from(nginx).toString("base64");
  await exec(conn, `echo '${encodedService}' | base64 -d > /etc/systemd/system/rteam-hub.service`);
  await exec(conn, `echo '${encodedNginx}' | base64 -d > /etc/nginx/sites-available/rteam.ru`);
  await exec(conn, "ln -sfn /etc/nginx/sites-available/rteam.ru /etc/nginx/sites-enabled/rteam.ru");
  await exec(conn, `chown -R www-data:www-data ${BASE} && chmod 600 ${BASE}/api/config.json ${BASE}/api/private.json`);
  await exec(conn, "systemctl daemon-reload && systemctl enable rteam-hub.service >/dev/null && systemctl restart rteam-hub.service");
  await exec(conn, "for i in $(seq 1 20); do curl -fsS http://127.0.0.1:4100/health >/dev/null && exit 0; sleep 1; done; systemctl status rteam-hub.service --no-pager -l; exit 1");
  const nginxCheck = await exec(conn, "nginx -t 2>&1");
  await exec(conn, "systemctl reload nginx");
  await exec(conn, `if test -x /usr/bin/certbot && test -d /etc/letsencrypt/live/${PREVIEW_HOST}; then certbot --nginx -d ${PREVIEW_HOST} --non-interactive --redirect --reinstall >/dev/null; fi`);
  const health = await exec(conn, "curl -fsS http://127.0.0.1:4100/health");
  const page = await exec(conn, `curl -fsS https://${PREVIEW_HOST}/ | grep -o '<title>[^<]*' | head -1`);
  console.log(`Uploaded ${publicFiles.length} public files and ${apiFiles.length} API files`);
  console.log(nginxCheck.trim());
  console.log(`API ${health.trim()}`);
  console.log(`Page ${page.trim()}`);
} finally {
  conn.end();
}
