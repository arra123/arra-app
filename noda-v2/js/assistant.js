// Помощник — переписка как в мессенджере: лента сверху, поле ввода всегда внизу.

import { $, $$, api, confirmAction, dateTime, esc, money, state, timeOf, toast } from "./core.js";
import { entryCategory, entryIcon } from "./merchants.js";
import { dictate } from "./voice.js";
import { editEntry } from "./finance.js";

let messages = [];
let cards = []; // записи, созданные помощником в этом диалоге — показываем карточкой

export async function openAssistant() {
  $("#workPanel").innerHTML = `
    <div class="view">
      <div class="bar">
        <h1>Помощник</h1>
        <div class="bar-spacer"></div>
        <button class="key sm" data-clear>Очистить</button>
      </div>
      <div class="chat-feed" id="chatFeed"><div class="view-loading">Загружаю переписку…</div></div>
      <form class="composer" id="chatForm">
        <button class="key square" type="button" data-attach title="Прикрепить файл"><svg viewBox="0 0 24 24"><path d="m9 17 8.5-8.5a3 3 0 0 0-4.2-4.2L4.8 12.8a5 5 0 0 0 7.1 7.1l8-8"/></svg></button>
        <textarea id="chatInput" rows="1" placeholder="Напиши сообщение…"></textarea>
        <button class="key square" type="button" data-mic title="Продиктовать"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
        <button class="key light square" type="submit" title="Отправить"><svg viewBox="0 0 24 24"><path d="m4 12 16-7-6 16-2.5-6.5z"/></svg></button>
        <input id="chatFile" type="file" hidden>
      </form>
    </div>`;

  const input = $("#chatInput");
  const grow = () => { input.style.height = "auto"; input.style.height = `${Math.min(160, input.scrollHeight)}px`; };
  input.addEventListener("input", grow);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); }
  });
  $("#chatForm").addEventListener("submit", (event) => { event.preventDefault(); send(); });
  $("[data-attach]").addEventListener("click", () => $("#chatFile").click());
  $("#chatFile").addEventListener("change", attach);
  $("[data-mic]").addEventListener("click", async () => {
    const text = await dictate({ hint: "Скажи, что нужно сделать" });
    if (!text) return;
    input.value = input.value ? `${input.value.trim()} ${text}` : text;
    grow();
    input.focus();
  });
  $("[data-clear]").addEventListener("click", async () => {
    const ok = await confirmAction({ title: "Очистить переписку?", text: "История сообщений удалится и на телефоне, и на компьютере.", confirmLabel: "Очистить", danger: true });
    if (!ok) return;
    try {
      await api("/ai/messages", { method: "DELETE" });
      messages = [];
      renderFeed();
    } catch (error) { toast(error.message, "warn"); }
  });

  try {
    const data = await api("/ai/messages");
    messages = data.messages || [];
    renderFeed();
  } catch (error) {
    $("#chatFeed").innerHTML = `<div class="view-error">${esc(error.message)}</div>`;
  }
  input.focus();
}

function renderFeed({ keepScroll = false } = {}) {
  const feed = $("#chatFeed");
  if (!feed) return;
  if (!messages.length) {
    feed.innerHTML = `<div class="chat-empty"><img src="assets/noda.png" alt=""><strong>Что нужно сделать?</strong><span>«Запиши 500 на такси», «сколько мне должны за неделю», «создай заметку по проекту»</span></div>`;
    return;
  }
  let lastDay = "";
  feed.innerHTML = messages.map((message) => {
    const day = new Date(message.created_at || Date.now()).toDateString();
    const divider = day !== lastDay ? `<div class="chat-day">${esc(dateTime(message.created_at || Date.now()).split(",")[0])}</div>` : "";
    lastDay = day;
    return `${divider}<div class="bubble ${message.role === "user" ? "mine" : "theirs"}">${formatText(message.content)}<span class="bubble-time">${timeOf(message.created_at || Date.now())}</span></div>`;
  }).join("") + cards.map(entryCard).join("");
  wireCards();
  if (!keepScroll) scrollDown();
}

function scrollDown() {
  const feed = $("#chatFeed");
  if (feed) feed.scrollTop = feed.scrollHeight;
}

function formatText(text) {
  return esc(text || "")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br>");
}

async function send() {
  const input = $("#chatInput");
  const value = input.value.trim();
  if (!value) return;
  input.value = "";
  input.style.height = "auto";
  messages.push({ role: "user", content: value, created_at: new Date().toISOString() });
  renderFeed();
  const feed = $("#chatFeed");
  feed.insertAdjacentHTML("beforeend", '<div class="bubble theirs typing" id="chatTyping"><i></i><i></i><i></i></div>');
  scrollDown();

  const before = await debtIds();
  try {
    const data = await api("/ai/assistant", { method: "POST", body: JSON.stringify({ text: value }) });
    messages.push({ role: "assistant", content: data.reply || "Готово", created_at: new Date().toISOString() });
  } catch (error) {
    messages.push({ role: "assistant", content: `Не получилось: ${error.message}`, created_at: new Date().toISOString() });
  }
  $("#chatTyping")?.remove();
  renderFeed();
  await showFreshEntries(before);
}

/* ---------- карточки записей ---------- */

async function debtIds() {
  try {
    const data = await api("/debts?all=true");
    return new Set((data.debts || []).map((debt) => String(debt.id)));
  } catch {
    return new Set();
  }
}

/** Если помощник только что завёл запись — показываем её карточкой с кнопками, а не текстом. */
async function showFreshEntries(before) {
  let fresh = [];
  try {
    const data = await api("/debts?all=true");
    fresh = (data.debts || []).filter((debt) => !before.has(String(debt.id)));
  } catch { return; }
  if (!fresh.length) return;
  cards.push(...fresh);
  renderFeed();
}

function entryCard(debt) {
  const note = String(debt.note || "").replace(/\[(Тима|Даня|Женя)\]/, "").trim();
  const text = `${debt.counterparty || ""} ${note}`;
  const when = new Date(debt.occurred_at || debt.created_at || Date.now());
  return `
    <div class="chat-card${debt.settled ? " done" : ""}" data-card="${debt.id}">
      <div class="chat-card-top">
        ${entryIcon(text, 42)}
        <div>
          <strong>${esc(debt.counterparty && debt.counterparty !== "Компания" ? debt.counterparty : (note || "Запись"))}</strong>
          <small>${esc(note || entryCategory(text) || "—")} · ${esc(dateTime(when))}</small>
        </div>
        <b>${money(debt.amount)}</b>
      </div>
      <div class="chat-card-actions">
        <button class="key sm" data-card-settle="${debt.id}">${debt.settled ? "Вернуть" : "Выплачено"}</button>
        <button class="key sm" data-card-edit="${debt.id}">Изменить</button>
        <button class="key sm" data-card-remove="${debt.id}">Отменить</button>
      </div>
    </div>`;
}

function wireCards() {
  $$("[data-card-settle]").forEach((button) => button.addEventListener("click", async () => {
    const debt = cards.find((item) => String(item.id) === String(button.dataset.cardSettle));
    if (!debt) return;
    try {
      const data = await api(`/debts/${debt.id}`, { method: "PATCH", body: JSON.stringify({ settled: !debt.settled }) });
      Object.assign(debt, data.debt);
      renderFeed();
    } catch (error) { toast(error.message, "warn"); }
  }));
  $$("[data-card-edit]").forEach((button) => button.addEventListener("click", () => {
    const debt = cards.find((item) => String(item.id) === String(button.dataset.cardEdit));
    if (debt) editEntry(debt, async (updated) => { Object.assign(debt, updated || {}); renderFeed(); });
  }));
  $$("[data-card-remove]").forEach((button) => button.addEventListener("click", async () => {
    const debt = cards.find((item) => String(item.id) === String(button.dataset.cardRemove));
    if (!debt) return;
    const ok = await confirmAction({ title: "Отменить запись?", text: `«${esc(debt.counterparty || "запись")}» на ${money(debt.amount)} будет удалена.`, confirmLabel: "Отменить запись", danger: true });
    if (!ok) return;
    try {
      await api(`/debts/${debt.id}`, { method: "DELETE" });
      cards = cards.filter((item) => String(item.id) !== String(debt.id));
      renderFeed();
      toast("Запись удалена");
    } catch (error) { toast(error.message, "warn"); }
  }));
}

async function attach(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  try {
    await api("/files", { method: "POST", body: form });
    const input = $("#chatInput");
    input.value = `${input.value}${input.value ? " " : ""}${file.name}`;
    toast(`${file.name} отправлен на компьютер`);
  } catch (error) {
    toast(error.message, "warn");
  }
  event.target.value = "";
}
