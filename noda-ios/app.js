// Точка входа светлой версии: вход, боковое меню, переключение разделов.

import { $, $$, api, connectWs, esc, loadDevices, on, state } from "./js/core.js";
import { setToolbar, wireViewer } from "./js/ui.js";
import { openFinance } from "./js/finance.js";
import { leaveRemote, leaveTransfer, openAssistant, openFiles, openNotes, openProjects, openRemote, openTransfer } from "./js/views.js";

const SECTIONS = [
  { id: "finance", label: "Финансы", tint: "#34C759", open: openFinance, icon: '<img src="assets/tabs/finance.png" alt="">' },
  { id: "assistant", label: "Помощник", tint: "#007AFF", open: openAssistant, icon: '<img src="assets/tabs/assistant.png" alt="">' },
  { id: "notes", label: "Заметки", tint: "#FF9500", open: openNotes, icon: '<img src="assets/tabs/notes.png" alt="">' },
  { id: "files", label: "Файлы", tint: "#AF52DE", open: openFiles, icon: '<img src="assets/tabs/files.png" alt="">' },
  { id: "transfer", label: "Передача", tint: "#30B0C7", open: openTransfer, icon: '<img src="assets/tabs/transfer.png" alt="">' },
  { id: "remote", label: "Удалённый ПК", tint: "#FF3B30", open: openRemote, icon: '<img src="assets/tabs/remote.png" alt="">' },
  { id: "projects", label: "Проекты", tint: "#5E5CE6", open: openProjects, icon: '<img src="assets/tabs/projects.png" alt="">' },
];

/* ---------- вход ---------- */

$("#gateForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const field = $("#gatePassword");
  const error = $("#gateError");
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
  $("#gate").hidden = true;
  $("#app").hidden = false;
  renderNav();
  go(localStorage.getItem("noda_ios_section") || "finance");
  loadDevices().then(renderDevices);
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

function renderNav() {
  $("#nav").innerHTML = SECTIONS.map((section) => `
    <button class="nav-item" data-section="${section.id}">
      <span class="glyph" style="background:linear-gradient(180deg, color-mix(in srgb, ${section.tint} 85%, #fff), ${section.tint})">${section.icon}</span>
      <span>${esc(section.label)}</span>
      <span class="count"></span>
    </button>`).join("");
  $$("[data-section]").forEach((button) => button.addEventListener("click", () => go(button.dataset.section)));
}

export function go(id) {
  if (state.section === "remote" && id !== "remote") leaveRemote();
  if (state.section === "transfer" && id !== "transfer") leaveTransfer();
  state.section = id;
  localStorage.setItem("noda_ios_section", id);
  $$("[data-section]").forEach((button) => button.classList.toggle("active", button.dataset.section === id));
  $("#screen").scrollTop = 0;
  $("#screen").classList.remove("flush");
  $("#dock").innerHTML = "";
  const section = SECTIONS.find((item) => item.id === id) || SECTIONS[0];
  document.title = `Noda · ${section.label}`;
  section.open();
}

function renderDevices() {
  const list = $("#deviceList");
  if (!list) return;
  list.innerHTML = state.devices.length
    ? state.devices.map((device) => `<div class="device-row"><i class="dot ${device.online ? "on" : ""}"></i><span>${esc(device.role === "laptop" ? "Ноутбук" : "Компьютер")}</span></div>`).join("")
    : '<div class="device-row"><i class="dot"></i><span>нет устройств</span></div>';
}

on("devices", renderDevices);
window.addEventListener("noda:more", () => go("finance"));

wireViewer();
boot();
