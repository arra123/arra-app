// Оболочка светлой версии: панель инструментов, стеклянные листы, просмотр картинок.

import { $, $$, esc } from "./core.js";

/** Верхняя панель раздела: заголовок, подпись и кнопки справа. */
export function setToolbar({ title, subtitle = "", actions = "", left = "" }) {
  $("#toolbar").innerHTML = `
    ${left}
    <div><h1>${esc(title)}</h1>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ""}</div>
    <div class="spacer"></div>
    ${actions}`;
}

/** Лист по центру: стекло, пружинное появление, закрытие по фону и Escape. */
export function sheet({ title = "", body = "", right = "", left = "Отмена", onMount } = {}) {
  const layer = document.createElement("div");
  layer.className = "sheet-layer";
  layer.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-head">
        <div>${left ? `<button class="link" data-close>${esc(left)}</button>` : ""}</div>
        <strong>${esc(title)}</strong>
        <div style="text-align:right">${right}</div>
      </div>
      <div class="sheet-body">${body}</div>
    </div>`;
  document.body.appendChild(layer);

  const close = () => {
    layer.classList.remove("open");
    setTimeout(() => layer.remove(), 400);
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (event) => { if (event.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  layer.addEventListener("mousedown", (event) => { if (event.target === layer) close(); });
  $$("[data-close]", layer).forEach((button) => button.addEventListener("click", close));

  requestAnimationFrame(() => layer.classList.add("open"));
  onMount?.(layer, close);
  return close;
}

export function confirmSheet({ title, text, confirmLabel = "Продолжить", danger = false }) {
  return new Promise((resolve) => {
    sheet({
      title,
      left: "",
      body: `<p style="color:var(--label-2);font-size:15px;line-height:1.5">${text}</p>
             <div class="sheet-actions">
               <button class="btn big ${danger ? "danger" : "primary"}" data-yes>${esc(confirmLabel)}</button>
               <button class="btn big" data-no>Отмена</button>
             </div>`,
      onMount(layer, close) {
        $("[data-yes]", layer).addEventListener("click", () => { close(); resolve(true); });
        $("[data-no]", layer).addEventListener("click", () => { close(); resolve(false); });
      },
    });
  });
}

/* ---------- просмотр картинок ---------- */

let zoom = { scale: 1, x: 0, y: 0 };

export function showImage(url) {
  $("#viewerImage").src = url;
  $("#viewer").classList.add("open");
  resetZoom();
}

function applyZoom() {
  const image = $("#viewerImage");
  image.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
  $("#viewer").classList.toggle("zoomed", zoom.scale > 1.01);
}
function resetZoom() {
  zoom = { scale: 1, x: 0, y: 0 };
  applyZoom();
}

/** Просмотр: колесо приближает к курсору, двойной клик — 2×, картинку можно таскать. */
export function wireViewer() {
  const viewer = $("#viewer");
  const image = $("#viewerImage");
  const close = () => { viewer.classList.remove("open"); resetZoom(); };
  $("#viewerClose").addEventListener("click", close);
  viewer.addEventListener("click", (event) => { if (event.target === viewer) close(); });
  document.addEventListener("keydown", (event) => {
    if (!viewer.classList.contains("open")) return;
    if (event.key === "Escape") close();
    if (event.key === "0") resetZoom();
  });

  viewer.addEventListener("wheel", (event) => {
    if (!viewer.classList.contains("open")) return;
    event.preventDefault();
    const before = zoom.scale;
    const next = Math.min(6, Math.max(1, before * (event.deltaY > 0 ? 0.86 : 1.16)));
    if (next === before) return;
    // держим точку под курсором на месте
    const rect = image.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    zoom.x = next === 1 ? 0 : zoom.x - dx * (next / before - 1);
    zoom.y = next === 1 ? 0 : zoom.y - dy * (next / before - 1);
    zoom.scale = next;
    applyZoom();
  }, { passive: false });

  image.addEventListener("dblclick", () => {
    zoom = zoom.scale > 1.01 ? { scale: 1, x: 0, y: 0 } : { scale: 2.4, x: 0, y: 0 };
    applyZoom();
  });

  let drag = null;
  image.addEventListener("pointerdown", (event) => {
    if (zoom.scale <= 1.01) return;
    drag = { x: event.clientX - zoom.x, y: event.clientY - zoom.y };
    viewer.classList.add("dragging");
    image.setPointerCapture(event.pointerId);
  });
  image.addEventListener("pointermove", (event) => {
    if (!drag) return;
    zoom.x = event.clientX - drag.x;
    zoom.y = event.clientY - drag.y;
    applyZoom();
  });
  const endDrag = () => { drag = null; viewer.classList.remove("dragging"); };
  image.addEventListener("pointerup", endDrag);
  image.addEventListener("pointercancel", endDrag);
}

/* ---------- разметка ---------- */

export const chevron = '<svg class="chevron" viewBox="0 0 8 13" fill="none"><path d="M1.5 1.5 6.5 6.5 1.5 11.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function group(title, inner, note = "") {
  return `<section class="group">${title ? `<div class="group-title">${esc(title)}</div>` : ""}<div class="card">${inner}</div>${note ? `<div class="group-title" style="padding-top:8px">${esc(note)}</div>` : ""}</section>`;
}

// совместимость со старыми вызовами
export const setNav = ({ title, subtitle = "", right = "", left = "" }) => setToolbar({ title, subtitle, actions: right, left });
