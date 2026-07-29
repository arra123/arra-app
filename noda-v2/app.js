// Точка входа: вход, навигация по разделам, статус связи.

import { $, $$, api, connectWs, deviceIcon, deviceLabel, esc, loadDevices, on, state, toast } from "./js/core.js";
import { openProjects, refreshProjectGrid, wireLightbox } from "./js/projects.js";
import { financeKeys, openFinance } from "./js/finance.js";
import { openFiles } from "./js/files.js";
import { leaveTransfer, openTransfer } from "./js/transfer.js";
import { leaveRemote, openRemote } from "./js/remote.js";
import { openAssistant } from "./js/assistant.js";
import { openNotes } from "./js/notes.js";

const SECTIONS = {
  finance: { title: "Финансы", open: openFinance },
  projects: { title: "Проекты", open: openProjects },
  files: { title: "Файлы", open: openFiles },
  transfer: { title: "Передача", open: openTransfer },
  remote: { title: "Удалённый ПК", open: openRemote },
  assistant: { title: "Помощник", open: openAssistant },
  notes: { title: "Заметки", open: openNotes },
};

/* ---------- вход ---------- */

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const field = $("#loginPassword");
  const error = $("#loginError");
  const password = field.value.trim();
  if (!password) { error.textContent = "Введи пароль"; return; }
  error.textContent = "";
  try {
    const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ login: "2244", password }) });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("noda_web_token", data.token);
    unlock();
  } catch (problem) {
    error.textContent = problem.message;
    field.select();
  }
});

function unlock() {
  $("#loginGate").hidden = true;
  $("#app").hidden = false;
  const saved = localStorage.getItem("noda_section");
  go(SECTIONS[saved] ? saved : "finance");
  loadDevices().then(renderDeviceStrip);
  connectWs();
}

async function boot() {
  if (!state.token) return;
  try {
    const data = await api("/me");
    state.user = data.user;
    unlock();
  } catch {
    state.token = "";
    localStorage.removeItem("noda_web_token");
  }
}

/* ---------- навигация ---------- */

function go(section) {
  if (state.section === "remote" && section !== "remote") leaveRemote();
  if (state.section === "transfer" && section !== "transfer") leaveTransfer();
  state.section = section;
  localStorage.setItem("noda_section", section);
  $$("[data-section]").forEach((button) => button.classList.toggle("active", button.dataset.section === section));
  $("#searchWrap").hidden = section !== "projects";
  $("#projectFilters").hidden = section !== "projects";
  document.title = `Noda · ${SECTIONS[section].title}`;
  SECTIONS[section].open();
}

$$("[data-section]").forEach((button) => button.addEventListener("click", () => go(button.dataset.section)));
$$("[data-filter]").forEach((button) => button.addEventListener("click", () => {
  state.filter = button.dataset.filter;
  $$("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
  refreshProjectGrid();
}));
$("#search").addEventListener("input", (event) => { state.query = event.target.value; refreshProjectGrid(); });

/* ---------- статус устройств в панели ---------- */

function renderDeviceStrip() {
  const strip = $("#deviceStrip");
  if (!strip) return;
  strip.innerHTML = state.devices.length
    ? state.devices.map((device) => `<div class="strip-row">${deviceIcon(device, 22)}<span>${esc(deviceLabel(device))}</span><i class="dot ${device.online ? "on" : ""}"></i></div>`).join("")
    : '<div class="strip-row muted">Устройства не подключены</div>';
}

on("devices", renderDeviceStrip);

/* ---------- клавиши ---------- */

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && state.section === "projects" && !event.target.matches("input, textarea, [contenteditable]")) {
    event.preventDefault();
    $("#search").focus();
  }
  financeKeys(event);
});

wireLightbox();
boot();
