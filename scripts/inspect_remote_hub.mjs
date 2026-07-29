import { createRequire } from "node:module";

const require = createRequire("C:/Claude/Work/09_Sotrudniki/package.json");
const { Client } = require("ssh2");

const host = process.env.TARGET_SSH_HOST;
const password = process.env.TARGET_SSH_PASSWORD;
if (!host || !password) throw new Error("TARGET_SSH_HOST/TARGET_SSH_PASSWORD are required");

const command = [
  "hostname",
  "echo '--- NGINX FILES ---'",
  "grep -RIl 'server_name.*arratima.ru' /etc/nginx 2>/dev/null | sort -u",
  "echo '--- NGINX BLOCK ---'",
  "nginx -T 2>/dev/null | grep -n -B4 -A28 'server_name arratima.ru' | head -160",
  "echo '--- INDEXES ---'",
  "find /var/www /opt -maxdepth 5 -type f -name index.html -printf '%TY-%Tm-%Td %TH:%TM %s %p\\n' 2>/dev/null | sort -r | head -60",
  "echo '--- SERVICES ---'",
  "systemctl list-units --type=service --all 2>/dev/null | grep -Ei 'arra|hub|vpn' || true",
  "echo '--- PM2 ---'",
  "pm2 list 2>/dev/null || true",
].join("; ");

const conn = new Client();
await new Promise((resolve, reject) => {
  conn.once("ready", resolve).once("error", reject).connect({
    host, port: 22, username: "root", password, readyTimeout: 20000,
  });
});

try {
  await new Promise((resolve, reject) => {
    conn.exec(command, (error, stream) => {
      if (error) return reject(error);
      stream.on("data", (chunk) => process.stdout.write(chunk));
      stream.stderr.on("data", (chunk) => process.stderr.write(chunk));
      stream.on("close", (code) => code === 0 ? resolve() : reject(new Error(`remote exit ${code}`)));
    });
  });
} finally {
  conn.end();
}
