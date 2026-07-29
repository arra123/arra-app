// Передача — синхронизация рабочих папок между компьютерами через сервер.
// Одна понятная строка «где свежая версия», две клавиши и подробности ниже.

import {
  $, $$, ago, confirmAction, currentDevice, deviceIcon, deviceLabel, esc,
  loadDevices, on, sendPc, state, timeOf, toast, uid,
} from "./core.js";

let unsubscribe = [];

export async function openTransfer() {
  unsubscribe.forEach((off) => off());
  unsubscribe = [];
  await loadDevices();
  render();
  unsubscribe.push(on("sync_remote_ack", (message) => {
    state.transfer.busy = true;
    log(message.message || "Команда принята");
    render();
  }));
  unsubscribe.push(on("sync_remote_event", (message) => applyEvent(message.event || {})));
  unsubscribe.push(on("devices", () => render()));
  unsubscribe.push(on("pc_offline", () => {
    state.transfer.busy = false;
    log("Компьютер не в сети — команда не дошла", "warn");
    render();
  }));
  requestStatus(true);
}

export function leaveTransfer() {
  unsubscribe.forEach((off) => off());
  unsubscribe = [];
}

function log(text, kind = "") {
  state.transfer.log.unshift({ text, kind, at: Date.now() });
  state.transfer.log = state.transfer.log.slice(0, 30);
}

function requestStatus(silent = false) {
  const device = currentDevice();
  if (!device?.online) {
    if (!silent) toast("Компьютер не в сети", "warn");
    return;
  }
  state.transfer.phase = "Сравниваю с сервером…";
  render();
  sendPc({ type: "sync_remote_status", reqId: uid() });
}

/* ---------- события ---------- */

function applyEvent(event) {
  if (event.type === "status") {
    state.transfer.status = event;
    state.transfer.phase = "";
    state.transfer.busy = false;
    render();
    return;
  }
  if (event.type === "phase") state.transfer.phase = event.msg || event.detail || "Работаю…";
  else if (event.type === "plan") { state.transfer.phase = `План: ${event.files || 0} файлов`; log(`План: ${event.files || 0} файлов`); }
  else if (event.type === "progress") {
    const percent = event.totalBytes ? Math.round(((event.bytes || 0) / event.totalBytes) * 100) : 0;
    state.transfer.progress = percent;
    state.transfer.phase = `${event.direction === "pull" ? "Забираю" : "Отправляю"} · ${event.project || event.file || ""} · ${percent}%`;
  } else if (event.type === "verify" || event.type === "verify_progress") {
    const percent = event.total ? Math.round(((event.done || 0) / event.total) * 100) : 0;
    state.transfer.progress = percent;
    state.transfer.phase = `Проверяю файлы · ${percent}%`;
  } else if (event.type === "done") {
    state.transfer.busy = false;
    state.transfer.progress = 100;
    state.transfer.phase = "";
    log(event.msg || "Готово", "ok");
    toast("Передача завершена");
    setTimeout(() => requestStatus(true), 600);
  } else if (event.type === "cancelled") {
    state.transfer.busy = false;
    state.transfer.phase = "";
    log(event.msg || "Остановлено", "warn");
  } else if (event.type === "blocked" || event.type === "error") {
    state.transfer.busy = false;
    state.transfer.phase = "";
    log(event.error || event.msg || "Остановлено", "warn");
    toast(event.error || "Передача остановлена", "warn");
  }
  render();
}

/* ---------- команды ---------- */

function run(mode) {
  const device = currentDevice();
  if (!device?.online) { toast("Компьютер не в сети", "warn"); return; }
  const map = { push: "sync_remote_push", pull: "sync_remote_pull", status: "sync_remote_status", cancel: "sync_remote_cancel" };
  if (sendPc({ type: map[mode], reqId: uid() })) {
    state.transfer.busy = mode === "push" || mode === "pull";
    state.transfer.progress = 0;
    state.transfer.phase = { push: "Готовлю отправку…", pull: "Готовлю получение…", status: "Сравниваю…", cancel: "Останавливаю…" }[mode];
    log({ push: "Отправка на сервер", pull: "Получение с сервера", status: "Проверка", cancel: "Остановка" }[mode]);
    render();
  }
}

async function pull() {
  const upload = Number(state.transfer.status?.upload || 0);
  if (upload > 0) {
    const ok = await confirmAction({
      title: "Свежая версия — здесь",
      text: `На <b>${esc(deviceLabel(currentDevice()))}</b> ещё не отправлено <b>${upload}</b> файлов.
             Если забрать серверную версию, эта работа заменится более старой.<br><br>Обычно сначала жмут «Отправить».`,
      confirmLabel: "Всё равно забрать",
      danger: true,
    });
    if (!ok) return;
  }
  run("pull");
}

/* ---------- отрисовка ---------- */

function render() {
  if (state.section !== "transfer") return;
  const device = currentDevice();
  const status = state.transfer.status;
  const serverState = status?.serverState || {};
  const upload = Number(status?.upload || 0);
  const download = Number(status?.download || 0);
  const online = Boolean(device?.online);
  const fresh = freshness(status, upload, download);
  const changed = (status?.projects || []).filter((project) => (project.changes || []).length > 0);

  $("#workPanel").innerHTML = `
    <div class="view">
      <div class="bar">
        <h1>Передача</h1>
        <div class="seg" id="deviceSeg">
          ${state.devices.map((item) => `<button data-device="${item.id}" class="${String(item.id) === String(state.deviceId) ? "active" : ""}">${esc(deviceLabel(item))}${item.online ? "" : " ·"}</button>`).join("") || '<button class="active">нет устройств</button>'}
        </div>
        <div class="bar-spacer"></div>
        ${state.transfer.busy ? '<button class="key" data-run="cancel">Стоп</button>' : ""}
        <button class="key" data-run="status" ${online ? "" : "disabled"}>Проверить</button>
      </div>

      <div class="scroll">
        <div class="content">
        <div class="flow">
          <div class="flow-node ${upload ? "hot" : ""}">
            ${deviceIcon(device, 30)}
            <strong>${esc(device ? deviceLabel(device) : "Устройство")}</strong>
            <span>${status ? `${status.localFiles ?? "—"} файлов` : online ? "готов" : "не в сети"}</span>
          </div>
          <div class="flow-link">
            <span class="flow-arrow up ${upload ? "on" : ""}">↑ ${upload || 0}</span>
            <span class="flow-line"></span>
            <span class="flow-arrow down ${download ? "on" : ""}">↓ ${download || 0}</span>
          </div>
          <div class="flow-node server ${download ? "hot" : ""}">
            <span class="ic ic-glyph" style="--ic:30px;--tint:#8fa6c0"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/></svg></span>
            <strong>Сервер</strong>
            <span>общая версия</span>
          </div>
        </div>

        <div class="tr-state ${fresh.kind}">
          <span class="badge">${fresh.mark}</span>
          <div><strong>${esc(fresh.title)}</strong><p>${fresh.text}</p></div>
        </div>

        <div class="tr-actions">
          <button class="tr-btn up" data-run="push" ${online ? "" : "disabled"}>
            <i>↑</i><span><strong>Отправить</strong><small>${upload ? `${upload} файлов на сервер` : "всё уже на сервере"}</small></span>
          </button>
          <button class="tr-btn down" data-pull ${online ? "" : "disabled"}>
            <i>↓</i><span><strong>Забрать</strong><small>${download ? `${download} файлов с сервера` : "новых файлов нет"}</small></span>
          </button>
        </div>

        ${state.transfer.phase || state.transfer.busy ? `
          <div class="tr-progress">
            <div class="line"><i style="width:${state.transfer.progress}%"></i></div>
            <span>${esc(state.transfer.phase || "Работаю…")}</span>
          </div>` : ""}

        <div class="tr-meta">
          <div><span>Последняя отправка</span><b>${lastOp(serverState.lastPush)}</b></div>
          <div><span>Последнее получение</span><b>${lastOp(serverState.lastPull)}</b></div>
          <div><span>Файлов здесь</span><b>${status?.localFiles ?? "—"}</b></div>
          <div><span>Конфликтов</span><b>${status?.conflicts ?? "—"}</b></div>
        </div>

        ${changed.length ? `
          <div class="panel" style="margin-top:12px">
            <div class="panel-head"><span>Разошлись</span><span>${changed.length}</span></div>
            <div class="tr-changes">${changed.slice(0, 40).map(changeRow).join("")}</div>
          </div>` : ""}

        ${state.transfer.log.length ? `
          <div class="panel" style="margin-top:12px">
            <div class="panel-head"><span>Журнал</span></div>
            <div class="log-list">${state.transfer.log.map((item) => `<div class="log-row ${item.kind}"><span>${timeOf(item.at)}</span>${esc(item.text)}</div>`).join("")}</div>
          </div>` : ""}
        </div>
      </div>
    </div>`;

  $$("[data-device]").forEach((button) => button.addEventListener("click", () => {
    state.deviceId = button.dataset.device;
    state.transfer.status = null;
    render();
    requestStatus(true);
  }));
  $$("[data-run]").forEach((button) => button.addEventListener("click", () => run(button.dataset.run)));
  $("[data-pull]")?.addEventListener("click", pull);
}

function changeRow(project) {
  const up = (project.changes || []).filter((item) => item.direction === "upload").length;
  const down = (project.changes || []).filter((item) => item.direction === "download").length;
  const conflict = (project.changes || []).filter((item) => item.direction === "conflict").length;
  return `<div class="tr-change"><strong>${esc(project.label || project.scope)}</strong><span>${[up ? `↑${up}` : "", down ? `↓${down}` : "", conflict ? `⚠${conflict}` : ""].filter(Boolean).join(" ")}</span></div>`;
}

function lastOp(event) {
  if (!event?.at) return "не было";
  const name = event.role === "laptop" ? "Ноутбук" : event.device || "Компьютер";
  return `${esc(name)} · ${ago(event.at)}`;
}

function freshness(status, upload, download) {
  if (!status) return { kind: "", mark: "?", title: "Состояние неизвестно", text: "Нажми «Проверить», чтобы сравнить с сервером." };
  if (upload > 0 && download > 0) return { kind: "warn", mark: "⇄", title: "Версии разошлись", text: `Здесь новее ${upload} файлов, на сервере — ${download}. Сначала отправь своё, потом забирай.` };
  if (upload > 0) return { kind: "local", mark: "↑", title: "Свежая версия — на этом компьютере", text: `${upload} файлов ещё не на сервере.` };
  if (download > 0) return { kind: "server", mark: "↓", title: "Свежая версия — на сервере", text: `${download} файлов пришли с другого устройства.` };
  return { kind: "ok", mark: "✓", title: "Всё синхронно", text: "Локальные файлы совпадают с серверными." };
}
