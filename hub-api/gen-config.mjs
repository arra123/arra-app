/* Генерация config.json для hub-api.
   Использование: node gen-config.mjs <login> <password> [tokenTtlHours]
   Печатает config.json в stdout (перенаправь в файл). Секрет и соль — случайные. */

import crypto from "node:crypto";
import fs from "node:fs";

const [, , login, password, ttl, outputPath] = process.argv;
if (!login || !password) {
  console.error("Использование: node gen-config.mjs <login> <password> [tokenTtlHours]");
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
const passHash = crypto.scryptSync(password, salt, 64).toString("hex");
const secret = crypto.randomBytes(48).toString("hex");

const config = {
  login,
  salt,
  passHash,
  secret,
  tokenTtlHours: ttl ? Number(ttl) : 12,
};

const payload = JSON.stringify(config, null, 2) + "\n";
if (outputPath) {
  fs.writeFileSync(outputPath, payload, { mode: 0o600 });
  process.stdout.write("Конфигурация входа создана: " + outputPath + "\n");
} else {
  process.stdout.write(payload);
}
