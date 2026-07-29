// Заметки — блочный редактор в духе Notion: строка превращается в блок по разметке,
// всё сохраняется само, кнопок «сохранить/удалить» в шапке нет.

import { $, $$, ago, api, confirmAction, esc, openModal, state, toast } from "./core.js";
import { dictate } from "./voice.js";

let saveTimer = null;
let dirty = false;

/* ---------- разбор markdown в блоки ---------- */

const BLOCK_RULES = [
  [/^### (.*)$/, "h3"],
  [/^## (.*)$/, "h2"],
  [/^# (.*)$/, "h1"],
  [/^> (.*)$/, "quote"],
  [/^- \[( |x)\] (.*)$/, "todo"],
  [/^[-*] (.*)$/, "bullet"],
  [/^\d+\. (.*)$/, "number"],
  [/^---$/, "divider"],
];

function parseBlocks(text) {
  const lines = String(text || "").split("\n");
  const blocks = [];
  let inCode = false;
  let codeLines = [];
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) { blocks.push({ type: "code", text: codeLines.join("\n"), done: false }); codeLines = []; inCode = false; }
      else inCode = true;
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    const todo = line.match(/^- \[( |x)\] (.*)$/);
    if (todo) { blocks.push({ type: "todo", text: todo[2], done: todo[1] === "x" }); continue; }
    const rule = BLOCK_RULES.find(([pattern]) => pattern.test(line));
    if (rule) {
      const [pattern, type] = rule;
      blocks.push({ type, text: type === "divider" ? "" : (line.match(pattern)?.[1] || ""), done: false });
      continue;
    }
    blocks.push({ type: "text", text: line, done: false });
  }
  if (inCode && codeLines.length) blocks.push({ type: "code", text: codeLines.join("\n"), done: false });
  if (!blocks.length) blocks.push({ type: "text", text: "", done: false });
  return blocks;
}

function serializeBlocks(blocks) {
  return blocks.map((block) => {
    switch (block.type) {
      case "h1": return `# ${block.text}`;
      case "h2": return `## ${block.text}`;
      case "h3": return `### ${block.text}`;
      case "quote": return `> ${block.text}`;
      case "bullet": return `- ${block.text}`;
      case "number": return `1. ${block.text}`;
      case "todo": return `- [${block.done ? "x" : " "}] ${block.text}`;
      case "divider": return "---";
      case "code": return `\`\`\`\n${block.text}\n\`\`\``;
      default: return block.text;
    }
  }).join("\n");
}

/* ---------- страница ---------- */

export async function openNotes() {
  $("#workPanel").innerHTML = '<div class="view-loading">Загружаю заметки…</div>';
  try {
    const data = await api("/notes");
    state.notes = data.notes || [];
    if (!state.notes.some((note) => String(note.id) === String(state.noteId))) state.noteId = state.notes[0]?.id || null;
    render();
  } catch (error) {
    $("#workPanel").innerHTML = `<div class="view-error">${esc(error.message)}</div>`;
  }
}

function render() {
  const note = state.notes.find((item) => String(item.id) === String(state.noteId)) || null;
  $("#workPanel").innerHTML = `
    <div class="view">
      <div class="notes-split">
        <aside class="notes-rail">
          <div class="notes-rail-head">
            <input id="noteSearch" type="search" placeholder="Поиск" autocomplete="off">
            <button class="key light square" data-new title="Новая заметка">＋</button>
          </div>
          <div class="notes-list" id="notesList"></div>
        </aside>
        <section class="note-page">${note ? notePage(note) : '<div class="note-blank">Выбери заметку слева или создай новую</div>'}</section>
      </div>
    </div>`;

  renderList("");
  $("[data-new]").addEventListener("click", createNote);
  $("#noteSearch").addEventListener("input", (event) => renderList(event.target.value));
  if (note) wireEditor(note);
}

function renderList(query) {
  const value = query.trim().toLowerCase();
  const list = state.notes.filter((note) => !value || `${note.title || ""} ${note.body || ""}`.toLowerCase().includes(value));
  $("#notesList").innerHTML = list.length ? list.map((note) => `
    <button class="note-item${String(note.id) === String(state.noteId) ? " active" : ""}" data-note="${note.id}">
      <strong>${esc(note.title || "Без названия")}</strong>
      <small>${esc((note.body || "").replace(/[#>*\-\[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 64) || "Пустая заметка")}</small>
      <span>${ago(note.updated_at)}</span>
    </button>`).join("") : '<div class="note-blank small">Ничего не найдено</div>';
  $$("[data-note]").forEach((button) => button.addEventListener("click", async () => {
    await flushSave();
    state.noteId = button.dataset.note;
    render();
  }));
}

function notePage(note) {
  const blocks = parseBlocks(note.body || "");
  return `
    <div class="note-top">
      <span class="note-state" id="noteState">Сохранено ${esc(ago(note.updated_at))}</span>
      <div class="note-tools">
        <button class="key sm" data-insert="- ">Список</button>
        <button class="key sm" data-insert="[] ">Задача</button>
        <button class="key sm" data-insert="## ">Заголовок</button>
        <button class="key square" data-dictate title="Продиктовать в конец"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
        <button class="key square" data-menu title="Ещё"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>
      </div>
    </div>
    <div class="note-doc" id="noteDoc">
      <div class="note-sheet">
        <div class="note-title" id="noteTitle" contenteditable="plaintext-only" data-placeholder="Заголовок">${esc(note.title || "")}</div>
        <div class="note-blocks" id="noteBlocks">${blocks.map(blockHtml).join("")}</div>
      </div>
    </div>`;
}

function blockHtml(block) {
  if (block.type === "divider") return '<div class="nb nb-divider" data-type="divider"><hr></div>';
  if (block.type === "todo") {
    return `<div class="nb nb-todo${block.done ? " done" : ""}" data-type="todo"><button class="nb-check" data-check aria-label="Готово"></button><span class="nb-body" contenteditable="plaintext-only" data-placeholder="Задача">${esc(block.text)}</span></div>`;
  }
  const placeholder = { h1: "Заголовок", h2: "Подзаголовок", h3: "Раздел", quote: "Цитата", code: "Код", bullet: "Пункт", number: "Пункт" }[block.type] || "Текст…";
  return `<div class="nb nb-${block.type}" data-type="${block.type}"><span class="nb-body" contenteditable="plaintext-only" data-placeholder="${placeholder}">${esc(block.text)}</span></div>`;
}

/* ---------- поведение редактора ---------- */

function wireEditor(note) {
  const doc = $("#noteDoc");
  const blocksNode = $("#noteBlocks");

  const collect = () => [...blocksNode.children].map((node) => ({
    type: node.dataset.type,
    text: node.querySelector(".nb-body")?.textContent || "",
    done: node.classList.contains("done"),
  }));

  const markDirty = () => {
    dirty = true;
    $("#noteState").textContent = "Сохраняю…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(note), 700);
  };

  doc.addEventListener("input", (event) => {
    const block = event.target.closest(".nb");
    if (block) applyShortcut(block);
    markDirty();
  });

  doc.addEventListener("keydown", (event) => {
    const block = event.target.closest(".nb");
    if (!block) return;
    if (event.key === "Enter" && !event.shiftKey && block.dataset.type !== "code") {
      event.preventDefault();
      const type = ["bullet", "number", "todo"].includes(block.dataset.type) ? block.dataset.type : "text";
      const text = block.querySelector(".nb-body");
      if (["bullet", "number", "todo"].includes(block.dataset.type) && !text.textContent.trim()) {
        block.outerHTML = blockHtml({ type: "text", text: "", done: false });
        focusBlock(blocksNode.children[[...blocksNode.children].length - 1]);
        markDirty();
        return;
      }
      block.insertAdjacentHTML("afterend", blockHtml({ type, text: "", done: false }));
      focusBlock(block.nextElementSibling);
      markDirty();
      return;
    }
    if (event.key === "Backspace") {
      const text = block.querySelector(".nb-body");
      const empty = !text || !text.textContent;
      if (empty && block.dataset.type !== "text") {
        event.preventDefault();
        block.outerHTML = blockHtml({ type: "text", text: "", done: false });
        focusBlock(blocksNode.querySelector(".nb:last-child"));
        markDirty();
        return;
      }
      if (empty && blocksNode.children.length > 1) {
        event.preventDefault();
        const previous = block.previousElementSibling;
        block.remove();
        if (previous) focusBlock(previous, true);
        markDirty();
      }
    }
  });

  blocksNode.addEventListener("click", (event) => {
    const check = event.target.closest("[data-check]");
    if (!check) return;
    check.closest(".nb").classList.toggle("done");
    markDirty();
  });

  $("#noteTitle").addEventListener("input", markDirty);
  $("#noteTitle").addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); focusBlock(blocksNode.firstElementChild); }
  });

  $("[data-dictate]").addEventListener("click", async () => {
    const text = await dictate({ hint: "Наговори текст заметки" });
    if (!text) return;
    blocksNode.insertAdjacentHTML("beforeend", blockHtml({ type: "text", text, done: false }));
    markDirty();
  });

  // кнопки-заготовки: добавляют блок нужного типа в конец
  $$("[data-insert]", doc.parentElement).forEach((button) => button.addEventListener("click", () => {
    const type = { "- ": "bullet", "[] ": "todo", "## ": "h2" }[button.dataset.insert] || "text";
    blocksNode.insertAdjacentHTML("beforeend", blockHtml({ type, text: "", done: false }));
    focusBlock(blocksNode.lastElementChild);
    markDirty();
  }));

  $("[data-menu]").addEventListener("click", () => openNoteMenu(note));

  window.addEventListener("beforeunload", flushSave);
  doc.querySelector(".nb-body")?.focus();

  async function save(current) {
    clearTimeout(saveTimer);
    const body = serializeBlocks(collect());
    const title = $("#noteTitle")?.textContent.trim() || "";
    try {
      const data = await api(`/notes/${current.id}`, { method: "PUT", body: JSON.stringify({ title, body, color: current.color }) });
      Object.assign(current, data.note);
      dirty = false;
      const label = $("#noteState");
      if (label) label.textContent = "Сохранено только что";
      const item = state.notes.find((note) => String(note.id) === String(current.id));
      if (item) Object.assign(item, data.note);
      renderList($("#noteSearch")?.value || "");
    } catch (error) {
      const label = $("#noteState");
      if (label) label.textContent = `Не сохранилось: ${error.message}`;
    }
  }

  wireEditor.save = save;
}

function focusBlock(block, toEnd = false) {
  const text = block?.querySelector(".nb-body");
  if (!text) return;
  text.focus();
  if (!toEnd) return;
  const range = document.createRange();
  range.selectNodeContents(text);
  range.collapse(false);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Разметка в начале строки превращает блок в нужный тип. */
function applyShortcut(block) {
  const text = block.querySelector(".nb-body");
  if (!text) return;
  const value = text.textContent;
  const rules = [
    [/^# /, "h1"], [/^## /, "h2"], [/^### /, "h3"],
    [/^> /, "quote"], [/^- /, "bullet"], [/^\d+\. /, "number"],
    [/^\[\] /, "todo"], [/^\[ \] /, "todo"], [/^```/, "code"], [/^--- ?$/, "divider"],
  ];
  for (const [pattern, type] of rules) {
    if (pattern.test(value) && block.dataset.type !== type) {
      const rest = value.replace(pattern, "");
      block.outerHTML = blockHtml({ type, text: rest, done: false });
      const list = [...$("#noteBlocks").children];
      const next = list.find((node) => node.dataset.type === type && (node.querySelector(".nb-body")?.textContent || "") === rest);
      focusBlock(next || list[list.length - 1], true);
      return;
    }
  }
}

async function flushSave() {
  if (!dirty) return;
  const note = state.notes.find((item) => String(item.id) === String(state.noteId));
  if (note && wireEditor.save) await wireEditor.save(note);
}

/* ---------- действия с заметкой ---------- */

async function createNote() {
  try {
    const data = await api("/notes", { method: "POST", body: JSON.stringify({ title: "", body: "" }) });
    state.notes.unshift(data.note);
    state.noteId = data.note.id;
    render();
    $("#noteTitle")?.focus();
  } catch (error) {
    toast(error.message, "warn");
  }
}

function openNoteMenu(note) {
  openModal(`
    <h2>${esc(note.title || "Заметка")}</h2>
    <div class="menu-list">
      <button class="menu-item" data-structure><b>Причесать через ИИ</b><small>Сделает структурную версию текста</small></button>
      <button class="menu-item" data-copy><b>Скопировать текст</b><small>В буфер обмена</small></button>
      <button class="menu-item danger" data-remove><b>Удалить заметку</b><small>Уберётся во всех приложениях</small></button>
    </div>
    <div class="modal-actions"><button class="key" data-close>Закрыть</button></div>`, {
    onMount(layer, close) {
      $("[data-structure]", layer).addEventListener("click", async () => {
        close();
        toast("Причёсываю текст…");
        try {
          const structured = await api("/notes/structure", { method: "POST", body: JSON.stringify({ text: note.body || "" }) });
          const data = await api(`/notes/${note.id}`, { method: "PUT", body: JSON.stringify({ title: note.title, body: structured.structuredBody || note.body, color: note.color }) });
          Object.assign(note, data.note);
          render();
          toast("Готово");
        } catch (error) { toast(error.message, "warn"); }
      });
      $("[data-copy]", layer).addEventListener("click", () => {
        navigator.clipboard?.writeText(`${note.title || ""}\n\n${note.body || ""}`.trim());
        close();
        toast("Скопировано");
      });
      $("[data-remove]", layer).addEventListener("click", async () => {
        close();
        const ok = await confirmAction({ title: "Удалить заметку?", text: "Она исчезнет и на телефоне, и на компьютере.", confirmLabel: "Удалить", danger: true });
        if (!ok) return;
        try {
          await api(`/notes/${note.id}`, { method: "DELETE" });
          state.notes = state.notes.filter((item) => String(item.id) !== String(note.id));
          state.noteId = state.notes[0]?.id || null;
          dirty = false;
          render();
          toast("Удалено");
        } catch (error) { toast(error.message, "warn"); }
      });
    },
  });
}
