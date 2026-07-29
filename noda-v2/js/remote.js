// Удалённый ПК — экран компьютера в браузере: курсор ходит без зажатой кнопки,
// есть полноэкранный режим и переключение качества.

import { $, $$, ago, currentDevice, deviceIcon, deviceLabel, esc, loadDevices, on, sendPc, state, toast } from "./core.js";

let unsubscribe = [];
let connectTimer = null;
let watchdog = null;
let lastMoveSent = 0;
let pendingMove = null;

const QUALITY = {
  fast: { fps: 24, quality: 58, width: 1280, label: "Плавно" },
  balanced: { fps: 18, quality: 72, width: 1600, label: "Обычно" },
  sharp: { fps: 12, quality: 86, width: 1920, label: "Чётко" },
};

export async function openRemote() {
  unsubscribe.forEach((off) => off());
  unsubscribe = [];
  state.screen.mode = state.screen.mode || "fast";
  await loadDevices();
  render();
  unsubscribe.push(on("devices", () => { if (!state.screen.active) render(); }));
  unsubscribe.push(on("screens", (message) => {
    state.screen.screens = message.screens || [];
    renderSide();
  }));
  unsubscribe.push(on("screen_frame", (message) => {
    if (!message.data) return;
    const image = $("#remoteImage");
    if (!image) return;
    const first = !state.screen.active;
    state.screen.active = true;
    state.screen.connecting = false;
    state.screen.lastFrame = Date.now();
    clearTimeout(connectTimer);
    image.src = `data:image/jpeg;base64,${message.data}`;
    image.hidden = false;
    if (first) {
      $("#remoteStage")?.classList.add("live");
      renderBar();
      startWatchdog();
    }
  }));
  unsubscribe.push(on("pc_offline", () => {
    stop({ silent: true });
    toast("Компьютер не в сети", "warn");
  }));
}

export function leaveRemote() {
  if (state.screen.active || state.screen.connecting) stop({ silent: true });
  unsubscribe.forEach((off) => off());
  unsubscribe = [];
}

/* ---------- подключение ---------- */

function connect() {
  const device = currentDevice();
  if (!device) { toast("Выбери компьютер", "warn"); return; }
  if (!device.online) { toast(`${deviceLabel(device)} не в сети`, "warn"); return; }

  state.screen.connecting = true;
  state.screen.active = false;
  renderBar();

  const preset = QUALITY[state.screen.mode];
  if (!sendPc({ type: "screen_start", ...preset }, device.id)) {
    state.screen.connecting = false;
    renderBar();
    return;
  }
  sendPc({ type: "screen_list" }, device.id);

  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (state.screen.active) return;
    state.screen.connecting = false;
    renderBar();
    toast("Компьютер не прислал экран. Проверь, что там запущена Noda", "warn");
  }, 9000);
}

function stop({ silent = false } = {}) {
  clearTimeout(connectTimer);
  clearInterval(watchdog);
  if (state.deviceId) sendPc({ type: "screen_stop" }, state.deviceId);
  state.screen.active = false;
  state.screen.connecting = false;
  const image = $("#remoteImage");
  if (image) { image.hidden = true; image.src = ""; }
  $("#remoteStage")?.classList.remove("live");
  renderBar();
  if (!silent) toast("Отключился");
}

function startWatchdog() {
  clearInterval(watchdog);
  watchdog = setInterval(() => {
    if (!state.screen.active) return;
    if (Date.now() - state.screen.lastFrame > 12000) {
      toast("Связь с компьютером прервалась", "warn");
      stop({ silent: true });
    }
  }, 4000);
}

/* ---------- отрисовка ---------- */

function render() {
  if (state.section !== "remote") return;
  $("#workPanel").innerHTML = `
    <div class="view">
      <div class="bar" id="remoteBar"></div>
      <div class="remote-body">
        <div class="remote-stage" id="remoteStage" tabindex="0">
          <div class="remote-hint">
            <div class="frame" id="remoteHint">Выбери компьютер и нажми «Подключиться»</div>
          </div>
          <img id="remoteImage" alt="Экран компьютера" hidden draggable="false">
        </div>
        <aside class="remote-side" id="remoteSide"></aside>
      </div>
    </div>`;
  renderBar();
  renderSide();
  wireInput();
}

function renderBar() {
  const bar = $("#remoteBar");
  if (!bar) return;
  const device = currentDevice();
  const label = state.screen.active ? "Отключиться" : state.screen.connecting ? "Подключаюсь…" : "Подключиться";
  bar.innerHTML = `
    <h1>Удалённый ПК</h1>
    <div class="seg">${state.devices.map((item) => `<button data-device="${item.id}" class="${String(item.id) === String(state.deviceId) ? "active" : ""}">${esc(deviceLabel(item))}</button>`).join("") || '<button class="active">нет устройств</button>'}</div>
    <span class="state-chip ${state.screen.active ? "on" : state.screen.connecting ? "wait" : ""}">${state.screen.active ? "экран идёт" : state.screen.connecting ? "жду кадр" : device?.online ? "готов" : "не в сети"}</span>
    <div class="bar-spacer"></div>
    ${state.screen.active ? '<button class="key" data-full>На весь экран</button>' : ""}
    <button class="key ${state.screen.active ? "" : "light"}" data-toggle ${state.screen.connecting || !device ? "disabled" : ""}>${label}</button>`;

  $$("[data-device]", bar).forEach((button) => button.addEventListener("click", () => {
    if (state.screen.active || state.screen.connecting) stop({ silent: true });
    state.deviceId = button.dataset.device;
    renderBar();
    renderSide();
  }));
  $("[data-toggle]", bar)?.addEventListener("click", () => (state.screen.active ? stop() : connect()));
  $("[data-full]", bar)?.addEventListener("click", toggleFullscreen);

  const hint = $("#remoteHint");
  if (hint) {
    hint.textContent = state.screen.connecting
      ? "Подключаюсь к компьютеру…"
      : device?.online ? "Нажми «Подключиться»" : "Компьютер не в сети — запусти на нём Noda";
  }
}

function renderSide() {
  const side = $("#remoteSide");
  if (!side) return;
  const screens = state.screen.screens || [];
  side.innerHTML = `
    <div class="panel">
      <div class="panel-head"><span>Качество</span></div>
      <div class="panel-body" style="display:grid;gap:7px">
        ${Object.entries(QUALITY).map(([key, preset]) => `<button class="key wide ${state.screen.mode === key ? "active" : ""}" data-quality="${key}">${preset.label}</button>`).join("")}
      </div>
    </div>
    ${screens.length > 1 ? `
      <div class="panel">
        <div class="panel-head"><span>Экраны</span></div>
        <div class="panel-body" style="display:grid;gap:7px">
          ${screens.map((screen, index) => `<button class="key wide ${String(screen.id) === String(state.screen.activeScreen) ? "active" : ""}" data-screen="${esc(screen.id)}">${esc(screen.name || `Экран ${index + 1}`)}</button>`).join("")}
        </div>
      </div>` : ""}
    <div class="panel">
      <div class="panel-head"><span>Управление</span></div>
      <div class="panel-body">
        <ul class="hint-list">
          <li>Курсор ходит за мышью</li>
          <li>Колесо — прокрутка</li>
          <li>Правая кнопка — меню</li>
          <li>Клавиатура — когда экран в фокусе</li>
          <li>F — на весь экран</li>
        </ul>
      </div>
    </div>`;

  $$("[data-quality]", side).forEach((button) => button.addEventListener("click", () => {
    state.screen.mode = button.dataset.quality;
    renderSide();
    if (state.screen.active) sendPc({ type: "screen_cfg", ...QUALITY[state.screen.mode] });
  }));
  $$("[data-screen]", side).forEach((button) => button.addEventListener("click", () => {
    state.screen.activeScreen = button.dataset.screen;
    sendPc({ type: "screen_switch", displayId: button.dataset.screen });
    renderSide();
  }));
}

function toggleFullscreen() {
  const stage = $("#remoteStage");
  if (!stage) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else stage.requestFullscreen?.().catch(() => toast("Браузер не пустил в полный экран", "warn"));
}

/* ---------- ввод ---------- */

function point(event) {
  const image = $("#remoteImage");
  const rect = image.getBoundingClientRect();
  return {
    nx: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    ny: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

function send(action, event, extra = {}) {
  if (!state.screen.active) return;
  sendPc({ type: "screen_input", action, ...point(event), ...extra });
}

/** Движение шлём не чаще 25 раз в секунду, но последнюю позицию — обязательно. */
function sendMove(event) {
  if (!state.screen.active) return;
  const now = Date.now();
  pendingMove = point(event);
  if (now - lastMoveSent < 40) return;
  lastMoveSent = now;
  sendPc({ type: "screen_input", action: "move", ...pendingMove });
  pendingMove = null;
}

function wireInput() {
  const image = $("#remoteImage");
  const stage = $("#remoteStage");
  if (!image || !stage) return;

  image.addEventListener("pointerdown", (event) => { stage.focus(); send("down", event); });
  image.addEventListener("pointermove", sendMove);
  image.addEventListener("pointerup", (event) => send("up", event));
  image.addEventListener("dblclick", (event) => send("dbl", event));
  image.addEventListener("contextmenu", (event) => { event.preventDefault(); send("click", event, { button: "right" }); });
  image.addEventListener("wheel", (event) => { event.preventDefault(); send("scroll", event, { dy: event.deltaY > 0 ? -120 : 120 }); }, { passive: false });

  // хвост движения — чтобы курсор не «залипал» между кадрами
  setInterval(() => {
    if (!pendingMove || !state.screen.active) return;
    sendPc({ type: "screen_input", action: "move", ...pendingMove });
    pendingMove = null;
    lastMoveSent = Date.now();
  }, 60);

  stage.addEventListener("keydown", (event) => {
    if (!state.screen.active) return;
    if (event.key === "f" || event.key === "F" || event.key === "а" || event.key === "А") {
      if (!event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); toggleFullscreen(); return; }
    }
    event.preventDefault();
    const special = {
      Enter: "enter", Backspace: "backspace", Escape: "esc", Tab: "tab", Delete: "delete",
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      Home: "home", End: "end", " ": "space",
    };
    sendPc({
      type: "screen_input",
      action: "key",
      key: special[event.key] || event.key,
      text: event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey ? event.key : undefined,
      ctrl: event.ctrlKey || event.metaKey,
      alt: event.altKey,
      shift: event.shiftKey,
    });
  });
}
