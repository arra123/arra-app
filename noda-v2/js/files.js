// Файлы — то, что улетело с телефона на компьютер. Фотографии видно сразу, как на Диске.

import { $, $$, API, api, dayTitle, esc, fileIcon, formatSize, startOfDay, state, timeOf, toast } from "./core.js";

let files = [];
let mode = localStorage.getItem("noda_files_mode") || "grid";
const blobs = new Map(); // id → object URL, чтобы не качать одно и то же дважды

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;
const HEIC = /\.(heic|heif)$/i;

export async function openFiles() {
  $("#workPanel").innerHTML = `
    <div class="view">
      <div class="bar">
        <h1>Файлы</h1>
        <div class="seg" id="filesMode">
          <button data-mode="grid" class="${mode === "grid" ? "active" : ""}">Плитка</button>
          <button data-mode="list" class="${mode === "list" ? "active" : ""}">Список</button>
        </div>
        <div class="bar-spacer"></div>
        <button class="key" data-refresh>Обновить</button>
        <label class="key light"><input id="filePicker" type="file" multiple hidden>Загрузить</label>
      </div>
      <div class="scroll" id="filesScroll">
        <div class="drop" id="dropZone">Перетащи файлы сюда — они уйдут на компьютер, путь ляжет в буфер</div>
        <div id="filesList"><div class="empty-line">Загружаю…</div></div>
      </div>
    </div>`;

  $("#filePicker").addEventListener("change", (event) => upload([...event.target.files]));
  $("[data-refresh]").addEventListener("click", load);
  $$("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    mode = button.dataset.mode;
    localStorage.setItem("noda_files_mode", mode);
    $$("[data-mode]").forEach((item) => item.classList.toggle("active", item === button));
    renderList();
  }));

  const zone = $("#dropZone");
  ["dragenter", "dragover"].forEach((type) => zone.addEventListener(type, (event) => { event.preventDefault(); zone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((type) => zone.addEventListener(type, (event) => {
    event.preventDefault();
    zone.classList.remove("drag");
    if (type === "drop") upload([...event.dataTransfer.files]);
  }));
  document.addEventListener("dragover", preventDefault);
  document.addEventListener("drop", preventDefault);

  await load();
}

function preventDefault(event) { event.preventDefault(); }

async function load() {
  try {
    const data = await api("/files");
    files = data.files || [];
    renderList();
  } catch (error) {
    $("#filesList").innerHTML = `<div class="view-error">${esc(error.message)}</div>`;
  }
}

function renderList() {
  const list = $("#filesList");
  if (!list) return;
  if (!files.length) {
    list.innerHTML = '<div class="empty-block">Файлов пока нет<span>Загрузи первый — он окажется на компьютере</span></div>';
    return;
  }
  const days = new Map();
  for (const file of files) {
    const key = startOfDay(file.created_at).getTime();
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(file);
  }
  list.innerHTML = [...days.entries()].map(([key, items]) => `
    <section class="day-block">
      <div class="day-head"><span>${esc(dayTitle(Number(key)))}</span><b>${items.length} шт · ${formatSize(items.reduce((sum, file) => sum + Number(file.size || 0), 0))}</b></div>
      ${mode === "grid" ? `<div class="file-grid">${items.map(fileCard).join("")}</div>` : `<div class="rows">${items.map(fileRow).join("")}</div>`}
    </section>`).join("");

  $$("[data-open]").forEach((node) => node.addEventListener("click", () => openFile(node.dataset.open)));
  $$("[data-download]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); download(button.dataset.download); }));
  loadThumbs();
}

function fileCard(file) {
  const image = IMAGE.test(file.original_name) || HEIC.test(file.original_name);
  return `
    <figure class="file-card" data-open="${file.id}" tabindex="0">
      <div class="file-thumb" data-thumb="${file.id}">${image ? '<span class="thumb-loading"></span>' : fileIcon(file.original_name, 44)}</div>
      <figcaption>
        <strong>${esc(file.original_name)}</strong>
        <span>${formatSize(file.size)} · ${timeOf(file.created_at)}</span>
      </figcaption>
      <button class="file-dl" data-download="${file.id}" aria-label="Скачать"><svg viewBox="0 0 24 24"><path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 20h14"/></svg></button>
    </figure>`;
}

function fileRow(file) {
  const delivered = file.status === "delivered";
  return `
    <div class="row file" data-open="${file.id}" role="button" tabindex="0">
      <span class="row-thumb" data-thumb="${file.id}">${fileIcon(file.original_name, 38)}</span>
      <div class="row-main"><strong>${esc(file.original_name)}</strong><small>${formatSize(file.size)}</small></div>
      <span class="tag ${delivered ? "ok" : ""}">${delivered ? "на компьютере" : "на сервере"}</span>
      <span class="row-time">${timeOf(file.created_at)}</span>
      <button class="row-check" data-download="${file.id}" aria-label="Скачать"><svg viewBox="0 0 24 24"><path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 20h14"/></svg></button>
    </div>`;
}

/* ---------- миниатюры ---------- */

async function fileUrl(id) {
  if (blobs.has(id)) return blobs.get(id);
  const response = await fetch(`${API}/files/${encodeURIComponent(id)}/download`, { headers: { Authorization: `Bearer ${state.token}` } });
  if (!response.ok) throw new Error("не удалось получить файл");
  const url = URL.createObjectURL(await response.blob());
  blobs.set(id, url);
  return url;
}

/** Превью только для форматов, которые браузер реально рисует. По четыре штуки за раз. */
async function loadThumbs() {
  const targets = $$("[data-thumb]")
    .map((node) => ({ node, file: files.find((item) => String(item.id) === String(node.dataset.thumb)) }))
    .filter(({ file }) => file && IMAGE.test(file.original_name));

  // HEIC с айфона браузер не покажет — сразу рисуем значок с пометкой формата
  $$("[data-thumb]").forEach((node) => {
    const file = files.find((item) => String(item.id) === String(node.dataset.thumb));
    if (file && HEIC.test(file.original_name)) {
      node.innerHTML = `${fileIcon(file.original_name, node.classList.contains("row-thumb") ? 38 : 44)}<em class="thumb-format">HEIC</em>`;
    }
  });

  const queue = [...targets];
  const worker = async () => {
    while (queue.length) {
      const { node, file } = queue.shift();
      if (!document.body.contains(node)) continue;
      const size = node.classList.contains("row-thumb") ? 38 : 44;
      try {
        const url = await fileUrl(file.id);
        await new Promise((resolve) => {
          const image = new Image();
          image.alt = file.original_name;
          image.decoding = "async";
          image.onload = () => { node.innerHTML = ""; node.appendChild(image); resolve(); };
          image.onerror = () => { node.innerHTML = fileIcon(file.original_name, size); resolve(); };
          image.src = url;
        });
      } catch {
        node.innerHTML = fileIcon(file.original_name, size);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

/* ---------- просмотр ---------- */

async function openFile(id) {
  const file = files.find((item) => String(item.id) === String(id));
  if (!file) return;
  if (!IMAGE.test(file.original_name) && !HEIC.test(file.original_name)) { download(id); return; }
  try {
    const url = await fileUrl(id);
    const dialog = $("#lightbox");
    $("#lightboxImage").src = url;
    $("#lightboxCount").textContent = `${file.original_name} · ${formatSize(file.size)}`;
    dialog.showModal();
  } catch (error) {
    toast(error.message, "warn");
  }
}

/* ---------- загрузка и скачивание ---------- */

async function upload(list) {
  if (!list.length) return;
  const zone = $("#dropZone");
  for (const file of list) {
    if (zone) zone.textContent = `Отправляю ${file.name}…`;
    const form = new FormData();
    form.append("file", file);
    try {
      await api("/files", { method: "POST", body: form });
      toast(`${file.name} отправлен`);
    } catch (error) {
      toast(`${file.name}: ${error.message}`, "warn");
    }
  }
  if (zone) zone.textContent = "Перетащи файлы сюда — они уйдут на компьютер, путь ляжет в буфер";
  await load();
}

async function download(id) {
  const file = files.find((item) => String(item.id) === String(id));
  try {
    const url = await fileUrl(id);
    const link = document.createElement("a");
    link.href = url;
    link.download = file?.original_name || "download";
    link.click();
  } catch (error) {
    toast(error.message, "warn");
  }
}
