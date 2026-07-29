// Ядро: состояние, запросы к серверу, связь с ПК по вебсокету, общие утилиты.

export const API = "https://aura.5.42.122.102.sslip.io";

export const state = {
  section: "finance",
  token: localStorage.getItem("noda_web_token") || "",
  user: null,
  // проекты
  filter: "all",
  query: "",
  selected: null,
  // финансы
  debts: [],
  financeMode: localStorage.getItem("noda_fin_mode") || "week",
  financeAnchor: new Date(),
  // заметки
  notes: [],
  noteId: null,
  // устройства и связь
  devices: [],
  deviceId: null,
  ws: null,
  wsTimer: null,
  wsReady: false,
  // удалённый экран
  screen: { active: false, connecting: false, lastFrame: 0, screens: [], activeScreen: null },
  // передача
  transfer: { status: null, busy: false, log: [], progress: 0, phase: "" },
};

/* ---------- утилиты ---------- */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function esc(value = "") {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

let toastTimer;
export function toast(message, kind = "") {
  const node = $("#toast");
  node.textContent = message;
  node.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2200);
}

export function copyText(value, label = "Скопировано") {
  navigator.clipboard?.writeText(value).then(() => toast(label)).catch(() => toast(value));
}

export const money = (value) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0))} ₽`;

export function formatSize(value) {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
  return `${(size / 1024 / 1024).toFixed(size > 10 * 1024 * 1024 ? 0 : 1)} МБ`;
}

const DAY = 86400000;
export const startOfDay = (value) => { const date = new Date(value); date.setHours(0, 0, 0, 0); return date; };
export const startOfWeek = (value) => { const date = startOfDay(value); date.setDate(date.getDate() - ((date.getDay() || 7) - 1)); return date; };
export const startOfMonth = (value) => { const date = new Date(value); return new Date(date.getFullYear(), date.getMonth(), 1); };

export function dayTitle(value) {
  const date = startOfDay(value);
  const today = startOfDay(new Date());
  const diff = Math.round((today - date) / DAY);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  if (diff === -1) return "Завтра";
  const withYear = date.getFullYear() !== today.getFullYear();
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}) }).format(date);
}

export const timeOf = (value) => new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
export const dateTime = (value) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export function ago(value) {
  if (!value) return "никогда";
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return "никогда";
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} дн назад`;
  return dateTime(value);
}

/* ---------- запросы ---------- */

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token && !path.startsWith("/auth/")) headers.Authorization = `Bearer ${state.token}`;
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(API + path, { ...options, headers, cache: "no-store" });
  } catch {
    throw new Error("Сервер Noda недоступен");
  }
  let data = {};
  try { data = await response.json(); } catch {}
  if (response.status === 401 && !path.startsWith("/auth/")) {
    state.token = "";
    state.user = null;
    localStorage.removeItem("noda_web_token");
    location.reload();
  }
  if (!response.ok) throw new Error(data.error || `Ошибка сервера ${response.status}`);
  return data;
}

/* ---------- устройства и вебсокет ---------- */

const listeners = new Map();
export function on(type, handler) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(handler);
  return () => listeners.get(type).delete(handler);
}
function emit(type, payload) {
  for (const handler of listeners.get(type) || []) {
    try { handler(payload); } catch (error) { console.error(error); }
  }
}

export function deviceKind(device) {
  const hay = `${device?.role || ""} ${device?.name || ""} ${device?.hostname || ""}`.toLowerCase();
  if (device?.role === "laptop" || /(laptop|notebook|ноут)/.test(hay)) return "laptop";
  if (/(phone|iphone|телефон|android)/.test(hay)) return "phone";
  return "desktop";
}
export const deviceLabel = (device) => ({ laptop: "Ноутбук", phone: "Телефон", desktop: "Компьютер" }[deviceKind(device)]);

export function normalizeDevices(list) {
  const groups = new Map();
  for (const raw of list || []) {
    const kind = deviceKind(raw);
    const score = (raw.online ? 1e15 : 0) + Number(new Date(raw.lastSeenAt || raw.last_seen || 0));
    const current = groups.get(kind);
    const currentScore = current ? (current.online ? 1e15 : 0) + Number(new Date(current.lastSeenAt || current.last_seen || 0)) : -1;
    if (!current || score > currentScore) groups.set(kind, { ...raw, kind });
  }
  return ["desktop", "laptop", "phone"].map((kind) => groups.get(kind)).filter(Boolean);
}

export async function loadDevices() {
  try {
    const data = await api("/pc/tokens");
    state.devices = normalizeDevices(data.tokens || []);
  } catch {
    state.devices = [];
  }
  if (!state.deviceId || !state.devices.some((device) => String(device.id) === String(state.deviceId))) {
    state.deviceId = state.devices.find((device) => device.online)?.id || state.devices[0]?.id || null;
  }
  emit("devices", state.devices);
  return state.devices;
}

export const currentDevice = () => state.devices.find((device) => String(device.id) === String(state.deviceId)) || null;

export function connectWs() {
  if (!state.token || state.ws?.readyState === WebSocket.OPEN || state.ws?.readyState === WebSocket.CONNECTING) return;
  clearTimeout(state.wsTimer);
  const socket = new WebSocket(`${API.replace(/^http/, "ws")}/client?token=${encodeURIComponent(state.token)}`);
  state.ws = socket;
  socket.onopen = () => {
    state.wsReady = true;
    emit("link", true);
    socket.send(JSON.stringify({ type: "list_devices" }));
  };
  socket.onmessage = (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    handleMessage(message);
  };
  socket.onclose = () => {
    state.wsReady = false;
    emit("link", false);
    if (state.token) state.wsTimer = setTimeout(connectWs, 2500);
  };
  socket.onerror = () => { try { socket.close(); } catch {} };
}

function handleMessage(message) {
  if (message.type === "devices") {
    state.devices = normalizeDevices(message.devices || []);
    if (!state.deviceId || !state.devices.some((device) => String(device.id) === String(state.deviceId))) {
      state.deviceId = state.devices.find((device) => device.online)?.id || state.devices[0]?.id || null;
    }
    emit("devices", state.devices);
    return;
  }
  emit(message.type, message);
  emit("*", message);
}

/** Отправка команды ПК-агенту. Возвращает false, если отправить некому. */
export function sendPc(message, deviceId = state.deviceId) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    toast("Нет связи с сервером", "warn");
    return false;
  }
  if (!deviceId) {
    toast("Сначала выбери компьютер", "warn");
    return false;
  }
  state.ws.send(JSON.stringify({ to: "pc", deviceId, ...message }));
  return true;
}

/* ---------- иконки файлов ---------- */

const FILE_TYPES = [
  [/\.(png|jpe?g|gif|webp|bmp|heic|svg)$/i, "#4CB782", '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="m5 17 5-4 4 3 3-2 3 3"/>'],
  [/\.(mp4|mov|mkv|avi|webm)$/i, "#E06C75", '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 6 3-6 3z"/>'],
  [/\.(mp3|wav|flac|m4a|ogg)$/i, "#C98AB8", '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>'],
  [/\.(zip|rar|7z|tar|gz)$/i, "#E0A33E", '<path d="M4 4h16v16H4z"/><path d="M12 4v4M12 10v2M12 14v2"/>'],
  [/\.(pdf)$/i, "#E06C75", '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 14h2a1.5 1.5 0 0 0 0-3H9v6"/>'],
  [/\.(docx?|rtf|odt)$/i, "#5B8DEF", '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h4"/>'],
  [/\.(xlsx?|csv|numbers)$/i, "#4CB782", '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6M12 12v6"/>'],
  [/\.(pptx?|key)$/i, "#E0A33E", '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>'],
  [/\.(js|ts|tsx|jsx|py|go|rs|java|c|cpp|sh|ps1)$/i, "#6E79E6", '<path d="m9 8-4 4 4 4M15 8l4 4-4 4"/>'],
  [/\.(json|yml|yaml|xml|toml|ini|env)$/i, "#5FB8CF", '<path d="M8 4H7a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h1M16 4h1a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-1"/>'],
  [/\.(txt|md|log)$/i, "#8A8F98", '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'],
  [/\.(exe|msi|dmg|apk|deb|appimage)$/i, "#9A7BE0", '<path d="M12 3 4 7v6c0 4.5 3.4 7.6 8 8.5 4.6-.9 8-4 8-8.5V7z"/><path d="m9 12 2 2 4-4"/>'],
];

export function fileIcon(name, size = 34) {
  const found = FILE_TYPES.find(([pattern]) => pattern.test(String(name || "")));
  const [, color, glyph] = found || [null, "#7C8AA0", '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'];
  return `<span class="ic ic-glyph" style="--ic:${size}px;--tint:${color}"><svg viewBox="0 0 24 24">${glyph}</svg></span>`;
}

export function deviceIcon(device, size = 30) {
  const kind = deviceKind(device);
  const glyph = kind === "laptop"
    ? '<rect x="4" y="5" width="16" height="10" rx="1.6"/><path d="M2 18h20"/>'
    : kind === "phone"
      ? '<rect x="7" y="3" width="10" height="18" rx="2.4"/><path d="M11 18h2"/>'
      : '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>';
  const tint = device?.online ? "#4CB782" : "#7C8AA0";
  return `<span class="ic ic-glyph" style="--ic:${size}px;--tint:${tint}"><svg viewBox="0 0 24 24">${glyph}</svg></span>`;
}

/* ---------- модальные окна ---------- */

export function openModal(html, { onMount, width = 460 } = {}) {
  const layer = document.createElement("div");
  layer.className = "modal-layer";
  layer.innerHTML = `<div class="modal-card" style="--modal-width:${width}px">${html}</div>`;
  document.body.appendChild(layer);
  const close = () => { layer.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (event) => { if (event.key === "Escape") close(); };
  layer.addEventListener("mousedown", (event) => { if (event.target === layer) close(); });
  document.addEventListener("keydown", onKey);
  $$("[data-close]", layer).forEach((button) => button.addEventListener("click", close));
  onMount?.(layer, close);
  requestAnimationFrame(() => layer.classList.add("open"));
  return close;
}

/** Да/нет с понятным текстом — используем там, где действие можно случайно испортить. */
export function confirmAction({ title, text, confirmLabel = "Продолжить", danger = false }) {
  return new Promise((resolve) => {
    openModal(
      `<h2>${esc(title)}</h2><p class="modal-text">${text}</p>
       <div class="modal-actions"><button class="key" data-cancel>Отмена</button>
       <button class="key light" data-confirm>${esc(confirmLabel)}</button></div>`,
      {
        onMount(layer, close) {
          $("[data-cancel]", layer).addEventListener("click", () => { close(); resolve(false); });
          $("[data-confirm]", layer).addEventListener("click", () => { close(); resolve(true); });
        },
      },
    );
  });
}
