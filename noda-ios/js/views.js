// Остальные экраны iOS-оболочки: помощник, заметки, файлы, передача, удалённый ПК, проекты.

import {
  $, $$, API, ago, api, currentDevice, dateTime, dayTitle, deviceLabel, esc, fileIcon, formatSize,
  loadDevices, money, on, sendPc, startOfDay, state, timeOf, toast, uid,
} from "./core.js";
import { entryCategory, entryIcon } from "./merchants.js";
import { chevron, confirmSheet, setNav, sheet, showImage } from "./ui.js";
import { dictate } from "./voice.js";
import { entrySheet } from "./finance.js";

/* ================= помощник ================= */

let messages = [];
let cards = [];
let threads = [];
let threadId = localStorage.getItem("noda_chat_thread") || "main";

export async function openAssistant() {
  setNav({ title: "Помощник", right: '<button class="btn" data-clear>Очистить чат</button>' });
  $("#screen").classList.add("flush");
  $("#screen").innerHTML = `
    <div class="chat-split enter">
      <aside class="chat-side">
        <button class="btn primary" data-new-thread><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Новый чат</button>
        <div class="chat-list" id="chatList"><div class="loading" style="padding:24px">…</div></div>
      </aside>
      <section class="chat-main">
        <div class="chat-scroll" id="chatScroll"><div class="loading">Загружаю переписку…</div></div>
        <div class="composer">
          <button class="btn icon" data-mic aria-label="Продиктовать"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
          <textarea id="chatInput" rows="1" placeholder="Сообщение"></textarea>
          <button class="btn icon primary" data-send aria-label="Отправить"><svg viewBox="0 0 24 24"><path d="m5 12 14-7-5 14-2.5-6z"/></svg></button>
        </div>
      </section>
    </div>`;

  wireComposer();
  $("[data-new-thread]").addEventListener("click", newThread);
  $("[data-clear]")?.addEventListener("click", async () => {
    const ok = await confirmSheet({ title: "Очистить этот чат?", text: "Сообщения удалятся на всех устройствах.", confirmLabel: "Очистить", danger: true });
    if (!ok) return;
    try {
      await api(`/ai/messages?thread=${encodeURIComponent(threadId)}`, { method: "DELETE" });
      messages = []; cards = [];
      renderChat();
      loadThreads();
    } catch (error) { toast(error.message); }
  });

  await loadThreads();
  await loadMessages();
}

async function loadThreads() {
  try {
    const data = await api("/ai/threads");
    threads = data.threads || [];
    if (!threads.some((thread) => String(thread.id) === String(threadId))) threadId = "main";
  } catch { threads = [{ id: "main", title: "Основной", count: 0, main: true }]; }
  renderThreads();
}

function renderThreads() {
  const list = $("#chatList");
  if (!list) return;
  list.innerHTML = threads.map((thread) => {
    const preview = String(thread.preview || "").replace(/\s+/g, " ").slice(0, 48);
    return `
      <button class="chat-item${String(thread.id) === String(threadId) ? " active" : ""}" data-thread="${esc(thread.id)}">
        <strong>${esc(thread.title || "Новый чат")}</strong>
        <small>${esc(preview || "пока пусто")}</small>
        <span class="meta">${thread.count ? `${thread.count} сообщ.` : "новый"}${thread.updated_at ? ` · ${esc(ago(thread.updated_at))}` : ""}</span>
        ${thread.main ? "" : '<span class="more" data-thread-menu="' + esc(thread.id) + '">⋯</span>'}
      </button>`;
  }).join("");

  $$("[data-thread]", list).forEach((button) => button.addEventListener("click", (event) => {
    if (event.target.closest("[data-thread-menu]")) return;
    if (String(button.dataset.thread) === String(threadId)) return;
    threadId = button.dataset.thread;
    localStorage.setItem("noda_chat_thread", threadId);
    cards = [];
    renderThreads();
    loadMessages();
  }));
  $$("[data-thread-menu]", list).forEach((node) => node.addEventListener("click", (event) => {
    event.stopPropagation();
    threadMenu(threads.find((thread) => String(thread.id) === String(node.dataset.threadMenu)));
  }));
}

async function newThread() {
  try {
    const data = await api("/ai/threads", { method: "POST", body: JSON.stringify({ title: "Новый чат" }) });
    threads.unshift(data.thread);
    threadId = data.thread.id;
    localStorage.setItem("noda_chat_thread", threadId);
    messages = []; cards = [];
    renderThreads();
    renderChat();
    $("#chatInput")?.focus();
  } catch (error) { toast(error.message); }
}

function threadMenu(thread) {
  if (!thread) return;
  sheet({
    title: thread.title || "Чат",
    body: `<div class="sheet-actions">
        <button class="btn big" data-rename>Переименовать</button>
        <button class="btn big danger" data-drop>Удалить чат</button>
      </div>`,
    onMount(layer, close) {
      $("[data-rename]", layer).addEventListener("click", () => {
        close();
        sheet({
          title: "Название чата",
          body: `<label class="field"><span>Как назвать</span><input id="threadTitle" value="${esc(thread.title || "")}" autofocus></label>
                 <div class="sheet-actions"><button class="btn primary big" data-ok>Сохранить</button></div>`,
          onMount(inner, closeInner) {
            $("[data-ok]", inner).addEventListener("click", async () => {
              const title = $("#threadTitle", inner).value.trim();
              if (!title) return;
              try {
                await api(`/ai/threads/${thread.id}`, { method: "PATCH", body: JSON.stringify({ title }) });
                thread.title = title;
                closeInner();
                renderThreads();
              } catch (error) { toast(error.message); }
            });
          },
        });
      });
      $("[data-drop]", layer).addEventListener("click", async () => {
        close();
        const ok = await confirmSheet({ title: "Удалить чат?", text: "Вся переписка в нём исчезнет.", confirmLabel: "Удалить", danger: true });
        if (!ok) return;
        try {
          await api(`/ai/threads/${thread.id}`, { method: "DELETE" });
          threads = threads.filter((item) => String(item.id) !== String(thread.id));
          if (String(threadId) === String(thread.id)) { threadId = "main"; localStorage.setItem("noda_chat_thread", threadId); await loadMessages(); }
          renderThreads();
        } catch (error) { toast(error.message); }
      });
    },
  });
}

async function loadMessages() {
  const scroll = $("#chatScroll");
  if (scroll) scroll.innerHTML = '<div class="loading">Загружаю переписку…</div>';
  try {
    const data = await api(`/ai/messages?thread=${encodeURIComponent(threadId)}`);
    messages = data.messages || [];
  } catch (error) {
    if (scroll) scroll.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    return;
  }
  renderChat();
}

function wireComposer() {
  const input = $("#chatInput");
  const grow = () => { input.style.height = "auto"; input.style.height = `${Math.min(130, input.scrollHeight)}px`; };
  input.addEventListener("input", grow);
  input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } });
  $("[data-send]").addEventListener("click", send);
  $("[data-mic]").addEventListener("click", async () => {
    const text = await dictate({ hint: "Скажи, что нужно сделать" });
    if (!text) return;
    input.value = input.value ? `${input.value.trim()} ${text}` : text;
    grow();
    input.focus();
  });
}

/** Перерисовывается только лента — поле ввода и список чатов остаются на месте. */
function renderChat() {
  const scroll = $("#chatScroll");
  if (!scroll) return;
  let lastDay = "";
  const visible = messages.slice(-120);
  scroll.innerHTML = `
    <div class="chat" id="chat">
      ${visible.length ? visible.map((message, index) => {
        const day = new Date(message.created_at || Date.now()).toDateString();
        const chip = day !== lastDay ? `<div class="day-chip">${esc(dayTitle(message.created_at || Date.now()))}</div>` : "";
        lastDay = day;
        const fresh = index === visible.length - 1 ? " fresh" : "";
        return `${chip}<div class="bubble ${message.role === "user" ? "mine" : "theirs"}${fresh}">${format(message.content)}<time>${timeOf(message.created_at || Date.now())}</time></div>`;
      }).join("") : '<div class="empty">Что нужно сделать?<span>«запиши 500 на такси», «сколько мне должны за неделю»</span></div>'}
      ${cards.map(chatCard).join("")}
    </div>`;
  wireCards();
  scrollDown();
}

const format = (text) => esc(text || "").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
const scrollDown = () => { const scroll = $("#chatScroll"); if (scroll) scroll.scrollTop = scroll.scrollHeight; };

async function send() {
  const input = $("#chatInput");
  const value = input.value.trim();
  if (!value) return;
  input.value = "";
  input.style.height = "auto";
  messages.push({ role: "user", content: value, created_at: new Date().toISOString() });
  renderChat();
  $("#chat").insertAdjacentHTML("beforeend", '<div class="typing" id="typing"><i></i><i></i><i></i></div>');
  scrollDown();
  const before = await debtIds();
  try {
    const data = await api("/ai/assistant", { method: "POST", body: JSON.stringify({ text: value, thread: threadId }) });
    messages.push({ role: "assistant", content: data.reply || "Готово", created_at: new Date().toISOString() });
  } catch (error) {
    messages.push({ role: "assistant", content: `Не получилось: ${error.message}`, created_at: new Date().toISOString() });
  }
  $("#typing")?.remove();
  renderChat();
  loadThreads();
  const fresh = await freshDebts(before);
  if (fresh.length) { cards.push(...fresh); renderChat(); }
}

async function debtIds() {
  try { const data = await api("/debts?all=true"); return new Set((data.debts || []).map((debt) => String(debt.id))); } catch { return new Set(); }
}
async function freshDebts(before) {
  try { const data = await api("/debts?all=true"); return (data.debts || []).filter((debt) => !before.has(String(debt.id))); } catch { return []; }
}

function chatCard(debt) {
  const note = String(debt.note || "").replace(/\[(Тима|Даня|Женя)\]/, "").trim();
  const text = `${debt.counterparty || ""} ${note}`;
  return `
    <div class="chat-card fresh" data-card="${debt.id}">
      <div class="chat-card-top">
        ${entryIcon(text, 38)}
        <div><strong>${esc(debt.counterparty && !/компан/i.test(debt.counterparty) ? debt.counterparty : (note || "Запись"))}</strong>
        <small>${esc(note || entryCategory(text) || "")} · ${esc(dateTime(debt.occurred_at || debt.created_at))}</small></div>
        <b>${money(debt.amount)}</b>
      </div>
      <div class="chat-card-actions">
        <button data-card-settle="${debt.id}">${debt.settled ? "Вернуть" : "Выплачено"}</button>
        <button data-card-edit="${debt.id}">Изменить</button>
        <button data-card-remove="${debt.id}">Отменить</button>
      </div>
    </div>`;
}

function wireCards() {
  $$("[data-card-settle]").forEach((button) => button.addEventListener("click", async () => {
    const debt = cards.find((item) => String(item.id) === String(button.dataset.cardSettle));
    if (!debt) return;
    try { const data = await api(`/debts/${debt.id}`, { method: "PATCH", body: JSON.stringify({ settled: !debt.settled }) }); Object.assign(debt, data.debt); renderChat(); }
    catch (error) { toast(error.message); }
  }));
  $$("[data-card-edit]").forEach((button) => button.addEventListener("click", () => {
    const debt = cards.find((item) => String(item.id) === String(button.dataset.cardEdit));
    if (debt) entrySheet(debt, { onSaved: (updated) => { Object.assign(debt, updated || {}); renderChat(); } });
  }));
  $$("[data-card-remove]").forEach((button) => button.addEventListener("click", async () => {
    const debt = cards.find((item) => String(item.id) === String(button.dataset.cardRemove));
    if (!debt) return;
    const ok = await confirmSheet({ title: "Отменить запись?", text: `${esc(debt.counterparty || "Запись")} на ${money(debt.amount)} будет удалена.`, confirmLabel: "Отменить запись", danger: true });
    if (!ok) return;
    try { await api(`/debts/${debt.id}`, { method: "DELETE" }); cards = cards.filter((item) => String(item.id) !== String(debt.id)); renderChat(); } catch (error) { toast(error.message); }
  }));
}

/* ================= заметки ================= */

let noteTimer = null;

export async function openNotes() {
  setNav({ title: "Заметки", right: '<button class="btn primary" data-new><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Новая</button>' });
  $("#screen").innerHTML = '<div class="loading">Загружаю…</div>';
  $("[data-new]")?.addEventListener("click", createNote);
  try {
    const data = await api("/notes");
    state.notes = data.notes || [];
    if (!state.notes.some((note) => String(note.id) === String(state.noteId))) state.noteId = state.notes[0]?.id || null;
  } catch (error) {
    $("#screen").innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    return;
  }
  renderNotes();
}

/** Слева список с превью и задачами, справа лист заметки. */
function renderNotes() {
  const note = state.notes.find((item) => String(item.id) === String(state.noteId)) || null;
  $("#screen").classList.add("flush");
  $("#screen").innerHTML = `
    <div class="notes-split enter">
      <aside class="notes-side">
        <input class="notes-search" id="noteSearch" type="search" placeholder="Поиск по заметкам">
        <div class="notes-list" id="notesList"></div>
      </aside>
      <section class="note-paper" id="notePaper">
        ${note ? notePaper(note) : '<div class="empty">Выбери заметку слева<span>или создай новую</span></div>'}
      </section>
    </div>`;
  renderNoteList("");
  $("#noteSearch").addEventListener("input", (event) => renderNoteList(event.target.value));
  if (note) wireNote(note);
}

function renderNoteList(query) {
  const value = query.trim().toLowerCase();
  const list = state.notes.filter((note) => !value || `${note.title || ""} ${note.body || ""}`.toLowerCase().includes(value));
  $("#notesList").innerHTML = list.length ? list.map((note) => {
    const text = (note.body || "").replace(/[#>*\-\[\]`]/g, " ").replace(/\s+/g, " ").trim();
    const tasks = (note.body || "").match(/^- \[[ x]\]/gm)?.length || 0;
    const done = (note.body || "").match(/^- \[x\]/gm)?.length || 0;
    return `
      <button class="note-item${String(note.id) === String(state.noteId) ? " active" : ""}" data-note="${note.id}">
        <strong>${esc(note.title || text.slice(0, 30) || "Без названия")}</strong>
        <small>${esc(text.slice(0, 70) || "пустая заметка")}</small>
        <span class="note-meta">${esc(ago(note.updated_at))}${tasks ? ` · задач ${done}/${tasks}` : ""}</span>
      </button>`;
  }).join("") : '<div class="empty" style="padding:30px 10px">Ничего не найдено</div>';
  $$("[data-note]").forEach((button) => button.addEventListener("click", () => selectNote(button.dataset.note)));
}

/** Смена заметки — подменяем только лист, с мягкой анимацией вместо «перезагрузки». */
async function selectNote(id) {
  if (String(id) === String(state.noteId)) return;
  await flushNote();
  state.noteId = id;
  const note = state.notes.find((item) => String(item.id) === String(id));
  $$("[data-note]").forEach((button) => button.classList.toggle("active", String(button.dataset.note) === String(id)));
  const paper = $("#notePaper");
  if (!paper) { renderNotes(); return; }
  paper.classList.remove("swap");
  paper.innerHTML = note ? notePaper(note) : '<div class="empty">Выбери заметку слева<span>или создай новую</span></div>';
  void paper.offsetWidth;
  paper.classList.add("swap");
  paper.scrollTop = 0;
  if (note) wireNote(note);
}

function notePaper(note) {
  return `
    <div class="note-head">
      <span class="note-state" id="noteState">Сохранено ${esc(ago(note.updated_at))}</span>
      <div class="note-tools">
        <button class="btn" data-insert="[] ">Задача</button>
        <button class="btn" data-insert="## ">Заголовок</button>
        <button class="btn" data-more>Ещё</button>
      </div>
    </div>
    <div class="note-title" id="noteTitle" contenteditable="plaintext-only" data-placeholder="Заголовок">${esc(note.title || "")}</div>
    <div class="note-blocks" id="noteBlocks">${parseBlocks(note.body || "").map(blockHtml).join("")}</div>`;
}

function wireNote(note) {
  const paper = $("#notePaper");
  const blocks = $("#noteBlocks");

  const save = async () => {
    clearTimeout(noteTimer);
    const body = serialize([...blocks.children].map((node) => ({
      type: node.dataset.type,
      text: node.querySelector(".nb-body")?.textContent || "",
      done: node.classList.contains("done"),
    })));
    try {
      const data = await api(`/notes/${note.id}`, { method: "PUT", body: JSON.stringify({ title: $("#noteTitle").textContent.trim(), body, color: note.color }) });
      Object.assign(note, data.note);
      const item = state.notes.find((entry) => String(entry.id) === String(note.id));
      if (item) Object.assign(item, data.note);
      const label = $("#noteState");
      if (label) label.textContent = "Сохранено только что";
      renderNoteList($("#noteSearch")?.value || "");
    } catch (error) {
      const label = $("#noteState");
      if (label) label.textContent = `Не сохранилось: ${error.message}`;
    }
  };
  wireNote.save = save;

  const markDirty = () => {
    const label = $("#noteState");
    if (label) label.textContent = "Сохраняю…";
    clearTimeout(noteTimer);
    noteTimer = setTimeout(save, 700);
  };

  paper.addEventListener("input", (event) => { const block = event.target.closest(".nb"); if (block) shortcut(block); markDirty(); });
  paper.addEventListener("keydown", (event) => {
    const block = event.target.closest(".nb");
    if (!block || event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    const type = ["bullet", "number", "todo"].includes(block.dataset.type) ? block.dataset.type : "text";
    block.insertAdjacentHTML("afterend", blockHtml({ type, text: "", done: false }));
    block.nextElementSibling.querySelector(".nb-body")?.focus();
    markDirty();
  });
  paper.addEventListener("click", (event) => {
    const check = event.target.closest(".nb-check");
    if (!check) return;
    check.closest(".nb").classList.toggle("done");
    markDirty();
  });
  $$("[data-insert]", paper).forEach((button) => button.addEventListener("click", () => {
    const type = { "[] ": "todo", "## ": "h2" }[button.dataset.insert] || "text";
    blocks.insertAdjacentHTML("beforeend", blockHtml({ type, text: "", done: false }));
    blocks.lastElementChild.querySelector(".nb-body")?.focus();
    markDirty();
  }));
  $("[data-more]", paper).addEventListener("click", () => noteMenu(note));
}

async function flushNote() {
  if (wireNote.save) await wireNote.save();
}

async function createNote() {
  try {
    const data = await api("/notes", { method: "POST", body: JSON.stringify({ title: "", body: "" }) });
    state.notes.unshift(data.note);
    state.noteId = data.note.id;
    renderNotes();
    $("#noteTitle")?.focus();
  } catch (error) { toast(error.message); }
}

function noteMenu(note) {
  sheet({
    title: note.title || "Заметка",
    body: `<div class="sheet-actions">
        <button class="btn big" data-ai>Причесать через ИИ</button>
        <button class="btn big" data-copy>Скопировать текст</button>
        <button class="btn big danger" data-remove>Удалить заметку</button>
      </div>`,
    onMount(layer, close) {
      $("[data-ai]", layer).addEventListener("click", async () => {
        close();
        toast("Причёсываю…");
        try {
          const structured = await api("/notes/structure", { method: "POST", body: JSON.stringify({ text: note.body || "" }) });
          const data = await api(`/notes/${note.id}`, { method: "PUT", body: JSON.stringify({ title: note.title, body: structured.structuredBody || note.body, color: note.color }) });
          Object.assign(note, data.note);
          renderNotes();
          toast("Готово");
        } catch (error) { toast(error.message); }
      });
      $("[data-copy]", layer).addEventListener("click", () => {
        navigator.clipboard?.writeText(`${note.title || ""}\n\n${note.body || ""}`.trim());
        close();
        toast("Скопировано");
      });
      $("[data-remove]", layer).addEventListener("click", async () => {
        close();
        const ok = await confirmSheet({ title: "Удалить заметку?", text: "Она исчезнет на всех устройствах.", confirmLabel: "Удалить", danger: true });
        if (!ok) return;
        try {
          await api(`/notes/${note.id}`, { method: "DELETE" });
          state.notes = state.notes.filter((item) => String(item.id) !== String(note.id));
          state.noteId = state.notes[0]?.id || null;
          renderNotes();
        } catch (error) { toast(error.message); }
      });
    },
  });
}

function parseBlocks(text) {
  const blocks = [];
  for (const line of String(text || "").split("\n")) {
    const todo = line.match(/^- \[( |x)\] (.*)$/);
    if (todo) { blocks.push({ type: "todo", text: todo[2], done: todo[1] === "x" }); continue; }
    const rules = [[/^### (.*)$/, "h3"], [/^## (.*)$/, "h2"], [/^# (.*)$/, "h1"], [/^> (.*)$/, "quote"], [/^[-*] (.*)$/, "bullet"], [/^\d+\. (.*)$/, "number"], [/^---$/, "divider"]];
    const found = rules.find(([pattern]) => pattern.test(line));
    if (found) { blocks.push({ type: found[1], text: found[1] === "divider" ? "" : (line.match(found[0])?.[1] || ""), done: false }); continue; }
    blocks.push({ type: "text", text: line, done: false });
  }
  return blocks.length ? blocks : [{ type: "text", text: "", done: false }];
}

function serialize(blocks) {
  return blocks.map((block) => ({
    h1: `# ${block.text}`, h2: `## ${block.text}`, h3: `### ${block.text}`,
    quote: `> ${block.text}`, bullet: `- ${block.text}`, number: `1. ${block.text}`,
    todo: `- [${block.done ? "x" : " "}] ${block.text}`, divider: "---",
  }[block.type] ?? block.text)).join("\n");
}

function blockHtml(block) {
  if (block.type === "divider") return '<div class="nb nb-divider" data-type="divider"><hr></div>';
  if (block.type === "todo") return `<div class="nb nb-todo${block.done ? " done" : ""}" data-type="todo"><span class="nb-check"></span><span class="nb-body" contenteditable="plaintext-only" data-placeholder="Задача">${esc(block.text)}</span></div>`;
  return `<div class="nb nb-${block.type}" data-type="${block.type}"><span class="nb-body" contenteditable="plaintext-only" data-placeholder="Текст">${esc(block.text)}</span></div>`;
}

function shortcut(block) {
  const body = block.querySelector(".nb-body");
  const value = body?.textContent || "";
  const rules = [[/^# /, "h1"], [/^## /, "h2"], [/^### /, "h3"], [/^> /, "quote"], [/^- /, "bullet"], [/^\[\] /, "todo"], [/^--- ?$/, "divider"]];
  for (const [pattern, type] of rules) {
    if (pattern.test(value) && block.dataset.type !== type) {
      block.outerHTML = blockHtml({ type, text: value.replace(pattern, ""), done: false });
      const last = $("#noteBlocks").querySelector(`.nb-${type}:last-of-type .nb-body`);
      last?.focus();
      return;
    }
  }
}

/* ================= файлы ================= */

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;
const blobs = new Map();
let files = [];

export async function openFiles() {
  setNav({ title: "Файлы", right: '<label class="btn primary"><input id="filePicker" type="file" multiple hidden><svg viewBox="0 0 24 24"><path d="M12 19V5m-6 6 6-6 6 6"/></svg>Загрузить</label>' });
  $("#screen").innerHTML = '<div class="loading">Загружаю…</div>';
  $("#filePicker")?.addEventListener("change", (event) => upload([...event.target.files]));
  await loadFiles();
}

async function loadFiles() {
  try {
    const data = await api("/files");
    files = data.files || [];
  } catch (error) {
    $("#screen").innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    return;
  }
  renderFiles();
}

function renderFiles() {
  const days = new Map();
  for (const file of files) {
    const key = startOfDay(file.created_at).getTime();
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(file);
  }
  $("#screen").classList.add("flush");
  $("#screen").innerHTML = `
    <div class="enter">
      ${files.length ? `<div class="gallery">${[...days.entries()].map(([key, items]) => `
        <div class="gallery-day">${esc(dayTitle(Number(key)))} · ${items.length} шт · ${formatSize(items.reduce((sum, file) => sum + Number(file.size || 0), 0))}</div>
        ${items.map(tile).join("")}`).join("")}</div>`
        : '<div class="empty">Файлов пока нет<span>Загрузи — окажется на компьютере</span></div>'}
    </div>`;
  $$("[data-file]").forEach((node) => node.addEventListener("click", () => openFile(node.dataset.file)));
  loadThumbs();
}

function tile(file) {
  const image = IMAGE.test(file.original_name);
  return `<figure class="shot" data-file="${file.id}" title="${esc(file.original_name)}">
      <span class="shot-media" data-thumb="${file.id}">${image ? '<span class="spinner"></span>' : fileIcon(file.original_name, 36)}</span>
      <figcaption><strong>${esc(file.original_name)}</strong><span>${formatSize(file.size)} · ${timeOf(file.created_at)}</span></figcaption>
    </figure>`;
}

async function fileUrl(id) {
  if (blobs.has(id)) return blobs.get(id);
  const response = await fetch(`${API}/files/${encodeURIComponent(id)}/download`, { headers: { Authorization: `Bearer ${state.token}` } });
  if (!response.ok) throw new Error("не удалось получить файл");
  const url = URL.createObjectURL(await response.blob());
  blobs.set(id, url);
  return url;
}

async function loadThumbs() {
  const queue = $$("[data-thumb]")
    .map((node) => ({ node, file: files.find((item) => String(item.id) === String(node.dataset.thumb)) }))
    .filter(({ file }) => file && IMAGE.test(file.original_name));
  const worker = async () => {
    while (queue.length) {
      const { node, file } = queue.shift();
      if (!document.body.contains(node)) continue;
      try {
        const url = await fileUrl(file.id);
        await new Promise((resolve) => {
          const image = new Image();
          image.onload = () => { node.querySelector(".spinner")?.remove(); node.prepend(image); resolve(); };
          image.onerror = () => { node.innerHTML = fileIcon(file.original_name, 34); resolve(); };
          image.src = url;
        });
      } catch { node.innerHTML = fileIcon(file.original_name, 34); }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

async function openFile(id) {
  const file = files.find((item) => String(item.id) === String(id));
  if (!file) return;
  try {
    const url = await fileUrl(id);
    if (IMAGE.test(file.original_name)) { showImage(url); return; }
    const link = document.createElement("a");
    link.href = url;
    link.download = file.original_name;
    link.click();
  } catch (error) { toast(error.message); }
}

async function upload(list) {
  for (const file of list) {
    toast(`Отправляю ${file.name}…`);
    const form = new FormData();
    form.append("file", file);
    try { await api("/files", { method: "POST", body: form }); toast(`${file.name} отправлен`); }
    catch (error) { toast(error.message); }
  }
  await loadFiles();
}

/* ================= передача ================= */

let transferOff = [];
let statusTimer = null;
const openNodes = new Set(JSON.parse(localStorage.getItem("noda_tree_open") || '["projects"]'));

export async function openTransfer() {
  transferOff.forEach((off) => off());
  transferOff = [];
  setNav({ title: "Передача", left: "" });
  $("#screen").innerHTML = '<div class="loading">Смотрю устройства…</div>';
  await loadDevices();
  renderTransfer();
  transferOff.push(on("sync_remote_event", (message) => applyEvent(message.event || {})));
  transferOff.push(on("sync_remote_ack", () => { state.transfer.busy = true; scheduleRender(); }));
  // список устройств приходит часто — перерисовываем, только если он реально изменился
  transferOff.push(on("devices", () => {
    const mark = state.devices.map((item) => `${item.id}:${item.online ? 1 : 0}`).join(",");
    if (mark === state.transfer.devicesMark) return;
    state.transfer.devicesMark = mark;
    scheduleRender();
  }));
  requestStatus();
}

export function leaveTransfer() {
  clearTimeout(statusTimer);
  transferOff.forEach((off) => off());
  transferOff = [];
}

function requestStatus() {
  const device = currentDevice();
  if (!device?.online) return;
  state.transfer.phase = "Сравниваю с сервером…";
  state.transfer.waiting = true;
  renderTransfer();
  sendPc({ type: "sync_remote_status", reqId: uid() });
  // если компьютер молчит — не крутим «загрузку» бесконечно
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    if (!state.transfer.waiting) return;
    state.transfer.waiting = false;
    state.transfer.phase = "";
    renderTransfer();
    toast("Компьютер не ответил — проверь, запущено ли приложение Noda", "warn");
  }, 20000);
}

let renderTimer = null;
/** События сыплются пачками — перерисовываем не чаще раза в 300 мс. */
function scheduleRender() {
  if (renderTimer) return;
  renderTimer = setTimeout(() => { renderTimer = null; renderTransfer(); }, 300);
}

function applyEvent(event) {
  if (event.type === "status") {
    clearTimeout(statusTimer);
    state.transfer.status = event;
    state.transfer.statusAt = Date.now();
    state.transfer.waiting = false;
    state.transfer.phase = "";
    state.transfer.busy = false;
    renderTransfer();
    return;
  }
  if (event.type === "progress") {
    state.transfer.progress = event.totalBytes ? Math.round(((event.bytes || 0) / event.totalBytes) * 100) : 0;
    state.transfer.phase = `${event.direction === "pull" ? "Забираю" : "Отправляю"} · ${state.transfer.progress}%`;
    const bar = $("#trProgress");
    const label = $("#trPhase");
    if (bar && label) { bar.style.width = `${state.transfer.progress}%`; label.textContent = state.transfer.phase; return; }
  } else if (event.type === "done") { state.transfer.busy = false; state.transfer.phase = ""; toast("Передача завершена"); setTimeout(requestStatus, 500); }
  else if (event.type === "error" || event.type === "blocked") { state.transfer.busy = false; state.transfer.phase = ""; toast(event.error || "Остановлено"); }
  else if (event.msg) state.transfer.phase = event.msg;
  scheduleRender();
}

function renderTransfer() {
  if (state.section !== "transfer") return;
  const device = currentDevice();
  const status = state.transfer.status;
  const upload = Number(status?.upload || 0);
  const download = Number(status?.download || 0);
  const serverState = status?.serverState || {};
  const fresh = upload && download ? { kind: "warn", mark: "⇄", title: "Версии разошлись", text: `Здесь новее ${upload}, на сервере ${download}. Сначала отправь своё.` }
    : upload ? { kind: "local", mark: "↑", title: "Свежее — здесь", text: `${upload} файлов ещё не на сервере.` }
      : download ? { kind: "server", mark: "↓", title: "Свежее — на сервере", text: `${download} файлов пришли с другого устройства.` }
        : status ? { kind: "ok", mark: "✓", title: "Всё синхронно", text: "Локальные файлы совпадают с серверными." }
          : { kind: "", mark: "?", title: "Ещё не сверял", text: device?.online ? (state.transfer.waiting ? "Сравниваю…" : "Нажми «Проверить»") : "Компьютер не в сети." };

  // в шапке — главное: когда работа последний раз уехала на сервер
  setNav({
    title: "Передача",
    subtitle: serverState.lastPush?.at
      ? `На сервере — версия от ${dateTime(serverState.lastPush.at)} (${esc(deviceName(serverState.lastPush))}, ${ago(serverState.lastPush.at)})`
      : status ? "На сервер ещё ничего не отправляли" : "Смотрю состояние…",
    right: `<button class="btn" data-refresh ${device?.online ? "" : "disabled"}>${state.transfer.waiting ? "Проверяю…" : "Проверить"}</button>`,
  });

  $("#screen").innerHTML = `
    <div class="screen-inner enter">
      <div class="segmented">${state.devices.map((item) => `<button data-device="${item.id}" class="${String(item.id) === String(state.deviceId) ? "active" : ""}">${esc(deviceLabel(item))}</button>`).join("") || "<button class='active'>нет устройств</button>"}</div>

      <div class="state-card ${fresh.kind}" style="margin-top:14px">
        <div class="row"><span class="glyph">${fresh.mark}</span><div><strong>${esc(fresh.title)}</strong><p>${esc(fresh.text)}</p></div></div>
        <div class="metrics">
          <div class="metric"><span>Отправлено на сервер</span><b>${lastOp(serverState.lastPush)}</b></div>
          <div class="metric"><span>Забирали с сервера</span><b>${lastOp(serverState.lastPull)}</b></div>
          <div class="metric"><span>Файлов здесь</span><b>${status?.localFiles?.toLocaleString("ru-RU") ?? "—"}</b></div>
          <div class="metric"><span>Файлов на сервере</span><b>${status?.remoteFiles?.toLocaleString("ru-RU") ?? "—"}</b></div>
        </div>
        ${state.transfer.phase ? `<div class="progress"><i id="trProgress" style="width:${state.transfer.progress}%"></i></div><p id="trPhase" style="margin-top:8px;color:var(--label-2);font-size:13px">${esc(state.transfer.phase)}</p>` : ""}
      </div>

      <div class="sheet-actions" style="margin-top:14px">
        <button class="btn primary big" data-push ${device?.online ? "" : "disabled"}>Отправить на сервер${upload ? ` · ${upload}` : ""}</button>
        <button class="btn big" data-pull ${device?.online ? "" : "disabled"}>Забрать с сервера${download ? ` · ${download}` : ""}</button>
      </div>

      ${status ? tree(status) : ""}
    </div>`;

  $$("[data-device]").forEach((button) => button.addEventListener("click", () => { state.deviceId = button.dataset.device; state.transfer.status = null; renderTransfer(); requestStatus(); }));
  $("[data-refresh]")?.addEventListener("click", requestStatus);
  $("[data-push]")?.addEventListener("click", () => run("push"));
  $("[data-pull]")?.addEventListener("click", async () => {
    if (upload > 0) {
      const ok = await confirmSheet({ title: "Свежая версия — здесь", text: `На этом устройстве ${upload} файлов ещё не отправлено. Если забрать серверную версию, работа заменится более старой.`, confirmLabel: "Всё равно забрать", danger: true });
      if (!ok) return;
    }
    run("pull");
  });
  wireTree();
}

const deviceName = (event) => (event?.role === "laptop" ? "Ноутбук" : event?.device || "Компьютер");

/* ---------- проводник: разделы → проекты → папки ---------- */

const FOLDER_GLYPH = '<svg viewBox="0 0 24 24"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17z"/></svg>';
const FILE_GLYPH = '<svg viewBox="0 0 24 24"><path d="M7 4h7l4 4v12H7z"/><path d="M14 4v4h4"/></svg>';

function counters({ upload = 0, download = 0, conflicts = 0, blocked = 0 }) {
  const parts = [];
  if (upload) parts.push(`<span class="tag up">↑ ${upload}</span>`);
  if (download) parts.push(`<span class="tag down">↓ ${download}</span>`);
  if (conflicts) parts.push(`<span class="tag warn">⇄ ${conflicts}</span>`);
  if (blocked) parts.push(`<span class="tag warn">занято ${blocked}</span>`);
  if (!parts.length) parts.push('<span class="tag mute">совпадает</span>');
  return `<span style="display:flex;gap:6px">${parts.join("")}</span>`;
}

function tree(status) {
  const projects = status.projects || [];
  const scopes = (status.scopes || []).filter((scope) => projects.some((project) => project.scope === scope.id) || scope.localFiles);
  if (!scopes.length) return "";
  return `<div class="tree">${scopes.map((scope) => {
    const rows = projects.filter((project) => project.scope === scope.id);
    const open = openNodes.has(scope.id);
    return `
      <div class="tree-scope tree-node${open ? " open" : ""}" data-node="${esc(scope.id)}">
        <button class="tree-row" data-toggle="${esc(scope.id)}">
          <span class="caret">${chevron}</span>
          <span class="folder-ic ${scope.id.startsWith("codex") || scope.id === "claude" ? "mem" : ""}">${FOLDER_GLYPH}</span>
          <span><strong>${esc(scope.label)}</strong><small>${(scope.localFiles || 0).toLocaleString("ru-RU")} файлов здесь · ${(scope.remoteFiles || 0).toLocaleString("ru-RU")} на сервере</small></span>
          ${counters(scope)}
        </button>
        <div class="tree-body"><div>${scopeChildren(scope, rows) || '<div class="empty" style="padding:22px">Пусто</div>'}</div></div>
      </div>`;
  }).join("")}</div>`;
}

const CONTAINERS = { Work: "Работа", Tima: "Личные", MAMA: "Мама", Tools: "Инструменты", root: "Прочее в C:\\Claude" };

/** В «Проектах» между разделом и проектом есть папка-контейнер (Work, Tima) — показываем её. */
function scopeChildren(scope, rows) {
  if (scope.id !== "projects") return rows.map((project) => projectNode(project)).join("");
  const groups = new Map();
  for (const project of rows) {
    const parts = String(project.name || "").split("/");
    const key = parts.length > 1 ? parts[0] : "root";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(project);
  }
  return [...groups.entries()].map(([key, items]) => {
    const id = `container:${key}`;
    const open = openNodes.has(id);
    const totals = items.reduce((acc, item) => ({
      upload: acc.upload + (item.upload || 0),
      download: acc.download + (item.download || 0),
      conflicts: acc.conflicts + (item.conflicts || 0),
      blocked: acc.blocked + (item.blocked || 0),
      files: acc.files + (item.localFiles || 0),
    }), { upload: 0, download: 0, conflicts: 0, blocked: 0, files: 0 });
    return `
      <div class="tree-node${open ? " open" : ""}" data-node="${esc(id)}">
        <button class="tree-row" data-toggle="${esc(id)}">
          <span class="caret">${chevron}</span>
          <span class="folder-ic">${FOLDER_GLYPH}</span>
          <span><strong>${esc(CONTAINERS[key] || key)}</strong><small>${items.length} ${items.length === 1 ? "проект" : "проектов"} · ${totals.files.toLocaleString("ru-RU")} файлов</small></span>
          ${counters(totals)}
        </button>
        <div class="tree-body"><div>${items.map((project) => projectNode(project, 1)).join("")}</div></div>
      </div>`;
  }).join("");
}

function projectNode(project, depth = 0) {
  const id = `${project.scope}/${project.name}`;
  const open = openNodes.has(id);
  const folders = project.folders || [];
  return `
    <div class="tree-node${open ? " open" : ""}${depth ? " deep" : ""}" data-node="${esc(id)}">
      <button class="tree-row" data-toggle="${esc(id)}">
        <span class="caret">${folders.length ? chevron : ""}</span>
        <span class="folder-ic">${FOLDER_GLYPH}</span>
        <span><strong>${esc(project.label)}</strong><small>${(project.localFiles || 0).toLocaleString("ru-RU")} файлов${project.remoteLatest ? ` · на сервере ${dateTime(project.remoteLatest * 1000)}` : " · на сервере нет"}</small></span>
        ${counters(project)}
      </button>
      ${folders.length ? `<div class="tree-body"><div>${folders.slice(0, 40).map((folder) => `
        <div class="tree-row" style="cursor:default">
          <span class="caret"></span>
          <span class="folder-ic file">${FILE_GLYPH}</span>
          <span><strong>${esc(folder.name || "корень")}</strong><small>${folder.files} файлов · ${formatSize(folder.bytes)}</small></span>
          ${folder.blocked ? `<span class="tag warn">занято ${folder.blocked}</span>` : '<span class="tag mute">готово</span>'}
        </div>`).join("")}${folders.length > 40 ? `<div class="tree-row" style="cursor:default"><span></span><span></span><span><small>…и ещё ${folders.length - 40} папок</small></span><span></span></div>` : ""}</div></div>` : ""}
    </div>`;
}

function wireTree() {
  $$("[data-toggle]").forEach((button) => button.addEventListener("click", () => {
    const node = button.closest(".tree-node");
    const id = button.dataset.toggle;
    const open = node.classList.toggle("open");
    if (open) openNodes.add(id); else openNodes.delete(id);
    localStorage.setItem("noda_tree_open", JSON.stringify([...openNodes]));
  }));
}

function run(mode) {
  const map = { push: "sync_remote_push", pull: "sync_remote_pull" };
  if (sendPc({ type: map[mode], reqId: uid() })) {
    state.transfer.busy = true;
    state.transfer.progress = 0;
    state.transfer.phase = mode === "push" ? "Готовлю отправку…" : "Готовлю получение…";
    renderTransfer();
  }
}

const lastOp = (event) => (event?.at ? `${esc(event.role === "laptop" ? "Ноутбук" : event.device || "Компьютер")} · ${ago(event.at)}` : "не было");

/* ================= удалённый ПК ================= */

let remoteOff = [];
let connectTimer = null;
let lastMove = 0;

export async function openRemote() {
  remoteOff.forEach((off) => off());
  remoteOff = [];
  setNav({ title: "Удалённый ПК", left: "" });
  await loadDevices();
  renderRemote();
  remoteOff.push(on("screen_frame", (message) => {
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
    if (first) renderRemote();
  }));
  remoteOff.push(on("screens", (message) => { state.screen.screens = message.screens || []; }));
}

export function leaveRemote() {
  if (state.screen.active || state.screen.connecting) stopRemote();
  remoteOff.forEach((off) => off());
  remoteOff = [];
}

/** Экран компьютера занимает всю рабочую область — без полей и рамок; управление в шапке. */
function renderRemote() {
  if (state.section !== "remote") return;
  const device = currentDevice();
  setNav({
    title: "Удалённый ПК",
    right: `
      <div class="segmented">${state.devices.map((item) => `<button data-device="${item.id}" class="${String(item.id) === String(state.deviceId) ? "active" : ""}">${esc(deviceLabel(item))}</button>`).join("") || "<button class='active'>нет устройств</button>"}</div>
      ${state.screen.active ? '<button class="btn" data-full>На весь экран</button>' : ""}
      <button class="btn ${state.screen.active ? "danger" : "primary"}" data-toggle>${state.screen.active ? "Отключиться" : state.screen.connecting ? "Подключаюсь…" : "Подключиться"}</button>`,
  });
  $("#screen").classList.add("flush");
  $("#screen").innerHTML = `
    <div class="stage full" id="stage" tabindex="0">
      <div class="hint" id="remoteHint">${state.screen.connecting ? "Подключаюсь…" : device?.online ? "Нажми «Подключиться»" : "Компьютер не в сети"}</div>
      <img id="remoteImage" alt="Экран компьютера" hidden draggable="false">
    </div>`;

  $$("[data-device]").forEach((button) => button.addEventListener("click", () => { if (state.screen.active) stopRemote(); state.deviceId = button.dataset.device; renderRemote(); }));
  $("[data-toggle]").addEventListener("click", () => (state.screen.active ? stopRemote() : startRemote()));
  $("[data-full]")?.addEventListener("click", () => $("#stage").requestFullscreen?.());
  if (state.screen.active) { $("#remoteHint").hidden = true; wireRemoteInput(); }
}

function startRemote() {
  const device = currentDevice();
  if (!device?.online) { toast("Компьютер не в сети"); return; }
  state.screen.connecting = true;
  renderRemote();
  sendPc({ type: "screen_start", fps: 22, quality: 60, width: 1280 }, device.id);
  sendPc({ type: "screen_list" }, device.id);
  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (state.screen.active) return;
    state.screen.connecting = false;
    renderRemote();
    toast("Компьютер не прислал экран");
  }, 9000);
}

function stopRemote() {
  clearTimeout(connectTimer);
  if (state.deviceId) sendPc({ type: "screen_stop" }, state.deviceId);
  state.screen.active = false;
  state.screen.connecting = false;
  renderRemote();
}

function wireRemoteInput() {
  const image = $("#remoteImage");
  if (!image) return;
  const point = (event) => {
    const rect = image.getBoundingClientRect();
    return {
      nx: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      ny: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  image.addEventListener("pointerdown", (event) => sendPc({ type: "screen_input", action: "down", ...point(event) }));
  image.addEventListener("pointerup", (event) => sendPc({ type: "screen_input", action: "up", ...point(event) }));
  image.addEventListener("pointermove", (event) => {
    const now = Date.now();
    if (now - lastMove < 45) return;
    lastMove = now;
    sendPc({ type: "screen_input", action: "move", ...point(event) });
  });
  image.addEventListener("wheel", (event) => { event.preventDefault(); sendPc({ type: "screen_input", action: "scroll", ...point(event), dy: event.deltaY > 0 ? -120 : 120 }); }, { passive: false });
}

/* ================= проекты ================= */

let projectList = [];

export async function openProjects() {
  setNav({ title: "Проекты", left: "" });
  const { PROJECTS } = await import("./projects-data.js");
  projectList = PROJECTS;
  $("#screen").innerHTML = `
    <div class="screen-inner enter">
      <div class="project-grid">
        ${PROJECTS.map((project) => `
          <button class="project-card" data-open="${project.id}">
            ${project.screens?.[0] ? `<img class="project-cover" src="${project.screens[0]}" alt="" loading="lazy">` : ""}
            <div class="project-info">
              <img src="${project.icon}" alt="">
              <div><strong>${esc(project.name)}</strong><small>${esc(project.category)}</small></div>
              ${chevron}
            </div>
          </button>`).join("")}
      </div>
    </div>`;

  $$("[data-open]").forEach((button) => button.addEventListener("click", () => {
    const project = projectList.find((item) => item.id === button.dataset.open);
    if (document.startViewTransition) document.startViewTransition(() => openProjectCard(project));
    else openProjectCard(project);
  }));
}

/** Проект раскрывается на весь раздел — закрывается крестиком или Escape. */
function openProjectCard(project) {
  if (!project) return;
  const layer = document.createElement("div");
  layer.className = "project-full";
  layer.innerHTML = `
    <div class="project-full-head">
      <img src="${project.icon}" alt="">
      <div><strong>${esc(project.name)}</strong><small>${esc(project.category)}${project.stack ? ` · ${esc(project.stack)}` : ""}</small></div>
      <button class="btn icon" data-close-project aria-label="Закрыть">✕</button>
    </div>
    <div class="project-full-body">
      <p>${esc(project.description || "")}</p>
      <div class="project-links">
        <a class="btn primary" href="${project.url}" target="_blank" rel="noreferrer">Открыть</a>
        <button class="btn" data-copy="${esc(project.connection?.path || "")}">Скопировать путь</button>
      </div>
      ${project.connection ? `<div class="project-facts">
        ${Object.entries({ Сервер: project.connection.server, "База данных": project.connection.database, Папка: project.connection.path })
          .filter(([, value]) => value)
          .map(([title, value]) => `<div class="fact"><span>${title}</span><b>${esc(value)}</b></div>`).join("")}
      </div>` : ""}
      ${project.screens?.length ? `<div class="project-shots">${project.screens.map((shot) => `<img src="${shot}" alt="" loading="lazy" data-shot="${shot}">`).join("")}</div>` : ""}
    </div>`;
  $("#screen").appendChild(layer);

  const close = () => {
    document.removeEventListener("keydown", onKey);
    if (document.startViewTransition) document.startViewTransition(() => layer.remove());
    else layer.remove();
  };
  const onKey = (event) => { if (event.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  $("[data-close-project]", layer).addEventListener("click", close);
  $$("[data-shot]", layer).forEach((image) => image.addEventListener("click", () => showImage(image.dataset.shot)));
  $("[data-copy]", layer).addEventListener("click", () => {
    const value = $("[data-copy]", layer).dataset.copy;
    if (!value) { toast("Путь не указан"); return; }
    navigator.clipboard?.writeText(value);
    toast("Путь скопирован");
  });
}
