/* ============================================================
   Arra Hub API — вход в приватный режим и выдача секретов.
   Один файл, без внешних зависимостей (только ядро Node).
   Слушает 127.0.0.1:PORT, nginx проксирует /hub-api/ → сюда.

   Безопасность:
   - пароль хранится как scrypt-хеш + соль в config.json (не в git);
   - токен — HMAC-SHA256(payload) с серверным секретом, с TTL;
   - rate-limit по IP: блок после N неудачных попыток;
   - приватные данные (private.json) отдаются только по валидному токену;
   - постоянное по времени сравнение (timingSafeEqual) против тайминг-атак.
   ============================================================ */

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.HUB_DATA_DIR || __dirname;
const PORT = Number(process.env.HUB_PORT || 4100);

const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const PRIVATE_PATH = path.join(DATA_DIR, "private.json");

function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { return fallback; }
}

let config = loadJSON(CONFIG_PATH, null);
if (!config || !config.login || !config.passHash || !config.salt || !config.secret) {
  console.error("[hub-api] Нет валидного config.json (login, passHash, salt, secret). Останов.");
  process.exit(1);
}
const TOKEN_TTL_MS = (config.tokenTtlHours || 12) * 3600 * 1000;

// ---------- rate-limit ----------
const attempts = new Map(); // ip -> { count, first, lockUntil }
const MAX_ATTEMPTS = 6;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

function rlCheck(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a) return { ok: true };
  if (a.lockUntil && a.lockUntil > now) {
    return { ok: false, retryMs: a.lockUntil - now };
  }
  if (a.first && now - a.first > WINDOW_MS) { attempts.delete(ip); return { ok: true }; }
  return { ok: true };
}
function rlFail(ip) {
  const now = Date.now();
  let a = attempts.get(ip);
  if (!a || (a.first && now - a.first > WINDOW_MS)) a = { count: 0, first: now, lockUntil: 0 };
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) a.lockUntil = now + LOCK_MS;
  attempts.set(ip, a);
}
function rlReset(ip) { attempts.delete(ip); }

// периодическая чистка карты
setInterval(() => {
  const now = Date.now();
  for (const [ip, a] of attempts) {
    if ((!a.lockUntil || a.lockUntil < now) && a.first && now - a.first > WINDOW_MS) attempts.delete(ip);
  }
}, 5 * 60 * 1000).unref();

// ---------- пароль / токен ----------
function verifyPassword(login, password) {
  if (typeof login !== "string" || typeof password !== "string") return false;
  const loginOk = safeEqualStr(login, config.login);
  let passOk = false;
  try {
    const derived = crypto.scryptSync(password, config.salt, 64);
    const stored = Buffer.from(config.passHash, "hex");
    passOk = stored.length === derived.length && crypto.timingSafeEqual(stored, derived);
  } catch (e) { passOk = false; }
  return loginOk && passOk;
}

function safeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // всё равно тратим время, чтобы не палить длину по таймингу
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function signToken() {
  const payload = b64url(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS }));
  const sig = b64url(crypto.createHmac("sha256", config.secret).update(payload).digest());
  return payload + "." + sig;
}
function verifyToken(token) {
  if (typeof token !== "string" || token.indexOf(".") < 0) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expect = b64url(crypto.createHmac("sha256", config.secret).update(payload).digest());
  const sb = Buffer.from(sig), eb = Buffer.from(expect);
  if (sb.length !== eb.length || !crypto.timingSafeEqual(sb, eb)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return data.exp && data.exp > Date.now();
  } catch (e) { return false; }
}

// ---------- http ----------
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.socket.remoteAddress || "?";
}
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}
function readBody(req, limit = 4096) {
  return new Promise((resolve) => {
    let data = "", tooBig = false;
    req.on("data", (c) => {
      data += c;
      if (data.length > limit) { tooBig = true; req.destroy(); }
    });
    req.on("end", () => resolve(tooBig ? null : data));
    req.on("error", () => resolve(null));
  });
}

const server = http.createServer(async (req, res) => {
  // nginx проксирует со срезанием /hub-api → сюда приходят /login, /projects
  const url = (req.url || "/").split("?")[0].replace(/\/+$/, "") || "/";
  const ip = clientIp(req);

  if (req.method === "POST" && url === "/login") {
    const rl = rlCheck(ip);
    if (!rl.ok) return send(res, 429, { error: "Слишком много попыток. Подожди " + Math.ceil(rl.retryMs / 60000) + " мин." });
    const raw = await readBody(req);
    if (raw === null) return send(res, 400, { error: "Некорректный запрос." });
    let creds;
    try { creds = JSON.parse(raw); } catch (e) { return send(res, 400, { error: "Некорректный запрос." }); }
    if (verifyPassword((creds.login || "").trim(), creds.password || "")) {
      rlReset(ip);
      return send(res, 200, { token: signToken() });
    }
    rlFail(ip);
    return send(res, 401, { error: "Неверный логин или пароль." });
  }

  if (req.method === "GET" && url === "/projects") {
    const auth = req.headers["authorization"] || "";
    const token = auth.indexOf("Bearer ") === 0 ? auth.slice(7) : "";
    if (!verifyToken(token)) return send(res, 401, { error: "Требуется вход." });
    const priv = loadJSON(PRIVATE_PATH, { projects: {} });
    return send(res, 200, priv);
  }

  if (req.method === "GET" && url === "/health") return send(res, 200, { ok: true });

  return send(res, 404, { error: "Не найдено." });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("[hub-api] слушаю 127.0.0.1:" + PORT + " · data=" + DATA_DIR);
});
