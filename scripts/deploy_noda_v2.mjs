import crypto from "node:crypto";
import { createRequire } from "node:module";
import { createReadStream, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("C:/Claude/Work/09_Sotrudniki/package.json");
const { Client } = require("ssh2");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL = join(ROOT, "noda-v2");
const REMOTE = "/var/www/arra";
const host = "5.42.102.133";
const password = process.env.ARRATIMA_SSH_PASSWORD;
if (!password) throw new Error("ARRATIMA_SSH_PASSWORD is required");

function collect(dir) {
  const files = [];
  const walk = (folder) => {
    for (const name of readdirSync(folder)) {
      const full = join(folder, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const rel = relative(dir, full).replaceAll("\\", "/");
        if (/^preview.*\.png$/i.test(rel) || rel === "README.md") continue;
        files.push({
          local: full,
          rel,
          sha256: crypto.createHash("sha256").update(readFileSync(full)).digest("hex"),
        });
      }
    }
  };
  walk(dir);
  return files;
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

const files = collect(LOCAL);
const conn = new Client();
await new Promise((resolvePromise, reject) => {
  conn.once("ready", resolvePromise).once("error", reject).connect({
    host,
    port: 22,
    username: "root",
    password,
    readyTimeout: 30000,
  });
});

try {
  const sftp = await new Promise((resolvePromise, reject) => conn.sftp((error, value) => error ? reject(error) : resolvePromise(value)));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `/var/backups/arra-hub/${stamp}`;
  await exec(conn, [
    `test "$(realpath -m '${REMOTE}')" = '${REMOTE}'`,
    `mkdir -p '${backup}'`,
    `for item in index.html app.css styles.css app.js projects.js favicon.svg assets brand fonts screens; do if [ -e '${REMOTE}/'$item ]; then cp -a '${REMOTE}/'$item '${backup}/'; fi; done`,
  ].join(" && "));

  const made = new Set();
  for (const file of files) {
    const remotePath = `${REMOTE}/${file.rel}`;
    const remoteDir = remotePath.slice(0, remotePath.lastIndexOf("/"));
    if (!made.has(remoteDir)) {
      await exec(conn, `mkdir -p '${remoteDir}'`);
      made.add(remoteDir);
    }
    await upload(sftp, file.local, remotePath);
  }
  await exec(conn, `chown -R www-data:www-data '${REMOTE}' && find '${REMOTE}' -type d -exec chmod 755 {} +`);

  const remoteHashes = await exec(conn, `sha256sum ${files.map((file) => `'${REMOTE}/${file.rel}'`).join(" ")}`);
  const hashByPath = new Map(remoteHashes.trim().split("\n").map((line) => {
    const [hash, filePath] = line.trim().split(/\s+/, 2);
    return [filePath, hash];
  }));
  const mismatches = files.filter((file) => hashByPath.get(`${REMOTE}/${file.rel}`) !== file.sha256);
  if (mismatches.length) throw new Error(`Hash mismatch: ${mismatches.map((file) => file.rel).join(", ")}`);

  const checks = await exec(conn, [
    "curl -fsS https://arratima.ru/ | grep -q 'styles.css?v=20260725-6'",
    "curl -fsS https://arratima.ru/assets/projects/arra-vpn-v3.png >/dev/null",
    "curl -fsS https://arratima.ru/assets/merchants/openai.png >/dev/null",
    "curl -fsS https://aura.5.42.122.102.sslip.io/health >/dev/null",
  ].join(" && "));
  console.log(`Backup: ${backup}`);
  console.log(`Uploaded and hash-verified: ${files.length} files`);
  console.log(`Health checks: ${checks.trim() || "ok"}`);
} finally {
  conn.end();
}
