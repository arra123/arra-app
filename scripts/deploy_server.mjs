// Заливка бэкенда Aura на сервер приложений: файлы по SFTP, миграции, рестарт сервиса.
// Запуск: node scripts/deploy_server.mjs [относительные пути внутри server/ ...]
// Без аргументов заливает весь server/src и server/migrations.

import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, resolve } from "node:path";

const require = createRequire("C:/Claude/Work/09_Sotrudniki/package.json");
const { Client } = require("ssh2");

const ROOT = resolve(import.meta.dirname, "..");
const LOCAL = join(ROOT, "server");
const REMOTE = "/opt/aura";

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);

const host = env.APP_SERVER_HOST;
const username = env.APP_SERVER_USER || "root";
const password = env.APP_SERVER_PASSWORD;
if (!host || !password) throw new Error("В .env нет APP_SERVER_HOST/APP_SERVER_PASSWORD");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const args = process.argv.slice(2);
const files = args.length
  ? args.map((item) => resolve(ROOT, item))
  : [...walk(join(LOCAL, "src")), ...walk(join(LOCAL, "migrations"))];

const conn = new Client();
const exec = (command) => new Promise((ok, fail) => conn.exec(command, (error, stream) => {
  if (error) return fail(error);
  let out = "";
  stream.on("data", (chunk) => { out += chunk; });
  stream.stderr.on("data", (chunk) => { out += chunk; });
  stream.on("close", (code) => (code === 0 ? ok(out) : fail(new Error(out || `exit ${code}`))));
}));

conn.on("ready", async () => {
  const sftp = await new Promise((ok, fail) => conn.sftp((error, handle) => (error ? fail(error) : ok(handle))));
  const put = (local, remote) => new Promise((ok, fail) => sftp.fastPut(local, remote, (error) => (error ? fail(error) : ok())));

  for (const file of files) {
    const rel = posix.join(...relative(LOCAL, file).split(/[\\/]/));
    const target = `${REMOTE}/${rel}`;
    await exec(`mkdir -p "$(dirname ${target})"`);
    await put(file, target);
    console.log(`→ ${rel}`);
  }

  console.log(await exec(`cd ${REMOTE} && npm run migrate 2>&1 | tail -5`));
  await exec("systemctl restart aura");
  await new Promise((ok) => setTimeout(ok, 1500));
  console.log(await exec("systemctl is-active aura && curl -s -o /dev/null -w 'health %{http_code}\\n' http://127.0.0.1:4000/health"));
  conn.end();
})
  .on("keyboard-interactive", (name, instructions, lang, prompts, finish) => finish(prompts.map(() => password)))
  .connect({ host, username, password, tryKeyboard: true, readyTimeout: 20000 });
