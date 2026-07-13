const app = document.getElementById('app');
const nav = document.getElementById('nav');

// ---- helpers ----
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');
const fileURL = (p) => 'file:///' + encodeURI(String(p).replace(/\\/g, '/'));
async function api(method, path, body) {
  try {
    const r = await window.arra.api(method, path, body);
    if (!r.ok) throw new Error(r.error || 'Ошибка сети');
    return r.data;
  } catch (error) {
    reportError('renderer.api', error, { method, path });
    throw error;
  }
}
function reportError(source, error, extra = {}) {
  const payload = {
    ...extra,
    name: error?.name || '',
    message: error?.message || String(error || 'Неизвестная ошибка'),
    stack: error?.stack || '',
  };
  try { window.arra.log('error', source, payload).catch(() => {}); } catch {}
}
window.addEventListener('error', (event) => reportError('renderer.window-error', event.error || event.message, {
  file: event.filename || '', line: event.lineno || 0, column: event.colno || 0,
}));
window.addEventListener('unhandledrejection', (event) => reportError('renderer.unhandled-rejection', event.reason));

// ---- кастомные уведомления (тосты) ----
function toast(title, msg, kind = 'info', ms = 5000) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const ico = kind === 'ok' ? '✓' : kind === 'warn' ? '!' : '↗';
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<div class="tico">${ico}</div><div class="tbody"><div class="ttitle">${esc(title)}</div>${msg ? `<div class="tmsg">${esc(msg)}</div>` : ''}</div><div class="tbar"></div>`;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const bar = el.querySelector('.tbar');
  if (bar) { bar.style.transition = `transform ${ms}ms linear`; requestAnimationFrame(() => { bar.style.transform = 'scaleX(0)'; }); }
  const kill = () => { el.classList.remove('show'); el.classList.add('hide'); setTimeout(() => el.remove(), 350); };
  el.onclick = kill;
  setTimeout(kill, ms);
}

// ---- контекстное меню (правый клик) ----
function closeCtxMenu() { const m = document.getElementById('ctxmenu'); if (m) m.remove(); }
function showCtxMenu(x, y, items) {
  closeCtxMenu();
  const m = document.createElement('div');
  m.id = 'ctxmenu'; m.className = 'ctxmenu';
  m.innerHTML = items.map((it, i) => it.sep ? '<div class="ctxsep"></div>' : `<div class="ctxitem ${it.danger ? 'danger' : ''}" data-i="${i}">${esc(it.label)}</div>`).join('');
  document.body.appendChild(m);
  const w = 210, h = items.length * 36 + 12;
  m.style.left = Math.min(x, window.innerWidth - w - 8) + 'px';
  m.style.top = Math.min(y, window.innerHeight - h - 8) + 'px';
  m.querySelectorAll('.ctxitem').forEach((el) => (el.onclick = () => { const it = items[+el.dataset.i]; closeCtxMenu(); if (it.action) it.action(); }));
}
document.addEventListener('click', closeCtxMenu);
document.addEventListener('scroll', closeCtxMenu, true);

async function confirmDelete(p, name) {
  if (!confirm(`Удалить «${name || p}»? Безвозвратно.`)) return;
  const r = await window.arra.fsDelete(p);
  if (r && r.ok) { termSend({ type: 'fs_list', reqId: newReq(), path: term.tree.path || '' }); toast('Удалено', name || p, 'ok'); }
  else toast('Не удалось удалить', (r && r.error) || '', 'warn');
}

const NAVICON = {
  fin: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  files: '<svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>',
  notes: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  term: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></svg>',
  sync: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.5-4M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.5 4"/><path d="M21 3v5h-5M3 21v-5h5"/></svg>',
};
const SVG = {
  tag: '<svg viewBox="0 0 24 24"><path d="M20 12V7a2 2 0 0 0-2-2h-5L3 15l6 6 11-9z"/><circle cx="15.5" cy="8.5" r="1.2"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M6 8h12l-1 12H7z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 3v5h5"/><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  drive: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
};

// ---- state ----
const state = {
  section: 'fin', files: [], monthDate: null, viewer: null,
  presence: { phone: false, laptop: false, pc: false, devices: [], currentId: null, status: {} },
};

function deviceRole(device, currentId, currentRole, deviceCount) {
  if (device.id === currentId) return currentRole || 'pc';
  const name = String(device.name || '').toLowerCase();
  if (/ноут|laptop|book|mobile/.test(name)) return 'laptop';
  if (/стацион|desktop|\bпк\b|computer/.test(name)) return 'pc';
  if (deviceCount === 2) return currentRole === 'laptop' ? 'pc' : 'laptop';
  return 'pc';
}

async function refreshPresence(redraw = true) {
  try {
    const [status, tokenData] = await Promise.all([window.arra.getStatus(), api('GET', '/pc/tokens')]);
    const devices = (tokenData.tokens || []).map((device) => ({
      ...device,
      role: deviceRole(device, status.deviceId, status.deviceProfile?.role, (tokenData.tokens || []).length),
    }));
    state.presence = {
      phone: !!status.phoneOnline,
      laptop: devices.some((device) => device.role === 'laptop' && device.online),
      pc: devices.some((device) => device.role === 'pc' && device.online),
      devices,
      currentId: status.deviceId || null,
      status,
    };
    if (redraw) {
      renderNav();
      if (state.section === 'sync') renderSyncV2Body();
    }
  } catch {}
}

// ---- терминал ----
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const stripAnsi = (s) => String(s).replace(ANSI, '');
let reqCounter = 0;
const newReq = () => 'r' + (++reqCounter) + '_' + (Date.now() % 100000);
const term = {
  cwd: '', root: '', out: '', busy: false, reqId: null, sub: 'term', history: [], hi: -1,
  tree: { path: '', parent: null, drives: true, entries: [] }, file: null,
};

function termSend(msg) { window.arra.term(msg); }
function termAppend(text) {
  term.out += text;
  if (term.out.length > 120000) term.out = term.out.slice(-100000);
  const el = document.getElementById('termout');
  if (el) { el.textContent = term.out; el.scrollTop = el.scrollHeight; }
}

// Глобальный приём событий от ПК-агента (локальный терминал)
window.arra.onTerm((o) => handleTermEvent(o));
function handleTermEvent(o) {
  if (!o) return;
  if (o.type === 'cwd') { term.cwd = o.cwd; term.root = o.root; updateTermPrompt(); return; }
  if (o.type === 'term_clear') { term.out = ''; const el = document.getElementById('termout'); if (el) el.textContent = ''; return; }
  if (o.type === 'term_out') { termAppend(stripAnsi(o.chunk || '')); return; }
  if (o.type === 'term_exit') {
    term.busy = false; term.reqId = null;
    if (o.cwd) term.cwd = o.cwd;
    if (typeof o.code === 'number' && o.code !== 0) termAppend(`\n[код выхода ${o.code}]\n`);
    termAppend('\n');
    updateTermPrompt();
    return;
  }
  if (o.type === 'fs_list') { term.tree = { path: o.path || '', parent: o.parent ?? null, drives: !!o.drives, entries: o.entries || [] }; renderTree(); return; }
  if (o.type === 'fs_read') { term.file = { path: o.path, content: o.content, editable: o.editable }; openEditorModal(); return; }
  if (o.type === 'fs_write') { const s = document.getElementById('savestate'); if (s) { s.textContent = 'Сохранено ✓'; s.classList.add('ok'); } return; }
  if (o.type === 'fs_download') { return; }
  if (o.type === 'err') { const s = document.getElementById('savestate'); if (s) s.textContent = o.message; else termAppend(`\n[ошибка] ${o.message}\n`); return; }
}

function updateTermPrompt() {
  const p = document.getElementById('termprompt');
  if (p) p.textContent = (term.cwd || term.root || '') + ' ›';
}

function termRun(cmd) {
  if (term.busy) return;
  termAppend(`\n${term.cwd || ''}› ${cmd}\n`);
  if (cmd.trim()) { term.history.push(cmd); term.hi = term.history.length; }
  term.busy = true; term.reqId = newReq();
  termSend({ type: 'run', reqId: term.reqId, cmd });
}
function termClaude(prompt, skip) {
  if (term.busy || !prompt.trim()) return;
  term.busy = true; term.reqId = newReq();
  termSend({ type: 'claude', reqId: term.reqId, prompt, skip });
}
function termCancel() { if (term.reqId) termSend({ type: 'cancel', reqId: term.reqId }); term.busy = false; }

// ---- настоящий терминал (xterm + PTY), несколько вкладок как в VS Code ----
const xts = {};            // termId -> { term, fit, ro, started, cwd }
const localTerms = ['L1']; // открытые вкладки
let activeLocal = 'L1';
let localCounter = 1;
let ptyWired = false;
let panelCollapsed = false; // свёрнута ли левая панель файлов (терминал на всю ширину)

function wirePty() {
  if (ptyWired) return;
  ptyWired = true;
  // вывод приходит со своим termId — пишем в нужную вкладку
  window.arra.onPtyData((p) => {
    if (!p) return;
    const id = p.termId || 'L1';
    let x = xts[id];
    if (!x) {
      // сессия открыта с телефона — показываем её вкладкой тут (без запуска нового процесса)
      x = ensureXterm(id); x.started = true; x.phone = true;
      if (!localTerms.includes(id)) { localTerms.push(id); if (document.getElementById('termtabs')) renderTermTabs(); }
    }
    x.term.write(p.data);
  });
  window.arra.onPtyExit && window.arra.onPtyExit((p) => {
    if (!p) return;
    const id = p.termId; const x = xts[id];
    if (x && x.phone) {
      try { x.term.dispose(); } catch {}
      delete xts[id];
      const i = localTerms.indexOf(id); if (i >= 0) localTerms.splice(i, 1);
      if (!localTerms.length) { localTerms.push('L1'); activeLocal = 'L1'; }
      else if (activeLocal === id) activeLocal = localTerms[localTerms.length - 1];
      if (document.getElementById('termtabs')) { renderTermTabs(); mountActiveTerm(); }
    }
  });
  window.addEventListener('resize', () => fitLocal(activeLocal));
}
function fitLocal(termId) {
  const x = xts[termId]; if (!x) return;
  try {
    // xterm.css подключён корректно → FitAddon считает строки/столбцы точно.
    x.fit.fit();
    // Подстраховка: если по какой-то причине последняя строка вылезает ниже видимой кромки окна — урезаем.
    const pane = x.term.element && x.term.element.parentElement;
    if (pane) {
      let cell = 0;
      try { cell = x.term._core._renderService.dimensions.css.cell.height; } catch {}
      if (!cell || cell < 4) { try { const r = x.term.element.querySelector('.xterm-rows'); const c = r && r.children[0]; if (c) cell = c.getBoundingClientRect().height; } catch {} }
      if (cell > 4) {
        const pr = pane.getBoundingClientRect();
        const visBottom = Math.min(pr.bottom, window.innerHeight - 4);
        const maxRows = Math.max(2, Math.floor((visBottom - pr.top) / cell));
        if (x.term.rows > maxRows) x.term.resize(x.term.cols, maxRows);
      }
    }
    try { x.term.scrollToBottom(); } catch {}
    window.arra.ptyResize({ cols: x.term.cols, rows: x.term.rows }, termId);
  } catch {}
}
// Точная подгонка терминала под контейнер при любом изменении размера (ресайз окна, сворачивание панели).
// Безопасно от зацикливания: host растягивается флексом (его размер НЕ зависит от содержимого терминала),
// поэтому fit() не меняет размер host → новый вызов observer не триггерится.
let hostRO = null;
function observeHost(host) {
  if (!window.ResizeObserver) return;
  if (hostRO) { try { hostRO.disconnect(); } catch {} }
  let pending = false, lw = 0, lh = 0;
  hostRO = new ResizeObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const r = host.getBoundingClientRect();
      if (Math.abs(r.width - lw) < 2 && Math.abs(r.height - lh) < 2) return;
      lw = r.width; lh = r.height;
      fitLocal(activeLocal);
    });
  });
  hostRO.observe(host);
}
function ensureXterm(termId, cwd) {
  if (xts[termId]) return xts[termId];
  const term = new Terminal({
    fontSize: 13, lineHeight: 1.05, letterSpacing: 0,
    fontFamily: 'Cascadia Code, Consolas, ui-monospace, monospace',
    cursorBlink: true, scrollback: 8000,
    theme: XTERM_THEMES[curTheme()],
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  // Шрифт Cascadia Code может догрузиться ПОСЛЕ первого fit() — ячейка станет шире,
  // и правый столбец начнёт резаться. Как только шрифты готовы — перемеряем.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { try { term.clearTextureAtlas?.(); } catch {} fitLocal(termId); });
  term.onData((d) => window.arra.ptyInput(d, termId));
  // Копирование/вставка как в консоли Windows:
  //  • Ctrl+C — копирует выделенное; без выделения уходит обычный ^C (прерывание).
  //  • Ctrl+Shift+C — всегда копировать выделенное.
  //  • Ctrl+V / Ctrl+Shift+V — вставить из буфера.
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    const k = (e.key || '').toLowerCase();
    if (e.ctrlKey && !e.altKey && k === 'c' && !e.shiftKey) {
      const sel = term.getSelection();
      if (sel) { window.arra.copyText(sel); term.clearSelection(); return false; }
      return true; // нет выделения → пусть идёт ^C
    }
    if (e.ctrlKey && e.shiftKey && k === 'c') {
      const sel = term.getSelection(); if (sel) window.arra.copyText(sel);
      return false;
    }
    if (e.ctrlKey && k === 'v') {
      window.arra.clipRead().then((t) => { if (t) window.arra.ptyInput(t, termId); }).catch(() => {});
      return false;
    }
    return true;
  });
  xts[termId] = { term, fit, opened: false, started: false, cwd: cwd || '' };
  return xts[termId];
}
// Навешиваем обработчики на ПАНЕЛЬ терминала один раз (клик/контекст/дроп)
function wirePane(pane, id, x) {
  pane.onclick = () => { try { x.term.focus(); } catch {} };
  pane.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
  pane.ondrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    let text = '';
    const files = e.dataTransfer.files;
    if (files && files.length) {
      // В Electron 33 File.path удалён — реальный путь только через webUtils.getPathForFile
      text = Array.from(files).map((f) => { const p = window.arra.filePath(f) || f.path || ''; return p ? `"${p}"` : ''; }).filter(Boolean).join(' ') + ' ';
    }
    if (!text.trim()) text = e.dataTransfer.getData('text/plain') || '';
    if (text && text.trim()) { window.arra.ptyInput(text, id); try { x.term.focus(); } catch {} }
  };
  // Правый клик в терминале: есть выделение → копируем; нет → вставляем (как в консоли Windows)
  pane.oncontextmenu = (e) => {
    e.preventDefault(); e.stopPropagation();
    const sel = x.term.getSelection();
    if (sel) { window.arra.copyText(sel); x.term.clearSelection(); }
    else { window.arra.clipRead().then((t) => { if (t) window.arra.ptyInput(t, id); }).catch(() => {}); }
    try { x.term.focus(); } catch {}
  };
}
// Каждая вкладка — своя постоянная панель; переключение лишь показывает/прячет (без пересоздания → нет «дёрганья»)
function mountActiveTerm() {
  const host = document.getElementById('xterm-host');
  if (!host) return;
  if (typeof Terminal === 'undefined') { host.innerHTML = '<div class="empty">Терминал не загрузился</div>'; return; }
  observeHost(host);
  for (const id of localTerms) {
    const x = ensureXterm(id);
    let pane = host.querySelector(`[data-pane="${id}"]`);
    if (!pane) { pane = document.createElement('div'); pane.className = 'xterm-pane'; pane.dataset.pane = id; host.appendChild(pane); }
    if (!x.opened) { x.term.open(pane); x.opened = true; wirePane(pane, id, x); }
    else if (x.term.element && x.term.element.parentElement !== pane) { pane.appendChild(x.term.element); wirePane(pane, id, x); } // вернулись на вкладку — переподключаем
    pane.style.display = id === activeLocal ? 'block' : 'none';
  }
  // удалить панели закрытых вкладок
  host.querySelectorAll('.xterm-pane').forEach((p) => { if (!localTerms.includes(p.dataset.pane)) p.remove(); });
  const x = xts[activeLocal];
  if (!x) return;
  const fitNow = () => { fitLocal(activeLocal); try { x.term.focus(); } catch {} };
  requestAnimationFrame(() => {
    fitNow();
    if (!x.started) {
      x.started = true;
      window.arra.ptyStart({ cols: x.term.cols || 100, rows: x.term.rows || 30, termId: activeLocal, cwd: x.cwd || undefined })
        .then(() => { window.arra.ptyResize({ cols: x.term.cols, rows: x.term.rows }, activeLocal); try { x.term.focus(); } catch {} });
    }
  });
  setTimeout(fitNow, 130);
}
// Имя вкладки — как в VS Code: имя папки проекта, в которой открыт терминал
const TERM_TAB_ICON = '<svg class="ticon" viewBox="0 0 24 24"><path d="M4 17l6-5-6-5M12 19h8"/></svg>';
function termTabLabel(id) {
  const x = xts[id];
  const p = (x && x.cwd) || term.cwd || term.root || '';
  const base = String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  return { name: base || 'powershell', path: p };
}
function renderTermTabs() {
  const bar = document.getElementById('termtabs');
  if (!bar) return;
  bar.innerHTML = `<button class="ttadd" id="treetoggle" title="Скрыть/показать файлы">${SVG.folder}</button>`
    + localTerms.map((id) => {
      const x = xts[id]; const phone = x && x.phone;
      const t = termTabLabel(id);
      return `<button class="ttab ${id === activeLocal ? 'on' : ''} ${phone ? 'phone' : ''}" data-id="${id}" title="${esc(t.path)}">${phone ? '📱 ' : TERM_TAB_ICON}<span class="tname">${esc(t.name)}</span>${localTerms.length > 1 ? ` <span class="tclose" data-close="${id}">✕</span>` : ''}</button>`;
    }).join('') + `<button class="ttadd" id="ttadd" title="Новый терминал">＋</button>`
    + `<span class="ttag"><span class="dot on"></span>общий c телефоном</span>`;
  bar.querySelectorAll('.ttab').forEach((b) => (b.onclick = (e) => {
    if (e.target.dataset.close) { closeLocalTerm(e.target.dataset.close); return; }
    switchLocalTerm(b.dataset.id);
  }));
  document.getElementById('ttadd').onclick = () => addTermQuick();
  document.getElementById('treetoggle').onclick = () => {
    panelCollapsed = !panelCollapsed;
    document.querySelector('.workspace').classList.toggle('ws-collapsed', panelCollapsed);
    requestAnimationFrame(() => fitLocal(activeLocal));
    setTimeout(() => fitLocal(activeLocal), 170);
  };
}
function switchLocalTerm(id) { activeLocal = id; renderTermTabs(); mountActiveTerm(); }
// Новый терминал в папке (по умолчанию — корень кода), без диалога
function addTermQuick(cwd) {
  const folder = typeof cwd === 'string' ? cwd : (term.root || '');
  localCounter++;
  const id = 'L' + localCounter;
  localTerms.push(id);
  ensureXterm(id, folder);
  activeLocal = id;
  renderTermTabs();
  mountActiveTerm();
}
async function addLocalTerm() {
  let folder = '';
  try { folder = await window.arra.chooseCodeRoot(); } catch {}
  localCounter++;
  const id = 'L' + localCounter;
  localTerms.push(id);
  ensureXterm(id, folder);
  activeLocal = id;
  renderTermTabs();
  mountActiveTerm();
}
function closeLocalTerm(id) {
  try { window.arra.ptyKill(id); } catch {}
  const x = xts[id];
  if (x) { try { x.ro?.disconnect(); } catch {} try { x.term.dispose(); } catch {} delete xts[id]; }
  const idx = localTerms.indexOf(id); if (idx >= 0) localTerms.splice(idx, 1);
  if (!localTerms.length) { localCounter++; const nid = 'L' + localCounter; localTerms.push(nid); activeLocal = nid; }
  else if (activeLocal === id) { activeLocal = localTerms[localTerms.length - 1]; }
  renderTermTabs();
  mountActiveTerm();
}

// ---- titlebar ----
document.getElementById('min').onclick = () => window.arra.winMin();
document.getElementById('close').onclick = () => window.arra.winClose();
let updateUiState = '';
let updateUiLabel = 'Проверить обновление';
function setUpdateButton(updateState, label) {
  updateUiState = updateState || '';
  updateUiLabel = label || 'Проверить обновление';
  const btn = document.getElementById('side-update');
  if (!btn) return;
  btn.classList.remove('checking', 'downloading', 'ready');
  if (updateUiState) btn.classList.add(updateUiState);
  btn.disabled = updateUiState === 'checking' || updateUiState === 'downloading';
  const text = btn.querySelector('b'); if (text) text.textContent = updateUiLabel;
}
async function triggerUpdateCheck() {
  setUpdateButton('checking', 'Проверяю…');
  try { await window.arra.updateCheck(); }
  catch { setUpdateButton('', 'Проверить обновление'); }
}
// ---- цветовая палитра: светлая / серая (как VS Code Dark Modern) ----
const XTERM_THEMES = {
  light: { background: '#0E1014', foreground: '#D4D7DE', cursor: '#7C86F0', selectionBackground: 'rgba(124,134,240,0.35)' },
  dark:  { background: '#1F1F1F', foreground: '#CCCCCC', cursor: '#AEB3C2', selectionBackground: 'rgba(124,134,240,0.35)' },
};
function curTheme() { return document.body.dataset.theme === 'dark' ? 'dark' : 'light'; }
function applyTheme(t) {
  if (t === 'dark') document.body.dataset.theme = 'dark';
  else delete document.body.dataset.theme;
  try { localStorage.setItem('arra-theme', t); } catch {}
  // перекрасить уже открытые терминалы
  for (const id in xts) { try { xts[id].term.options.theme = XTERM_THEMES[curTheme()]; } catch {} }
  const b = document.getElementById('themebtn');
  if (b) b.title = curTheme() === 'dark' ? 'Тема: серая (VS Code) — нажми для светлой' : 'Тема: светлая — нажми для серой (VS Code)';
}
document.getElementById('themebtn').onclick = () => applyTheme(curTheme() === 'dark' ? 'light' : 'dark');
try { applyTheme(localStorage.getItem('arra-theme') || 'light'); } catch { applyTheme('light'); }
// Гамбургер — скрыть/показать левый сайдбар (как в VS Code). Терминал переподгоняем под новую ширину.
document.getElementById('navtoggle').onclick = () => {
  document.body.classList.toggle('nav-collapsed');
  if (state.section === 'term') { requestAnimationFrame(() => fitLocal(activeLocal)); setTimeout(() => fitLocal(activeLocal), 180); }
};

// ================= LOGIN =================
function renderLogin() {
  nav.classList.add('hidden');
  app.innerHTML = `
    <div class="center">
      <h1>Подключить компьютер</h1>
      <div class="card gap">
        <label class="field"><span>Логин</span><input id="login" type="text" autocomplete="username" /></label>
        <label class="field"><span>Пароль</span><input id="password" type="password" autocomplete="current-password" /></label>
        <label class="field"><span>Имя компьютера</span><input id="device" type="text" value="Мой ПК" /></label>
        <button class="btn full" id="connect">Подключить</button>
        <div class="err" id="err"></div>
      </div>
    </div>`;
  document.getElementById('connect').onclick = doLogin;
  app.querySelectorAll('input').forEach((i) => (i.onkeydown = (e) => { if (e.key === 'Enter') doLogin(); }));
}
async function doLogin() {
  const login = document.getElementById('login').value.trim();
  const password = document.getElementById('password').value;
  const deviceName = document.getElementById('device').value.trim() || 'Мой ПК';
  const err = document.getElementById('err');
  const btn = document.getElementById('connect');
  if (!login || !password) { err.textContent = 'Введи логин и пароль'; return; }
  btn.disabled = true; btn.textContent = 'Подключаю…'; err.textContent = '';
  const r = await window.arra.login({ login, password, deviceName });
  if (!r.ok) { err.textContent = r.error || 'Не удалось подключить'; btn.disabled = false; btn.textContent = 'Подключить'; return; }
  boot();
}

// ================= NAV (боковая, десктоп) =================
async function renderNav() {
  nav.classList.remove('hidden');
  const items = [
    ['term', 'Терминал', NAVICON.term],
    ['files', 'Файлы', NAVICON.files],
    ['sync', 'Передача', NAVICON.sync],
    ['chat', 'Помощник', NAVICON.chat],
    ['notes', 'Заметки', NAVICON.notes],
    ['fin', 'Финансы', NAVICON.fin],
  ];
  let st = state.presence.status || {};
  let appVer = '';
  try { st = await window.arra.getStatus(); } catch {}
  try { appVer = await window.arra.appVersion(); } catch {}
  const currentRole = st.deviceProfile?.role;
  nav.innerHTML =
    `<div class="side-sec">Рабочее место</div>` +
    items.map(([k, label, ic]) => `<button data-s="${k}" class="navitem ${state.section === k ? 'active' : ''}">${ic}<span>${label}</span></button>`).join('') +
    `<div class="side-spacer"></div>` +
    `<button class="side-update ${esc(updateUiState)}" id="side-update" type="button"><span>↻</span><b>${esc(updateUiLabel)}</b><small>${esc(appVer || '')}</small></button>` +
    `<div class="side-presence">
      <div><span class="dot ${state.presence.phone ? 'on' : ''}"></span><span>Телефон</span><small>${state.presence.phone ? 'в сети' : 'не в сети'}</small></div>
      <div><span class="dot ${state.presence.laptop ? 'on' : ''}"></span><span>Ноутбук</span><small>${currentRole === 'laptop' ? 'это устройство' : (state.presence.laptop ? 'в сети' : 'не в сети')}</small></div>
      <div><span class="dot ${state.presence.pc ? 'on' : ''}"></span><span>ПК</span><small>${currentRole === 'pc' ? 'это устройство' : (state.presence.pc ? 'в сети' : 'не в сети')}</small></div>
    </div>`;
  nav.querySelectorAll('button.navitem').forEach((b) => (b.onclick = () => { state.section = b.dataset.s; renderNav(); route(); }));
  const su = document.getElementById('side-update');
  if (su) su.onclick = triggerUpdateCheck;
}

function route() {
  document.body.classList.toggle('term-mode', state.section === 'term');
  document.body.classList.toggle('chat-mode', state.section === 'chat');
  if (state.section === 'fin') renderFin();
  else if (state.section === 'chat') renderChat();
  else if (state.section === 'term') renderTerminal();
  else if (state.section === 'files') renderFiles();
  else if (state.section === 'sync') renderSyncV2();
  else if (state.section === 'notes') renderNotes();
}

// ================= ФИНАНСЫ =================
function monthStr() {
  const d = state.monthDate;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function dayLabel(iso) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const d = new Date(iso);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = (today - start) / 86400000;
  if (diff <= 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
async function renderFin() {
  if (!state.monthDate) { const n = new Date(); state.monthDate = new Date(n.getFullYear(), n.getMonth(), 1); }
  app.innerHTML = `<div class="page-head"><h1>Финансы</h1></div><div class="empty">Загрузка…</div>`;
  let s, t, d;
  try {
    [s, t, d] = await Promise.all([
      api('GET', `/stats/summary?month=${monthStr()}`),
      api('GET', `/transactions?month=${monthStr()}&limit=500`),
      api('GET', '/debts'),
    ]);
  } catch (e) { app.innerHTML = `<div class="page-head"><h1>Финансы</h1></div><div class="empty">${esc(e.message)}</div>`; return; }

  const now = new Date();
  const isCur = state.monthDate.getFullYear() === now.getFullYear() && state.monthDate.getMonth() === now.getMonth();
  const mLabel = state.monthDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const owedMe = (d.debts || []).filter((x) => x.direction === 'owes_me').reduce((a, x) => a + Number(x.amount), 0);
  const iOwe = (d.debts || []).filter((x) => x.direction === 'i_owe').reduce((a, x) => a + Number(x.amount), 0);
  if (!state.finTab) state.finTab = 'tx';
  const tab = state.finTab;

  let html = `
    <div class="page-head">
      <h1>Финансы</h1><div class="grow"></div>
      <button class="btn sm" id="addtx" style="margin-right:10px">＋ Операция</button>
      <div class="monthbar"><button id="mprev">‹</button><span class="m">${mLabel}</span><button id="mnext" ${isCur ? 'disabled' : ''}>›</button></div>
    </div>
    <div class="fin-top">
      <div class="card hero">
        <div class="lbl">Потрачено за месяц</div>
        <div class="big">${fmt(s.summary.expense)} ₽</div>
        <div class="hero-pills">
          <span class="pill red">↗ расход ${fmt(s.summary.expense)} ₽</span>
          <span class="pill green">↙ доход ${fmt(s.summary.income)} ₽</span>
        </div>
      </div>
      <div class="card gap">
        <div class="row"><div class="tile" style="color:var(--green);background:var(--green-soft)">${SVG.user}</div><div class="grow"><div class="lbl">Мне должны</div><div class="b" style="font-size:18px">${fmt(owedMe)} ₽</div></div></div>
        <div class="row"><div class="tile" style="color:var(--yellow);background:rgba(201,154,0,0.12)">${SVG.user}</div><div class="grow"><div class="lbl">Я должен</div><div class="b" style="font-size:18px">${fmt(iOwe)} ₽</div></div></div>
      </div>
    </div>
    <div class="cols-2">`;

  if (s.byCategory?.length) {
    const max = Math.max(1, ...s.byCategory.map((c) => c.total));
    html += `<div><h2>По категориям</h2><div class="card gap">` + s.byCategory.slice(0, 8).map((c) => `
      <div class="row">${categoryIcon(c.category)}<div class="grow">
        <div class="row"><span class="b">${esc(c.category)}</span><span class="b right">${fmt(c.total)} ₽</span></div>
        <div class="track" style="margin-top:6px"><i style="width:${Math.max(6, (c.total / max) * 100)}%"></i></div>
      </div></div>`).join('') + `</div></div>`;
  }
  if (s.byMerchant?.length) {
    const max = Math.max(1, ...s.byMerchant.map((c) => c.total));
    html += `<div><h2>По магазинам</h2><div class="card gap">` + s.byMerchant.slice(0, 8).map((c) => `
      <div class="row">${merchantLogo(c.merchant)}<div class="grow">
        <div class="row"><span class="b">${esc(c.merchant)}</span><span class="b right">${fmt(c.total)} ₽</span></div>
        <div class="track" style="margin-top:6px"><i style="width:${Math.max(6, (c.total / max) * 100)}%"></i></div>
      </div></div>`).join('') + `</div></div>`;
  }
  html += `</div>`;

  html += `<div class="seg fin-seg" id="finseg">
    <button data-tab="tx" class="${tab === 'tx' ? 'active' : ''}">Операции <b class="cnt">${t.transactions.length}</b></button>
    <button data-tab="debt" class="${tab === 'debt' ? 'active' : ''}">Долги <b class="cnt">${(d.debts || []).length}</b></button>
  </div>`;

  html += `<div class="fin-panel" data-panel="tx" ${tab === 'tx' ? '' : 'hidden'}>`;
  if (!t.transactions.length) html += `<div class="empty">За ${mLabel} операций нет. Запиши через «Помощник» — текстом или голосом.</div>`;
  else {
    html += `<div class="card" style="padding:8px">`;
    let lastDay = '';
    for (const x of t.transactions) {
      const dl = dayLabel(x.occurred_at);
      if (dl !== lastDay) { html += `<div class="daygroup">${dl}</div>`; lastDay = dl; }
      const time = new Date(x.occurred_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const sub = [x.merchant, x.category].filter(Boolean).join(' · ');
      html += `<div class="txrow tx-edit" data-id="${x.id}" style="cursor:pointer">${x.merchant ? merchantLogo(x.merchant) : categoryIcon(x.category)}
        <div class="grow"><div class="b ellip">${esc(x.title || x.category)}</div><div class="lbl">${esc(sub)} · ${time}</div></div>
        <span class="amount ${x.type === 'income' ? 'inc' : 'exp'}">${x.type === 'income' ? '+' : '−'}${fmt(x.amount)} ₽</span>
        <button class="copybtn tx-del" data-id="${x.id}">✕</button></div>`;
    }
    html += `</div>`;
  }

  html += `</div>`;

  html += `<div class="fin-panel" data-panel="debt" ${tab === 'debt' ? '' : 'hidden'}>`;
  if (!(d.debts || []).length) html += `<div class="empty">Долгов пока нет. Скажи помощнику: «дал Егору 500».</div>`;
  else {
    html += `<div class="card" style="padding:8px">`;
    for (const db of d.debts) {
      const col = db.direction === 'owes_me' ? 'var(--green)' : 'var(--yellow)';
      const sub = db.settled ? 'погашен' : (db.direction === 'owes_me' ? 'должен мне' : 'я должен');
      html += `<div class="txrow debt-edit" data-id="${db.id}" style="cursor:pointer${db.settled ? ';opacity:0.55' : ''}">${merchantLogo(db.counterparty)}
        <div class="grow"><div class="b">${esc(db.counterparty)}</div><div class="lbl">${sub}${db.note ? ' · ' + esc(db.note) : ''}</div></div>
        <span class="b" style="color:${col}${db.settled ? ';text-decoration:line-through' : ''}">${db.direction === 'owes_me' ? '+' : '−'}${fmt(db.amount)} ₽</span>
        <button class="copybtn debt-del" data-id="${db.id}">✕</button></div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  app.innerHTML = html;
  state.txList = t.transactions || [];
  state.debtList = d.debts || [];
  document.getElementById('mprev').onclick = () => { state.monthDate = new Date(state.monthDate.getFullYear(), state.monthDate.getMonth() - 1, 1); renderFin(); };
  const mnext = document.getElementById('mnext'); if (mnext && !isCur) mnext.onclick = () => { state.monthDate = new Date(state.monthDate.getFullYear(), state.monthDate.getMonth() + 1, 1); renderFin(); };
  document.getElementById('addtx').onclick = () => openTxModal(null);
  app.querySelectorAll('.tx-edit').forEach((row) => (row.onclick = () => {
    const tx = (state.txList || []).find((x) => x.id === row.dataset.id);
    if (tx) openTxModal(tx);
  }));
  app.querySelectorAll('.tx-del').forEach((b) => (b.onclick = async (e) => { e.stopPropagation(); try { await api('DELETE', '/transactions/' + b.dataset.id); renderFin(); } catch {} }));
  app.querySelectorAll('.debt-edit').forEach((row) => (row.onclick = () => {
    const db = (state.debtList || []).find((x) => x.id === row.dataset.id);
    if (db) openDebtModal(db);
  }));
  app.querySelectorAll('.debt-del').forEach((b) => (b.onclick = async (e) => { e.stopPropagation(); try { await api('DELETE', '/debts/' + b.dataset.id); renderFin(); } catch {} }));
  // Переключение вкладок Операции / Долги / Аналитика (без перезагрузки)
  app.querySelectorAll('#finseg button').forEach((b) => (b.onclick = () => {
    state.finTab = b.dataset.tab;
    app.querySelectorAll('#finseg button').forEach((x) => x.classList.toggle('active', x === b));
    app.querySelectorAll('.fin-panel').forEach((p) => (p.hidden = p.dataset.panel !== state.finTab));
  }));
}

// Карточка долга: детали + погасить/вернуть/удалить
function openDebtModal(db) {
  const col = db.direction === 'owes_me' ? 'var(--green)' : 'var(--yellow)';
  const dir = db.direction === 'owes_me' ? 'должен мне' : 'я должен';
  const fmtD = (iso) => { try { return iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'; } catch { return '—'; } };
  let v = document.getElementById('txmodal');
  if (!v) { v = document.createElement('div'); v.id = 'txmodal'; v.className = 'editmodal'; document.body.appendChild(v); }
  v.innerHTML = `
    <div class="editcard" style="max-width:440px">
      <div class="row"><div class="b grow">Долг</div><button class="ws-mini" id="dbclose">✕</button></div>
      <div class="row" style="margin:14px 0;gap:12px">
        ${merchantLogo(db.counterparty, 44)}
        <div class="grow"><div class="b" style="font-size:18px">${esc(db.counterparty)}</div><div class="lbl">${dir}${db.settled ? ' · погашен' : ''}</div></div>
        <div class="b" style="color:${col};font-size:20px">${db.direction === 'owes_me' ? '+' : '−'}${fmt(db.amount)} ₽</div>
      </div>
      <div class="gap" style="background:var(--surface-2);border-radius:12px;padding:12px">
        <div class="row"><span class="lbl grow">Когда возник</span><span class="b">${fmtD(db.occurred_at)}</span></div>
        <div class="row"><span class="lbl grow">Срок возврата</span><span class="b">${fmtD(db.due_date)}</span></div>
        ${db.note ? `<div class="row"><span class="lbl grow">Заметка</span><span class="b">${esc(db.note)}</span></div>` : ''}
      </div>
      ${db.settled
        ? `<button class="btn ghost full" id="dbunsettle" style="margin-top:16px">Вернуть в долги (не погашен)</button>`
        : `<button class="btn full" id="dbsettle" style="margin-top:16px;background:var(--green);box-shadow:none">✓ Погасить долг</button>`}
      <button class="btn ghost sm full" id="dbdel" style="margin-top:8px;color:var(--red)">Удалить</button>
    </div>`;
  const close = () => v.remove();
  v.onclick = (e) => { if (e.target === v) close(); };
  document.getElementById('dbclose').onclick = close;
  const set = async (settled) => { try { await api('PATCH', '/debts/' + db.id, { settled }); close(); renderFin(); } catch (e) { alert(e.message); } };
  const s1 = document.getElementById('dbsettle'); if (s1) s1.onclick = () => set(true);
  const s2 = document.getElementById('dbunsettle'); if (s2) s2.onclick = () => set(false);
  document.getElementById('dbdel').onclick = async () => { try { await api('DELETE', '/debts/' + db.id); close(); renderFin(); } catch {} };
}

// Добавить/изменить операцию вручную (на ПК — полноценное редактирование, как просили)
const TX_CATS = ['Продукты', 'Кафе и рестораны', 'Кофе', 'Доставка', 'Алкоголь', 'Транспорт', 'Такси', 'Каршеринг', 'Топливо', 'Парковка', 'Маркетплейс', 'Техника', 'Одежда', 'Аптека', 'Здоровье', 'Спорт', 'Красота', 'Кино', 'Игры', 'Музыка', 'Подписки', 'ЖКХ', 'Связь', 'Дом', 'Образование', 'Путешествия', 'Налоги', 'Зарплата', 'Прочее'];
// --- Реальные логотипы брендов (как на телефоне): Google favicons ---
const DOMAINS = {
  'озон': 'ozon.ru', 'ozon': 'ozon.ru', 'ozon банк': 'ozon.ru',
  'вайлдберриз': 'wildberries.ru', 'wildberries': 'wildberries.ru', 'вб': 'wildberries.ru',
  'яндекс еда': 'eda.yandex.ru', 'яндекс.еда': 'eda.yandex.ru', 'яндекс': 'yandex.ru',
  'самокат': 'samokat.ru', 'вкусвилл': 'vkusvill.ru',
  'пятёрочка': '5ka.ru', 'пятерочка': '5ka.ru', 'магнит': 'magnit.ru',
  'перекрёсток': 'perekrestok.ru', 'перекресток': 'perekrestok.ru', 'лента': 'lenta.com',
  'ашан': 'auchan.ru', 'metro': 'metro-cc.ru',
  'сбер': 'sberbank.ru', 'сбербанк': 'sberbank.ru', 'тинькофф': 'tinkoff.ru', 'т-банк': 'tbank.ru',
  'альфа': 'alfabank.ru', 'альфабанк': 'alfabank.ru', 'втб': 'vtb.ru',
  'мтс': 'mts.ru', 'билайн': 'beeline.ru', 'мегафон': 'megafon.ru', 'теле2': 'tele2.ru',
  'netflix': 'netflix.com', 'spotify': 'spotify.com', 'youtube': 'youtube.com',
  'apple': 'apple.com', 'icloud': 'apple.com', 'google': 'google.com',
  'aliexpress': 'aliexpress.ru', 'али': 'aliexpress.ru',
  'белка': 'belkacar.ru', 'belkacar': 'belkacar.ru', 'белкакар': 'belkacar.ru',
  'ситидрайв': 'citydrive.ru', 'сити драйв': 'citydrive.ru', 'citydrive': 'citydrive.ru', 'city drive': 'citydrive.ru',
  'делимобиль': 'delimobil.ru', 'delimobil': 'delimobil.ru', 'дели': 'delimobil.ru',
  'яндекс драйв': 'yandex.ru', 'яндекс.драйв': 'yandex.ru', 'драйв': 'yandex.ru',
  'kfc': 'kfc.ru', 'бургер кинг': 'burgerking.ru', 'burger king': 'burgerking.ru',
  'вкусно и точка': 'vkusnoitochka.ru', 'starbucks': 'starbucks.com', 'додо': 'dodopizza.ru',
  'delivery': 'delivery-club.ru', 'деливери': 'delivery-club.ru',
  'литрес': 'litres.ru', 'кинопоиск': 'kinopoisk.ru', 'okko': 'okko.tv', 'иви': 'ivi.ru',
  'steam': 'steampowered.com', 'hexfield ai': 'hexfield.ai', 'proxyapi': 'proxyapi.ru',
};
const PALETTE = ['#6E79E6', '#4CB782', '#4CB7A5', '#E0A33E', '#E06C75', '#9A7BE0', '#5B8DEF', '#5FB8CF', '#C98AB8', '#8A8F98'];
function colorFor(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return PALETTE[h % PALETTE.length]; }
function domainFor(m) { const k = (m || '').trim().toLowerCase(); if (DOMAINS[k]) return DOMAINS[k]; for (const x of Object.keys(DOMAINS)) if (k.includes(x)) return DOMAINS[x]; return null; }
function merchantLogo(name, size = 38) {
  const d = domainFor(name);
  if (d) return `<div class="mlogo" style="width:${size}px;height:${size}px"><img src="https://www.google.com/s2/favicons?domain=${d}&sz=128" onerror="this.parentElement.style.display='none'" /></div>`;
  const c = colorFor(name || '?');
  return `<div class="cicon" style="width:${size}px;height:${size}px;background:${c};color:#fff"><span style="font-weight:700;font-size:${Math.round(size * 0.42)}px">${esc((name || '?').trim()[0] || '?').toUpperCase()}</span></div>`;
}

// --- Иконки категорий: цветной кружок + чистая SVG-иконка (без эмодзи) ---
const CICON = {
  'Продукты': ['#4CB782', '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>'],
  'Кафе и рестораны': ['#E0A33E', '<path d="M3 2v7a3 3 0 0 0 6 0V2M6 9v13M16 2c-1.7 0-3 2-3 5s1.3 4 3 4 3-1 3-4-1.3-5-3-5zM16 15v7"/>'],
  'Кофе': ['#B5835A', '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><path d="M6 1v3M10 1v3M14 1v3"/>'],
  'Доставка': ['#E0A33E', '<path d="M21 8V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8M1 5h22v3H1zM10 12h4"/>'],
  'Алкоголь': ['#C97A8A', '<path d="M8 22h8M12 15v7M5 3h14l-1 6a6 6 0 0 1-12 0z"/>'],
  'Транспорт': ['#5B8DEF', '<path d="M4 17h16M5 17V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11M8 4v13M16 4v13"/><circle cx="7.5" cy="17.5" r="1.3"/><circle cx="16.5" cy="17.5" r="1.3"/>'],
  'Такси': ['#5FB8CF', '<path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v5h-2v-1H5v1H3z"/><circle cx="7" cy="15" r="1.2"/><circle cx="17" cy="15" r="1.2"/>'],
  'Каршеринг': ['#5FB8CF', '<path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v5h-2v-1H5v1H3z"/><circle cx="7" cy="15" r="1.2"/><circle cx="17" cy="15" r="1.2"/>'],
  'Топливо': ['#5B8DEF', '<path d="M3 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18M3 12h10M13 8h3l3 3v7a2 2 0 0 1-4 0v-5"/>'],
  'Парковка': ['#5B8DEF', '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>'],
  'Маркетплейс': ['#E0A33E', '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0"/>'],
  'Техника': ['#8A8F98', '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'],
  'Одежда': ['#C98AB8', '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0"/>'],
  'Аптека': ['#E06C75', '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>'],
  'Здоровье': ['#E06C75', '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>'],
  'Спорт': ['#4CB782', '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'],
  'Красота': ['#C98AB8', '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>'],
  'Кино': ['#6E79E6', '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5"/>'],
  'Игры': ['#6E79E6', '<path d="M6 11h4M8 9v4M15 11h.01M18 13h.01"/><path d="M17.3 5H6.7A4.7 4.7 0 0 0 2 9.7L1 16a2 2 0 0 0 3.6 1.4L7 14h10l2.4 3.4A2 2 0 0 0 23 16l-1-6.3A4.7 4.7 0 0 0 17.3 5z"/>'],
  'Музыка': ['#6E79E6', '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'],
  'Подписки': ['#9A7BE0', '<path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>'],
  'ЖКХ': ['#9A7BE0', '<path d="M3 12l9-9 9 9M5 10v10h14V10"/>'],
  'Связь': ['#4CB7A5', '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 11a16 16 0 0 0 6 6l1.6-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z"/>'],
  'Дом': ['#8A8F98', '<path d="M3 12l9-9 9 9M5 10v10h14V10"/>'],
  'Образование': ['#5B8DEF', '<path d="M22 10 12 5 2 10l10 5 10-5zM6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5"/>'],
  'Путешествия': ['#5FB8CF', '<path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.5.5 0 0 0-.5.8L8 11l-2 2-2-.5a.5.5 0 0 0-.4.9l3 2 2 3a.5.5 0 0 0 .9-.4L11 18l2-2 3.1 3.7a.5.5 0 0 0 .7-.5z"/>'],
  'Налоги': ['#8A8F98', '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>'],
  'Зарплата': ['#4CB782', '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'],
  'Прочее': ['#8A8F98', '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>'],
};
const CKEY = [
  [/кофе|кофей|старбакс|coffee/i, 'Кофе'], [/алко|вино|пиво|бар\b/i, 'Алкоголь'], [/доставк|курьер/i, 'Доставка'],
  [/каршер|белка|ситидрайв|делимоб|драйв/i, 'Каршеринг'], [/парков/i, 'Парковка'], [/бензин|топлив|азс|заправ/i, 'Топливо'],
  [/аптек|лекарств/i, 'Аптека'], [/спорт|зал|фитнес|трениров/i, 'Спорт'], [/красот|салон|маникюр|барбер/i, 'Красота'],
  [/кино|фильм/i, 'Кино'], [/музык|spotify/i, 'Музыка'], [/игр|game|steam|playstation/i, 'Игры'],
  [/налог|пошлин|штраф/i, 'Налоги'], [/жкх|коммунал|электр/i, 'ЖКХ'], [/маркетплейс|озон|ozon|wildberries|вайлдбер/i, 'Маркетплейс'],
  [/еда|обед|ужин|ресторан|кафе/i, 'Кафе и рестораны'], [/продукт|магазин|супермаркет|пятёроч|магнит|вкусвилл/i, 'Продукты'],
  [/такси|uber/i, 'Такси'], [/связ|интернет|мтс|билайн|мегафон|tele2/i, 'Связь'], [/здоров|врач|клиник|анализ/i, 'Здоровье'],
  [/одежд|обувь|zara/i, 'Одежда'], [/подписк/i, 'Подписки'], [/транспорт|метро|автобус|проездн/i, 'Транспорт'],
  [/техник|днс|dns|電|ноут|телефон|гаджет/i, 'Техника'], [/образован|курс|школ|универ/i, 'Образование'], [/путешеств|отель|авиа|билет/i, 'Путешествия'],
  [/зарплат|доход|аванс/i, 'Зарплата'],
];
function catMeta(cat) {
  if (cat && CICON[cat]) return CICON[cat];
  if (cat) for (const [re, k] of CKEY) if (re.test(cat)) return CICON[k];
  return CICON['Прочее'];
}
function categoryIcon(cat, size = 38) {
  const [c, svg] = catMeta(cat);
  return `<div class="cicon" style="width:${size}px;height:${size}px;background:${c}26;color:${c}"><svg viewBox="0 0 24 24">${svg}</svg></div>`;
}
function openTxModal(tx) {
  const isEdit = !!tx;
  const t = tx || { type: 'expense', amount: '', category: 'Прочее', merchant: '', title: '' };
  let type = t.type === 'income' ? 'income' : 'expense';
  let v = document.getElementById('txmodal');
  if (!v) { v = document.createElement('div'); v.id = 'txmodal'; v.className = 'editmodal'; document.body.appendChild(v); }
  v.innerHTML = `
    <div class="editcard" style="max-width:440px">
      <div class="row"><div class="b grow">${isEdit ? 'Изменить операцию' : 'Новая операция'}</div><button class="ws-mini" id="txclose">✕</button></div>
      <div class="seg" id="txtype" style="margin:14px 0;width:100%">
        <button data-t="expense" class="${type !== 'income' ? 'active' : ''}" style="flex:1">Расход</button>
        <button data-t="income" class="${type === 'income' ? 'active' : ''}" style="flex:1">Доход</button>
      </div>
      <label class="field"><span>Сумма, ₽</span><input id="txamount" type="number" inputmode="decimal" value="${t.amount || ''}" /></label>
      <label class="field" style="margin-top:10px"><span>Категория</span><select id="txcat">${TX_CATS.map((c) => `<option ${c === t.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field" style="margin-top:10px"><span>Магазин / кто (необязательно)</span><input id="txmerch" value="${esc(t.merchant || '')}" /></label>
      <label class="field" style="margin-top:10px"><span>Описание (необязательно)</span><input id="txtitle" value="${esc(t.title || '')}" /></label>
      <button class="btn full" id="txsave" style="margin-top:16px">${isEdit ? 'Сохранить' : 'Добавить'}</button>
      ${isEdit ? '<button class="btn ghost sm full" id="txdel" style="margin-top:8px;color:var(--red)">Удалить операцию</button>' : ''}
    </div>`;
  const close = () => v.remove();
  v.onclick = (e) => { if (e.target === v) close(); };
  document.getElementById('txclose').onclick = close;
  v.querySelectorAll('#txtype button').forEach((b) => (b.onclick = () => {
    type = b.dataset.t;
    v.querySelectorAll('#txtype button').forEach((x) => x.classList.toggle('active', x === b));
  }));
  setTimeout(() => { const a = document.getElementById('txamount'); if (a) a.focus(); }, 30);
  document.getElementById('txsave').onclick = async () => {
    const amount = Number(document.getElementById('txamount').value);
    if (!amount) { document.getElementById('txamount').focus(); return; }
    const body = {
      type, amount,
      category: document.getElementById('txcat').value,
      merchant: document.getElementById('txmerch').value.trim() || null,
      title: document.getElementById('txtitle').value.trim() || null,
    };
    try {
      if (isEdit) await api('PUT', '/transactions/' + tx.id, body);
      else await api('POST', '/transactions', { ...body, source: 'manual' });
      close(); renderFin();
    } catch (e) { alert(e.message); }
  };
  const del = document.getElementById('txdel');
  if (del) del.onclick = async () => { try { await api('DELETE', '/transactions/' + tx.id); close(); renderFin(); } catch {} };
}

// ================= ПОМОЩНИК =================
const MICSVG = '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3M8 21h8"/></svg>';
const CHAT_QUICK = [
  { t: '☕ Трата', v: 'Купил ', send: false },
  { t: '🤝 Долг', v: 'Дал в долг ', send: false },
  { t: '📝 Заметка', v: 'Создай заметку: ', send: false },
  { t: '📊 Сколько потратил', v: 'Сколько я потратил в этом месяце?', send: true },
  { t: '💰 Мои долги', v: 'Покажи мои долги', send: true },
];
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
async function renderChat() {
  app.innerHTML = `<div class="page-head"><h1>Помощник</h1></div><div class="chat" id="chat"><div class="empty">Загрузка…</div></div>
    <div class="quickrow" id="quickrow">${CHAT_QUICK.map((q, i) => `<button class="chip" data-i="${i}">${q.t}</button>`).join('')}</div>
    <div class="composer">
      <button class="micbtn" id="cmic" title="Записать голосом">${MICSVG}</button>
      <input id="cinput" placeholder="Спроси или запиши: «купил на озоне кофе 250»" />
      <button class="send" id="csend">${SVG.arrow}</button>
    </div>`;
  const input = document.getElementById('cinput');
  const sendBtn = document.getElementById('csend');
  const micBtn = document.getElementById('cmic');
  async function refresh() {
    try {
      const r = await api('GET', '/ai/messages');
      const c = document.getElementById('chat');
      if (!c) return;
      if (!r.messages.length) c.innerHTML = `<div class="empty">Напиши: «купил на озоне кофе 250», «дал Егору 500», «сколько потратил на продукты», «создай заметку…»</div>`;
      else c.innerHTML = r.messages.map((m) => `<div class="msg ${m.role === 'user' ? 'user' : 'ai'}">${esc(m.content)}</div>`).join('');
      c.scrollTop = c.scrollHeight;
    } catch {}
  }
  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const c = document.getElementById('chat');
    c.innerHTML += `<div class="msg user">${esc(text)}</div><div class="msg ai" id="typing">…</div>`;
    c.scrollTop = c.scrollHeight;
    sendBtn.disabled = true;
    try { await api('POST', '/ai/assistant', { text }); } catch (e) { /* ignore */ }
    sendBtn.disabled = false;
    await refresh();
  }
  sendBtn.onclick = send;
  input.onkeydown = (e) => { if (e.key === 'Enter') send(); };

  // Быстрые шаблоны
  app.querySelectorAll('#quickrow .chip').forEach((b) => (b.onclick = () => {
    const q = CHAT_QUICK[+b.dataset.i];
    input.value = q.v;
    if (q.send) send(); else input.focus();
  }));

  // Голосовой ввод: запись с микрофона → транскрипция
  let rec = null, chunks = [];
  micBtn.onclick = async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        try { stream.getTracks().forEach((t) => t.stop()); } catch {}
        micBtn.classList.remove('rec');
        const blob = new Blob(chunks, { type: (rec && rec.mimeType) || 'audio/webm' });
        if (!blob.size) return;
        const prevPh = input.placeholder; input.placeholder = 'Распознаю…'; micBtn.disabled = true;
        try {
          const b64 = await blobToBase64(blob);
          const r = await window.arra.transcribe(b64, blob.type);
          if (r && r.ok && r.text) { input.value = (input.value ? input.value.trim() + ' ' : '') + r.text; input.focus(); }
          else toast('Голос', (r && r.error) || 'Не удалось распознать', 'warn');
        } catch (e) { toast('Голос', e.message, 'warn'); }
        input.placeholder = prevPh; micBtn.disabled = false;
      };
      rec.start();
      micBtn.classList.add('rec');
    } catch (e) { toast('Микрофон', 'Нет доступа к микрофону', 'warn'); }
  };

  refresh();
}

// ================= ФАЙЛЫ =================
async function renderFiles() {
  const st = await window.arra.getStatus();
  app.innerHTML = `<div class="page-head"><h1>Файлы</h1></div>
    <div class="card row"><div class="dot ${st.online ? 'on' : ''}"></div>
      <div class="grow"><div class="b">${st.online ? 'На связи с телефоном' : 'Не в сети'}</div><div class="lbl">${esc(st.folder)}</div></div>
      <button class="btn ghost sm" id="openf">Папка</button><button class="btn ghost sm" id="chf">Сменить</button><button class="btn ghost sm" id="logout">Выйти</button></div>
    <div style="margin-top:12px"><div class="seg" id="modeseg">
      <button data-mode="path" class="${st.mode === 'path' ? 'active' : ''}">Путь к файлу</button>
      <button data-mode="file" class="${st.mode === 'file' ? 'active' : ''}">Сам файл / фото</button>
    </div></div>
    <h2>Принятые</h2><div id="feed"></div>`;
  document.getElementById('openf').onclick = () => window.arra.openFolder();
  document.getElementById('chf').onclick = async () => { await window.arra.chooseFolder(); renderFiles(); };
  document.getElementById('logout').onclick = async () => { await window.arra.logout(); renderLogin(); };
  app.querySelectorAll('#modeseg button').forEach((b) => (b.onclick = () => {
    app.querySelectorAll('#modeseg button').forEach((x) => x.classList.toggle('active', x === b));
    window.arra.setMode(b.dataset.mode);
  }));
  renderFeed();
}
function renderFeed() {
  const feed = document.getElementById('feed');
  if (!feed) return;
  if (!state.files.length) { feed.innerHTML = '<div class="empty">Пока пусто. Отправь файл с телефона.</div>'; return; }
  const imgs = state.files.filter((f) => (f.mime || '').startsWith('image'));
  const docs = state.files.filter((f) => !(f.mime || '').startsWith('image'));
  let html = '';
  if (imgs.length) {
    html += `<div class="feed-grid">` + imgs.map((f) => `<div class="imgcard" data-p="${esc(f.path)}"><img src="${fileURL(f.path)}" loading="lazy" decoding="async" /></div>`).join('') + `</div>`;
  }
  html += docs.map((f) => `<div class="file" data-p="${esc(f.path)}"><div class="tile">${SVG.file}</div><div class="grow"><div class="b ellip">${esc(f.name)}</div><div class="lbl">${f.time || ''}</div></div><button class="copybtn">Путь</button></div>`).join('');
  feed.innerHTML = html;
  feed.querySelectorAll('.imgcard').forEach((el) => (el.onclick = () => openViewer(el.dataset.p)));
  feed.querySelectorAll('.file').forEach((el) => (el.onclick = async () => {
    await window.arra.copyPath(el.dataset.p);
    const btn = el.querySelector('.copybtn'); if (btn) { btn.textContent = 'Скопировано ✓'; btn.classList.add('ok'); }
  }));
}
function openViewer(path) {
  const imgs = state.files.filter((f) => (f.mime || '').startsWith('image'));
  if (!imgs.length) return;
  let idx = Math.max(0, imgs.findIndex((f) => f.path === path));

  // Строим оверлей ОДИН раз; при листании меняем только src (без пересоздания — нет прыжков)
  let v = document.getElementById('viewer');
  if (v) v.remove();
  v = document.createElement('div'); v.id = 'viewer'; v.className = 'viewer';
  v.innerHTML = `<button class="vnav vprev">‹</button><img id="vimg" /><button class="vnav vnext">›</button>
    <button class="vclose">✕</button><span class="vcount"></span><button class="copybtn vcopy">Скопировать путь</button>`;
  document.body.appendChild(v);

  const img = v.querySelector('#vimg');
  const count = v.querySelector('.vcount');
  const update = () => { img.src = fileURL(imgs[idx].path); count.textContent = `${idx + 1} / ${imgs.length}`; };
  const prev = () => { idx = (idx - 1 + imgs.length) % imgs.length; update(); };
  const next = () => { idx = (idx + 1) % imgs.length; update(); };
  const close = () => { v.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') prev(); else if (e.key === 'ArrowRight') next(); };

  v.querySelector('.vclose').onclick = close;
  v.onclick = (e) => { if (e.target === v) close(); };
  v.querySelector('.vprev').onclick = (e) => { e.stopPropagation(); prev(); };
  v.querySelector('.vnext').onclick = (e) => { e.stopPropagation(); next(); };
  v.querySelector('.vcopy').onclick = async (e) => { e.stopPropagation(); await window.arra.copyPath(imgs[idx].path); const b = v.querySelector('.vcopy'); b.textContent = 'Скопировано ✓'; b.classList.add('ok'); };
  document.addEventListener('keydown', onKey);
  if (imgs.length < 2) { v.querySelector('.vprev').style.display = 'none'; v.querySelector('.vnext').style.display = 'none'; }
  update();
}

// ================= ЗАМЕТКИ =================
async function renderNotes() {
  app.innerHTML = `<div class="page-head"><h1>Заметки</h1><div class="grow"></div><button class="btn sm" id="newnote">＋ Новая</button></div><div id="notes" class="notes-grid"><div class="empty">Загрузка…</div></div>`;
  document.getElementById('newnote').onclick = () => editNote(null);
  try {
    const r = await api('GET', '/notes');
    const box = document.getElementById('notes');
    if (!r.notes.length) box.innerHTML = '<div class="empty">Пусто. Нажми «＋ Новая».</div>';
    else box.innerHTML = r.notes.map((n) => {
      const dt = n.updated_at || n.created_at;
      let dstr = '';
      try { if (dt) dstr = new Date(dt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); } catch {}
      const body = (n.body || '').trim();
      return `<div class="note" data-id="${n.id}">
        <div class="nt ellip">${esc(n.title || 'Без названия')}</div>
        <div class="nb ${body ? '' : 'dim'}">${body ? esc(body) : 'Пустая заметка'}</div>
        <div class="nmeta"><span class="ndot"></span>${dstr || 'заметка'}</div>
      </div>`;
    }).join('');
    box.querySelectorAll('.note').forEach((el) => (el.onclick = () => editNote(r.notes.find((n) => n.id === el.dataset.id))));
  } catch (e) { document.getElementById('notes').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
function editNote(note) {
  app.innerHTML = `
    <div class="row"><button class="btn ghost sm" id="back">‹ Назад</button>${note ? '<button class="btn ghost sm right" id="del">Удалить</button>' : ''}</div>
    <input id="ntitle" placeholder="Заголовок" style="margin-top:14px;font-size:18px;font-weight:700" value="${esc(note?.title || '')}" />
    <textarea id="nbody" placeholder="Текст заметки…" style="margin-top:10px;height:300px">${esc(note?.body || '')}</textarea>
    <button class="btn full" id="save" style="margin-top:12px">Сохранить</button>`;
  document.getElementById('back').onclick = renderNotes;
  document.getElementById('save').onclick = async () => {
    const title = document.getElementById('ntitle').value.trim();
    const body = document.getElementById('nbody').value;
    if (!title && !body.trim()) return renderNotes();
    try {
      if (note) await api('PUT', '/notes/' + note.id, { title, body });
      else await api('POST', '/notes', { title, body });
      renderNotes();
    } catch (e) { alert(e.message); }
  };
  const del = document.getElementById('del');
  if (del) del.onclick = async () => { try { await api('DELETE', '/notes/' + note.id); renderNotes(); } catch {} };
}

// ================= ТЕРМИНАЛ / КОД =================
async function renderTerminal() {
  if (!term.root) { try { term.root = await window.arra.getCodeRoot(); term.cwd = term.root; } catch {} }
  termSend({ type: 'hello' });
  app.innerHTML = `
    <div class="workspace ${panelCollapsed ? 'ws-collapsed' : ''}">
      <div class="ws-left">
        <div class="ws-lhead">
          <span class="treepath ellip" id="treepath" title="">Проводник</span>
          <button class="ws-mini" id="drives" title="Диски">${SVG.drive}</button>
        </div>
        <div id="treebox" class="treebox"></div>
      </div>
      <div class="ws-right">
        <div class="term-launchbar">
          <span class="term-launch-label">Запустить</span>
          <button class="term-preset" id="start-codex" title="Запустить Codex в YOLO mode"><i></i>Codex · YOLO mode</button>
          <button class="term-preset claude" id="start-claude" title="Запустить Claude Code без запросов разрешений"><i></i>Claude · полный доступ</button>
          <span class="term-preset-note">в текущей папке</span>
        </div>
        <div class="termtabs" id="termtabs"></div>
        <div id="xterm-host" class="xterm-host"></div>
      </div>
    </div>`;
  document.getElementById('drives').onclick = () => termSend({ type: 'fs_list', reqId: newReq(), path: '' });
  document.getElementById('start-codex').onclick = () => launchTerminalPreset('codex --yolo');
  document.getElementById('start-claude').onclick = () => launchTerminalPreset('claude --dangerously-skip-permissions');
  // загрузить дерево (от папки кода) и поднять терминалы
  termSend({ type: 'fs_list', reqId: newReq(), path: term.root || '' });
  renderTree();
  wirePty();
  renderTermTabs();
  mountActiveTerm();
}

function launchTerminalPreset(command) {
  const x = xts[activeLocal];
  if (!x) return;
  window.arra.ptyInput(command + '\r', activeLocal);
  try { x.term.focus(); } catch {}
  toast('Терминал', command.startsWith('codex') ? 'Codex запущен с полным доступом' : 'Claude запущен с полным доступом', 'info', 3500);
}

// ===================== ЦЕНТР СИНХРОНИЗАЦИИ =====================
const sync = {
  busy: false, projects: [], info: null, log: [], wired: false,
  startedAt: 0, phase: 'Готов', detail: '', pct: 0, indeterminate: false,
  lastCheckSeconds: 0,
  role: '',
  roleSource: 'auto',
  autoRole: 'pc', deviceProfile: null,
  deviceName: '',
  lastDone: localStorage.getItem('arra-sync-last') || '',
  speed: 0, eta: null, lastProgressAt: 0, current: null,
  liveProjects: {}, recentFiles: [], blockedFiles: [], verify: null,
  panelTab: localStorage.getItem('noda-sync-panel') || 'tree',
  blockers: [], blockersChecked: false, blockersBusy: false, closeResult: null,
  remote: {}, showAll: false,
  lastRequest: null, networkRetries: 0,
};
function fmtB(n) {
  if (!n) return '0 Б';
  if (n < 1024) return n + ' Б';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' КБ';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' МБ';
  return (n / 1073741824).toFixed(2) + ' ГБ';
}
function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s} сек`;
  if (s < 3600) return `${Math.floor(s / 60)} мин ${String(s % 60).padStart(2, '0')} сек`;
  return `${Math.floor(s / 3600)} ч ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} мин`;
}
function syncElapsed() { return sync.startedAt ? (Date.now() - sync.startedAt) / 1000 : 0; }
function syncEta(bytes, totalBytes, speed) {
  if (!speed || !totalBytes || bytes >= totalBytes) return '';
  return fmtDuration((totalBytes - bytes) / speed);
}
function syncShortPath(value) {
  const parts = String(value || '').replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length > 4 ? ['…', ...parts.slice(-4)].join(' / ') : parts.join(' / ');
}
function syncConnectionState() {
  if (!sync.busy || !sync.lastProgressAt) return { label: 'ожидание', cls: '' };
  const silent = (Date.now() - sync.lastProgressAt) / 1000;
  if (silent > 30) return { label: `нет ответа ${Math.round(silent)} сек`, cls: 'bad' };
  if (silent > 12) return { label: `пауза ${Math.round(silent)} сек`, cls: 'warn' };
  return { label: 'данные идут', cls: 'ok' };
}
function wireSyncEvents() {
  if (sync.wired) return; sync.wired = true;
  window.arra.onRemoteSyncEvent((message) => handleRemoteSyncEvent(message));
  window.arra.onSyncEvent((o) => {
    if (!o || !o.type) return;
    if (o.type === 'phase') {
      syncLog(o.msg || 'Подготовка переноса');
      sync.busy = true; sync.phase = o.msg || 'Подготовка…'; sync.detail = o.detail || '';
      sync.indeterminate = true; updateSyncStage();
    } else if (o.type === 'scan') {
      sync.busy = true; sync.indeterminate = true;
      sync.phase = o.msg || `Сканирую ${o.side === 'remote' ? 'сервер' : 'этот компьютер'}…`;
      sync.detail = [o.scope, o.files != null ? `${o.files} файлов` : '', o.dirs != null ? `${o.dirs} папок` : ''].filter(Boolean).join(' · ');
      updateSyncStage();
    }
    else if (o.type === 'status') {
      syncLog(`Проверка завершена: ${o.localFiles || 0} здесь, ${o.remoteFiles || 0} на сервере, ${o.upload || 0} отправить, ${o.download || 0} забрать`);
      sync.busy = false; sync.info = o; sync.projects = o.projects || [];
      sync.lastCheckSeconds = Number(o.elapsed) || Math.round(syncElapsed());
      sync.phase = (o.upload || o.download || o.conflicts) ? 'Состояние устройств проверено' : 'Это устройство соответствует серверу';
      sync.detail = `${o.localFiles || 0} файлов здесь · ${o.remoteFiles || 0} файлов на сервере · проверка ${fmtDuration(o.elapsed)}`;
      sync.pct = 0; sync.indeterminate = false; renderSyncViewBody(); updateSyncStage();
    } else if (o.type === 'plan') {
      sync.panelTab = 'log'; localStorage.setItem('noda-sync-panel', 'log');
      syncLog(`${o.direction === 'push' ? 'Отправка на сервер' : 'Получение с сервера'}: ${o.files || 0} файлов, ${fmtB(o.bytes || 0)}`);
      sync.phase = o.direction === 'push' ? 'Отправляю работу на сервер' : 'Забираю работу с сервера';
      sync.detail = `${o.files || 0} файлов · ${fmtB(o.bytes || 0)}${o.only ? ' · ' + o.only : ''}`;
      sync.indeterminate = !(o.files > 0);
      sync.speed = 0; sync.eta = null; sync.current = null; sync.recentFiles = []; sync.blockedFiles = []; sync.verify = null;
      sync.liveProjects = Object.fromEntries((o.projects || []).map((p) => [p.name, { ...p, done: 0, doneBytes: 0 }]));
      updateSyncStage(); updateSyncLive();
    } else if (o.type === 'preflight') {
      sync.phase = 'Проверяю, не заняты ли файлы';
      sync.detail = `${o.checked || 0} из ${o.total || 0}${o.blocked ? ` · занято ${o.blocked}` : ''}${o.file ? ` · ${syncShortPath(o.file)}` : ''}`;
      sync.pct = o.total ? Math.round((o.checked || 0) / o.total * 100) : 0;
      sync.indeterminate = false; sync.lastProgressAt = Date.now();
      setSyncProgress(sync.pct, sync.detail); updateSyncStage(); updateSyncLive();
    } else if (o.type === 'blocked') {
      sync.busy = false; sync.indeterminate = false; sync.blockedFiles = o.files || [];
      sync.phase = `Передача не начата: занято ${o.count || 0} файлов`;
      sync.detail = 'Закрой отмеченные сессии кнопками ниже. Noda проверит их завершение и повторит передачу один раз.';
      sync.pct = 0; setSyncProgress(0, sync.detail); updateSyncStage(); updateSyncLive(); renderSyncV2Body();
      toast('Файлы заняты', `${o.count || 0} файлов нужно освободить`, 'warn', 6000);
    } else if (o.type === 'progress') {
      const pct = o.totalBytes ? Math.round((o.bytes || 0) / o.totalBytes * 100) : (o.total ? Math.round(o.done / o.total * 100) : 0);
      const eta = o.eta != null ? fmtDuration(o.eta) : syncEta(o.bytes, o.totalBytes, o.speed);
      sync.phase = o.direction === 'pull' ? 'Обновляю это устройство с сервера' : 'Сохраняю актуальную работу на сервере';
      sync.detail = `${o.done || 0}/${o.total || 0} · ${fmtB(o.bytes || 0)} из ${fmtB(o.totalBytes || 0)} · ${fmtB(o.speed || 0)}/с${eta ? ` · осталось ~${eta}` : ''}${o.file ? ` · ${o.file}` : ''}`;
      sync.pct = pct; sync.indeterminate = false; sync.speed = Number(o.speed) || 0; sync.eta = o.eta;
      sync.lastProgressAt = Date.now(); sync.current = o;
      const projectKey = o.projectKey || o.project;
      if (projectKey) sync.liveProjects[projectKey] = {
        ...(sync.liveProjects[projectKey] || { name: projectKey, label: o.project }),
        done: o.projectDone || 0, files: o.projectTotal || 0,
        doneBytes: o.projectBytes || 0, bytes: o.projectTotalBytes || 0,
      };
      if (o.state === 'done' || o.state === 'failed') {
        sync.recentFiles.unshift({ file: o.file, project: o.project, direction: o.direction, ok: o.state === 'done', bytes: o.fileTotal || 0 });
        sync.recentFiles = sync.recentFiles.slice(0, 8);
      }
      setSyncProgress(pct, sync.detail); updateSyncStage(); updateSyncLive();
    } else if (o.type === 'retry') {
      sync.lastProgressAt = Date.now();
      syncLog(`↻ попытка ${o.attempt}/4 · ${o.file}: ${o.error}`);
      sync.phase = 'Повторяю файл после ошибки';
      sync.detail = `${syncShortPath(o.file)} · ${o.error}`;
      updateSyncStage(); updateSyncLive();
    } else if (o.type === 'verify') {
      sync.verify = { done: o.done || 0, total: o.total || 0, verified: 0, errors: 0 };
      sync.phase = 'Проверяю, что все файлы дошли';
      sync.detail = `0 из ${o.total || 0} подтверждено на стороне назначения`;
      sync.pct = 0; sync.indeterminate = !(o.total > 0); sync.lastProgressAt = Date.now();
      setSyncProgress(0, sync.detail); updateSyncStage(); updateSyncLive();
    } else if (o.type === 'verify_progress') {
      sync.verify = { done: o.done || 0, total: o.total || 0, verified: o.verified || 0, errors: o.errors || 0, file: o.file };
      sync.phase = 'Проверяю, что все файлы дошли';
      sync.detail = `${o.verified || 0} подтверждено из ${o.total || 0}${o.errors ? ` · ошибок ${o.errors}` : ''} · ${syncShortPath(o.file)}`;
      sync.pct = o.total ? Math.round((o.done || 0) / o.total * 100) : 100;
      sync.indeterminate = false; sync.lastProgressAt = Date.now();
      setSyncProgress(sync.pct, sync.detail); updateSyncStage(); updateSyncLive();
    } else if (o.type === 'fileerror') {
      syncLog(`⚠ ${o.file}: ${o.error}`);
    } else if (o.type === 'done') {
      const verb = o.direction === 'push' ? 'Отправлено на сервер' : 'Забрано с сервера';
      sync.pct = 100; sync.indeterminate = false;
      sync.phase = `${verb}: ${o.transferred || 0} файлов`;
      sync.detail = `${fmtB(o.bytes || 0)} · проверено ${o.verified ?? o.transferred ?? 0}${o.errors ? ` · ошибок ${o.errors}` : ''}${o.skipped ? ` · пропущено ${o.skipped}` : ''}`;
      sync.lastDone = new Date().toISOString(); localStorage.setItem('arra-sync-last', sync.lastDone);
      sync.current = null; sync.speed = 0; sync.eta = null;
      syncLog(`${verb}: ${o.transferred || 0} файлов, ${fmtB(o.bytes || 0)}, ошибок ${o.errors || 0}`);
      setSyncProgress(100, sync.detail); updateSyncStage(); updateSyncLive();
      toast('Передача', `${verb}: ${o.transferred || 0} файлов${o.errors ? `, ошибок ${o.errors}` : ''}`, o.errors ? 'warn' : 'ok');
      // обновим статус после операции
      setTimeout(() => { if (state.section === 'sync') startSyncStatus(); }, 900);
    } else if (o.type === 'error') {
      const transient = /timed out|timeout|etimedout|econnreset|socket|сервер.*не ответил/i.test(String(o.error || ''));
      if (transient && sync.lastRequest && sync.networkRetries < 2) {
        sync.busy = false; sync.indeterminate = true; sync.networkRetries += 1;
        sync.phase = `Сервер не ответил · повтор ${sync.networkRetries} из 2`;
        sync.detail = 'Повторяю соединение автоматически…'; updateSyncStage();
        const request = { ...sync.lastRequest };
        setTimeout(() => runSyncOp(request.mode, request.only, true), 1400 * sync.networkRetries);
        return;
      }
      sync.panelTab = 'log'; localStorage.setItem('noda-sync-panel', 'log'); syncLog('ОШИБКА: ' + (o.error || 'Неизвестная ошибка'));
      sync.busy = false; sync.indeterminate = false; sync.phase = 'Передача остановлена'; sync.detail = o.error || 'Неизвестная ошибка';
      updateSyncStage(); updateSyncLive(); toast('Передача', o.error, 'warn'); renderSyncViewBody();
    } else if (o.type === 'stderr') {
      sync.panelTab = 'log'; localStorage.setItem('noda-sync-panel', 'log'); syncLog(o.msg || 'Ошибка Python');
      renderSyncViewBody();
    } else if (o.type === 'closed') {
      sync.busy = false; sync.indeterminate = false; renderSyncViewBody(); updateSyncStage(); updateSyncLive();
    }
  });
}
function setSyncStatus(msg) { const el = document.getElementById('sync-status'); if (el) el.textContent = msg; }
function setSyncProgress(pct, label) {
  const bar = document.getElementById('sync-bar'); const lab = document.getElementById('sync-prog');
  if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
  if (lab) lab.textContent = label || '';
}
function syncLog(line) {
  sync.log.push(String(line || ''));
  sync.log = sync.log.slice(-240);
  const el = document.getElementById('sync-log');
  if (el) { el.textContent = sync.log.join('\n'); el.scrollTop = el.scrollHeight; }
  const count = document.getElementById('sync-log-count'); if (count) count.textContent = String(sync.log.length);
  const empty = document.querySelector('.sync-log-empty'); if (empty) empty.hidden = !!sync.log.length;
}
function handleRemoteSyncEvent(message) {
  if (!message) return;
  if (message.type === 'sync_remote_ack') {
    toast('Удалённая выгрузка', message.message || 'Команда принята', 'ok');
    return;
  }
  if (message.type === 'sync_remote_blockers') return;
  const event = message.event;
  if (!event) return;
  const key = message.deviceId || message.sourceDeviceId || 'remote';
  const device = state.presence.devices.find((item) => item.id === key);
  const name = device?.name || 'Другое устройство';
  sync.remote[key] = { name, type: event.type, pct: event.type === 'progress' ? Math.round((event.bytes || 0) / Math.max(1, event.totalBytes || 1) * 100) : (event.type === 'done' ? 100 : 0), event };
  if (event.type === 'progress') syncLog(`${name}: ${fmtB(event.speed || 0)}/с · ${event.done || 0}/${event.total || 0}`);
  if (event.type === 'done') toast(name, `Выгрузка завершена: ${event.transferred || 0} файлов`, event.errors ? 'warn' : 'ok', 7000);
  if (event.type === 'error') toast(name, event.error || 'Ошибка удалённой выгрузки', 'warn', 7000);
  renderRemoteDevices();
}
function updateSyncStage() {
  setSyncStatus(sync.phase);
  const detail = document.getElementById('sync-detail'); if (detail) detail.textContent = sync.detail || '';
  const icon = document.getElementById('sync-stage-icon'); if (icon) icon.classList.toggle('busy', sync.busy);
  const track = document.getElementById('sync-track'); if (track) track.classList.toggle('indeterminate', !!sync.indeterminate);
  const tm = document.getElementById('sync-time');
  if (tm) tm.textContent = sync.busy
    ? fmtDuration(syncElapsed())
    : (sync.lastDone
      ? `последняя: ${new Date(sync.lastDone).toLocaleString('ru-RU', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}`
      : (sync.info ? `проверено за ${fmtDuration(sync.lastCheckSeconds)}` : 'ещё не запускалась'));
  const cancel = document.getElementById('sync-cancel'); if (cancel) cancel.hidden = !sync.busy;
  const push = document.getElementById('sync-push-all'); if (push) push.disabled = sync.busy;
  const pull = document.getElementById('sync-pull-all'); if (pull) pull.disabled = sync.busy;
  const speed = document.getElementById('sync-speed-value'); if (speed) speed.textContent = sync.speed ? `${fmtB(sync.speed)}/с` : '—';
  const eta = document.getElementById('sync-eta-value'); if (eta) eta.textContent = sync.eta != null ? fmtDuration(sync.eta) : '—';
  const pct = document.getElementById('sync-pct-value'); if (pct) pct.textContent = `${sync.pct || 0}%`;
}
function updateSyncLive() {
  const box = document.getElementById('sync-live');
  if (!box) return;
  const hasData = sync.busy || sync.current || sync.blockedFiles.length || sync.verify || Object.keys(sync.liveProjects).length;
  box.hidden = !hasData;
  if (!hasData) return;
  const conn = syncConnectionState();
  const current = sync.current || {};
  const currentPct = current.fileTotal ? Math.round((current.fileBytes || 0) / current.fileTotal * 100) : 0;
  const projects = Object.values(sync.liveProjects).filter((p) => p.files).sort((a, b) => String(a.label || a.name).localeCompare(String(b.label || b.name), 'ru'));
  const blockedHtml = sync.blockedFiles.length ? `
    <div class="sync-blocked-panel">
      <div class="sync-live-heading"><b>Нужно освободить файлы</b><span>${sync.blockedFiles.length}</span></div>
      ${sync.blockedFiles.slice(0, 12).map((f) => `<div class="sync-file-line blocked"><i>!</i><div><b>${esc(f.project || 'Файл')}</b><span>${esc(syncShortPath(f.file))}</span><small>${esc(f.reason || 'файл занят')}</small></div></div>`).join('')}
      ${sync.blockedFiles.length > 12 ? `<div class="sync-more">ещё ${sync.blockedFiles.length - 12}</div>` : ''}
      <button class="btn sync-retry-btn" id="sync-retry-check">Повторить передачу</button>
    </div>` : '';
  box.innerHTML = `
    <div class="sync-live-metrics">
      <div><span>СКОРОСТЬ</span><b>${sync.speed ? `${fmtB(sync.speed)}/с` : '—'}</b></div>
      <div><span>ОСТАЛОСЬ</span><b>${sync.eta != null ? fmtDuration(sync.eta) : '—'}</b></div>
      <div><span>ПРОГРЕСС</span><b>${sync.pct || 0}%</b></div>
      <div class="${conn.cls}"><span>СОЕДИНЕНИЕ</span><b>${esc(conn.label)}</b></div>
    </div>
    ${current.file ? `<div class="sync-current-file">
      <div class="sync-current-top"><span>${current.direction === 'pull' ? 'СЕРВЕР → УСТРОЙСТВО' : 'УСТРОЙСТВО → СЕРВЕР'}</span><b>${esc(current.project || current.scope || '')}</b><em>${currentPct}%</em></div>
      <div class="sync-current-path">${esc(syncShortPath(current.file))}</div>
      <div class="sync-file-track"><i style="width:${Math.max(0, Math.min(100, currentPct))}%"></i></div>
      <div class="sync-current-meta"><span>${fmtB(current.fileBytes || 0)} из ${fmtB(current.fileTotal || 0)}</span><span>${current.done || 0} / ${current.total || 0} файлов</span></div>
    </div>` : ''}
    ${projects.length ? `<div class="sync-project-progress">
      <div class="sync-live-heading"><b>Ход по проектам</b><span>${projects.length}</span></div>
      ${projects.map((p) => { const pct = p.bytes ? Math.round((p.doneBytes || 0) / p.bytes * 100) : (p.files ? Math.round((p.done || 0) / p.files * 100) : 0); return `<div class="sync-project-progress-row"><b>${esc(p.label || p.name)}</b><div><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div><span>${p.done || 0}/${p.files || 0}</span></div>`; }).join('')}
    </div>` : ''}
    ${sync.recentFiles.length ? `<div class="sync-recent"><div class="sync-live-heading"><b>Последние файлы</b><span>живой журнал</span></div>${sync.recentFiles.map((f) => `<div class="sync-file-line ${f.ok ? 'ok' : 'bad'}"><i>${f.ok ? '✓' : '!'}</i><div><b>${esc(f.project || '')}</b><span>${esc(syncShortPath(f.file))}</span></div><small>${fmtB(f.bytes || 0)}</small></div>`).join('')}</div>` : ''}
    ${sync.verify ? `<div class="sync-verify-line ${sync.verify.errors ? 'bad' : ''}"><b>Проверка целостности</b><span>${sync.verify.verified || 0} подтверждено из ${sync.verify.total || 0}${sync.verify.errors ? ` · ошибок ${sync.verify.errors}` : ''}</span></div>` : ''}
    ${blockedHtml}`;
  const retry = document.getElementById('sync-retry-check');
  if (retry) retry.onclick = () => sync.lastRequest ? runSyncOp(sync.lastRequest.mode, sync.lastRequest.only) : startSyncStatus();
}
setInterval(() => { if (sync.busy && state.section === 'sync') { updateSyncStage(); updateSyncLive(); } }, 1000);
function startSyncStatus() {
  if (sync.busy) return;
  sync.busy = true; sync.startedAt = Date.now(); sync.phase = 'Подключаюсь к серверу…'; sync.detail = 'Подготавливаю безопасное сравнение'; sync.pct = 0; sync.indeterminate = true;
  sync.lastProgressAt = Date.now(); sync.current = null; sync.speed = 0; sync.eta = null;
  sync.liveProjects = {}; sync.recentFiles = []; sync.blockedFiles = []; sync.verify = null;
  setSyncProgress(0, ''); updateSyncStage();
  syncLog('Проверяю изменения на устройстве и сервере…');
  window.arra.syncRun('status', null, null);
}
function runSyncOp(mode, only, automaticRetry = false) {
  if (sync.busy) { toast('Перенос', 'Идёт операция, подожди', 'info'); return; }
  if (!automaticRetry) sync.networkRetries = 0;
  sync.lastRequest = { mode, only: only || null };
  sync.busy = true; sync.startedAt = Date.now(); sync.pct = 0; sync.indeterminate = true;
  sync.lastProgressAt = Date.now(); sync.current = null; sync.speed = 0; sync.eta = null;
  sync.liveProjects = {}; sync.recentFiles = []; sync.blockedFiles = []; sync.verify = null;
  setSyncProgress(0, ''); const lg = document.getElementById('sync-log'); if (lg) { lg.textContent = ''; lg.style.display = 'none'; }
  sync.phase = (mode === 'push' ? 'Готовлю отправку на сервер' : 'Готовлю получение с сервера') + (only ? ' · ' + only : '') + '…';
  sync.detail = 'Повторно проверяю файлы перед копированием'; updateSyncStage();
  syncLog(`${mode === 'push' ? 'Запрошена отправка' : 'Запрошено получение'}${only ? ': ' + only : ': все изменения'}`);
  window.arra.syncRun(mode, only || null, null);
  renderSyncViewBody();
}

async function refreshSyncBlockers() {
  if (sync.blockersBusy) return;
  sync.blockersBusy = true;
  renderBlockerPanel();
  try { sync.blockers = await window.arra.syncBlockers() || []; }
  catch (error) { reportError('sync.blockers.refresh', error); sync.blockers = []; }
  if (!sync.blockers.length) sync.closeResult = null;
  sync.blockersChecked = true;
  sync.blockersBusy = false;
  renderBlockerPanel();
}

function renderBlockerPanel() {
  const box = document.getElementById('sync-blocker-panel');
  if (!box) return;
  const grouped = [...sync.blockers.reduce((map, item) => {
    const key = `${item.type}:${String(item.name || '').toLowerCase()}`;
    const row = map.get(key) || { ...item, count: 0 };
    row.count += 1;
    if (!row.title && item.title) row.title = item.title;
    map.set(key, row);
    return map;
  }, new Map()).values()];
  const rows = grouped.slice(0, 6);
  const remaining = sync.closeResult?.remaining || [];
  const closeWarning = remaining.length ? `<div class="sync-close-warning">
    <b>Не закрылись: ${esc(remaining.map((item) => item.title || item.name || `PID ${item.pid}`).join(', '))}</b>
    <span>Сохрани изменения и закрой вручную либо используй принудительное закрытие — несохранённый текст будет потерян.</span>
    <button id="sync-force-close" data-force-pids="${remaining.map((item) => item.pid).filter(Boolean).join(',')}">Закрыть принудительно</button>
  </div>` : '';
  box.innerHTML = `
    <div class="sync-utility-head"><b>Открытые сессии</b><div class="sync-utility-actions">${rows.length ? '<button id="sync-close-all">Закрыть все</button>' : ''}<button id="sync-check-blockers">${sync.blockersBusy ? 'Проверяю…' : 'Проверить'}</button></div></div>
    ${closeWarning}
    ${!sync.blockersChecked ? '<div class="sync-utility-empty">Редакторы и терминалы, которые могут держать файлы.</div>' :
      (!rows.length ? '<div class="sync-utility-ok">Ничего мешающего не найдено</div>' : rows.map((item) => { const pids = sync.blockers.filter((source) => source.type === item.type && String(source.name || '').toLowerCase() === String(item.name || '').toLowerCase()).map((source) => source.pid).filter(Boolean); return `<div class="sync-process-row"><span class="dot warn"></span><div><b>${esc(item.name)}${item.count > 1 ? ` · ${item.count}` : ''}</b><small>${esc(item.title || (item.pid ? `PID ${item.pid}` : 'активная сессия'))}</small></div><button data-close-pids="${pids.join(',')}">Закрыть</button></div>`; }).join(''))}
    ${grouped.length > rows.length ? `<div class="sync-utility-more">ещё ${grouped.length - rows.length}</div>` : ''}`;
  const button = document.getElementById('sync-check-blockers');
  if (button) { button.disabled = sync.blockersBusy; button.onclick = refreshSyncBlockers; }
  box.querySelectorAll('[data-close-pids]').forEach((close) => { close.onclick = () => closeSyncSessions(String(close.dataset.closePids || '').split(',').map(Number).filter(Boolean)); });
  const closeAll = document.getElementById('sync-close-all');
  if (closeAll) closeAll.onclick = () => closeSyncSessions(sync.blockers.map((item) => item.pid).filter(Boolean));
  const force = document.getElementById('sync-force-close');
  if (force) force.onclick = () => forceCloseSyncSessions(String(force.dataset.forcePids || '').split(',').map(Number).filter(Boolean));
}

async function finishBlockerClose(result, retryRequest) {
  sync.blockersBusy = false;
  sync.closeResult = result;
  if (result?.remaining?.length) {
    sync.blockers = result.remaining.map((item) => ({ type: 'process', ...item }));
    sync.blockersChecked = true;
    const names = result.remaining.map((item) => item.title || item.name || `PID ${item.pid}`).join(', ');
    syncLog(`Не закрылись: ${names}`);
    toast('Редактор не закрылся', names, 'warn', 8000);
    renderBlockerPanel();
    return;
  }
  sync.closeResult = null;
  await refreshSyncBlockers();
  if (retryRequest && !sync.blockers.length && !sync.busy) {
    sync.blockedFiles = [];
    toast('Сессии закрыты', 'Файлы освобождены — повторяю передачу', 'ok', 3500);
    setTimeout(() => runSyncOp(retryRequest.mode, retryRequest.only, false), 350);
  } else {
    toast('Сессии закрыты', `${result?.closed || 0} процессов завершено`, 'ok', 3000);
  }
}

async function closeSyncSessions(pids) {
  if (!pids.length) return;
  if (!confirm('Закрыть выбранные редакторы и терминалы? Если в них есть несохранённые файлы, Windows покажет запрос на сохранение.')) return;
  const retryRequest = sync.blockedFiles.length && sync.lastRequest ? { ...sync.lastRequest } : null;
  sync.blockersBusy = true; sync.closeResult = null; renderBlockerPanel();
  toast('Сессии', 'Закрываю и проверяю завершение процессов…', 'info', 3000);
  try {
    const result = await window.arra.syncCloseBlockers(pids);
    if (!result?.ok && !result?.remaining?.length) {
      sync.blockersBusy = false; reportError('sync.blockers.close', new Error(result?.error || 'Не удалось закрыть процессы'), { pids });
      toast('Сессии', result?.error || 'Не удалось закрыть процессы', 'warn'); renderBlockerPanel(); return;
    }
    await finishBlockerClose(result, retryRequest);
  } catch (error) {
    sync.blockersBusy = false; reportError('sync.blockers.close', error, { pids });
    toast('Сессии', error.message || 'Не удалось закрыть процессы', 'warn'); renderBlockerPanel();
  }
}

async function forceCloseSyncSessions(pids) {
  if (!pids.length) return;
  if (!confirm('Принудительно завершить эти процессы? Все несохранённые изменения в них будут потеряны.')) return;
  const retryRequest = sync.blockedFiles.length && sync.lastRequest ? { ...sync.lastRequest } : null;
  sync.blockersBusy = true; renderBlockerPanel();
  try {
    const result = await window.arra.syncForceCloseBlockers(pids);
    if (!result?.ok && !result?.remaining?.length) {
      sync.blockersBusy = false; reportError('sync.blockers.force-close', new Error(result?.error || 'Не удалось завершить процессы'), { pids });
      toast('Сессии', result?.error || 'Не удалось завершить процессы', 'warn'); renderBlockerPanel(); return;
    }
    await finishBlockerClose(result, retryRequest);
  } catch (error) {
    sync.blockersBusy = false; reportError('sync.blockers.force-close', error, { pids });
    toast('Сессии', error.message || 'Не удалось завершить процессы', 'warn'); renderBlockerPanel();
  }
}

async function startRemotePush(deviceId) {
  const device = state.presence.devices.find((item) => item.id === deviceId);
  if (!device?.online) { toast('Удалённая выгрузка', 'Устройство сейчас не в сети', 'warn'); return; }
  const result = await window.arra.remoteSync(deviceId, 'push');
  if (!result?.ok) { toast('Удалённая выгрузка', result?.error || 'Команда не отправлена', 'warn'); return; }
  sync.remote[deviceId] = { name: device.name, type: 'starting', pct: 0 };
  renderRemoteDevices();
}

function renderRemoteDevices() {
  const box = document.getElementById('sync-remote-devices');
  if (!box) return;
  const currentRole = state.presence.status?.deviceProfile?.role;
  const candidates = state.presence.devices.filter((device) => device.id !== state.presence.currentId && (!currentRole || device.role !== currentRole));
  // Старые токены одного и того же ноутбука не должны превращаться в три
  // одинаковые строки. На роль показываем один живой, иначе самый свежий.
  const others = ['laptop', 'pc'].map((role) => candidates
    .filter((device) => device.role === role)
    .sort((a, b) => Number(b.online) - Number(a.online) || String(b.last_seen || b.created_at || '').localeCompare(String(a.last_seen || a.created_at || '')))[0])
    .filter(Boolean);
  box.innerHTML = `<div class="sync-utility-head"><b>Другие устройства</b><span>удалённая выгрузка</span></div>${others.length ? others.map((device) => {
    const remote = sync.remote[device.id];
    const running = remote && !['done', 'error', 'closed'].includes(remote.type);
    return `<div class="sync-remote-row"><span class="dot ${device.online ? 'on' : ''}"></span><div><b>${esc(device.name || (device.role === 'laptop' ? 'Ноутбук' : 'ПК'))}</b><small>${running ? `выполняется${remote.pct ? ` · ${remote.pct}%` : '…'}` : (device.online ? 'в сети' : 'не в сети')}</small></div><button data-remote-push="${esc(device.id)}" ${!device.online || running ? 'disabled' : ''}>На сервер</button></div>`;
  }).join('') : '<div class="sync-utility-empty">Других устройств пока нет.</div>'}`;
  box.querySelectorAll('[data-remote-push]').forEach((button) => { button.onclick = () => startRemotePush(button.dataset.remotePush); });
}
function renderSyncViewBody() {
  if (document.querySelector('.sync-v3')) renderSyncV2Body();
  else renderSyncBody();
}
function openSyncConfirm() {
  const i = sync.info || {};
  let v = document.getElementById('sync-confirm-modal');
  if (!v) { v = document.createElement('div'); v.id = 'sync-confirm-modal'; v.className = 'editmodal'; document.body.appendChild(v); }
  v.innerHTML = `<div class="sync-confirm">
    <h3>Синхронизировать этот компьютер?</h3>
    <div class="dim" style="margin-top:6px;line-height:1.45">Arra возьмёт более свежие версии с каждого компьютера. Перед заменой существующего файла будет создана резервная копия. Неоднозначные конфликты останутся без изменений.</div>
    <div class="sync-confirm-summary">
      <div><b style="color:#6E8FE8">${i.upload || 0}</b><span>отправить</span></div>
      <div><b style="color:var(--green)">${i.download || 0}</b><span>получить</span></div>
      <div><b style="color:var(--yellow)">${i.conflicts || 0}</b><span>проверить вручную</span></div>
    </div>
    <div class="row"><button class="btn ghost grow" id="sync-confirm-cancel">Отмена</button><button class="btn grow" id="sync-confirm-go">Синхронизировать</button></div>
  </div>`;
  const close = () => v.remove();
  v.onclick = (e) => { if (e.target === v) close(); };
  document.getElementById('sync-confirm-cancel').onclick = close;
  document.getElementById('sync-confirm-go').onclick = () => { close(); runSyncOp('sync', null); };
}
function renderSync() {
  wireSyncEvents();
  app.innerHTML = `
    <div class="syncwrap">
      <div class="synchead">
        <div>
          <div class="synctitle">Синхронизация</div>
          <div class="syncsubtitle">Проекты и память помощников на ноутбуке и компьютере. Сервер хранит промежуточную безопасную копию.</div>
        </div>
        <div class="syncacts">
          <button class="btn ghost" id="sync-refresh">Проверить изменения</button>
          <button class="btn ghost" id="sync-cancel" hidden>Остановить</button>
          <button class="btn sync-primary" id="sync-safe">Синхронизировать</button>
        </div>
      </div>
      <div class="syncstage">
        <div class="syncstage-top">
          <div class="syncstage-icon" id="sync-stage-icon"><svg viewBox="0 0 24 24"><path d="M20 7h-5V2M4 17h5v5M20 7a8 8 0 0 0-14.5-2M4 17a8 8 0 0 0 14.5 2"/></svg></div>
          <div class="syncstage-copy"><div class="syncstage-title" id="sync-status">Готов</div><div class="syncstage-detail" id="sync-detail"></div></div>
          <div class="syncstage-time" id="sync-time"></div>
        </div>
        <div class="syncprogwrap"><div class="syncprogtrack" id="sync-track"><div class="syncprogbar" id="sync-bar"></div></div><div class="dim" id="sync-prog" style="font-size:11px;min-height:14px;margin-top:6px"></div></div>
      </div>
      <div id="sync-metrics" class="syncmetrics"></div>
      <div class="syncsection-head"><h2>Изменения по проектам</h2><span id="sync-project-count"></span></div>
      <div id="sync-projects" class="syncprojects"></div>
      <div class="syncsection-head"><h2>Что защищает Arra</h2><span>без сборок, кэшей и зависимостей</span></div>
      <div class="card" style="padding:0">
        <div class="syncscope"><div class="syncscope-icon">PR</div><div class="syncscope-copy"><b>Все проекты</b><span>C:\\Claude — исходники, документы, настройки и локальные инструкции</span></div></div>
        <div class="syncscope"><div class="syncscope-icon">CL</div><div class="syncscope-copy"><b>Память Claude Code</b><span>проекты, MEMORY.md, команды, настройки и рабочий контекст</span></div></div>
        <div class="syncscope"><div class="syncscope-icon">CX</div><div class="syncscope-copy"><b>Память Codex</b><span>настройки, навыки, инструкции и сохранённый рабочий контекст</span></div></div>
      </div>
      <pre id="sync-log" class="synclog" style="display:none"></pre>
      <div class="sync-foot">Удаления выключены. Перед заменой создаётся резервная копия. Конфликты с неясной более свежей версией Arra не трогает, пока ты не выберешь направление.</div>
    </div>`;
  document.getElementById('sync-refresh').onclick = () => startSyncStatus();
  document.getElementById('sync-safe').onclick = openSyncConfirm;
  document.getElementById('sync-cancel').onclick = async () => { await window.arra.syncCancel(); sync.busy = false; sync.indeterminate = false; sync.phase = 'Остановлено'; sync.detail = 'Файлы, которые успели скопироваться, сохранены'; updateSyncStage(); renderSyncBody(); };
  renderSyncBody();
  updateSyncStage();
  if (!sync.info) startSyncStatus();
}
function renderSyncBody() {
  const box = document.getElementById('sync-projects'); if (!box) return;
  const i = sync.info || {};
  const metrics = document.getElementById('sync-metrics');
  if (metrics) metrics.innerHTML = `
    <div class="syncmetric"><strong>${i.localFiles || 0}</strong><span>файлов здесь</span></div>
    <div class="syncmetric"><strong>${i.remoteFiles || 0}</strong><span>в безопасной копии</span></div>
    <div class="syncmetric up"><strong>${i.upload || 0}</strong><span>отправить</span></div>
    <div class="syncmetric down"><strong>${i.download || 0}</strong><span>получить</span></div>
    <div class="syncmetric warn"><strong>${i.conflicts || 0}</strong><span>конфликтов</span></div>`;
  const changed = sync.projects.filter((p) => (p.upload || 0) + (p.download || 0) + (p.conflicts || 0) > 0);
  const count = document.getElementById('sync-project-count'); if (count) count.textContent = changed.length ? `${changed.length} требуют внимания` : 'изменений нет';
  if (!changed.length) {
    box.innerHTML = sync.busy ? `<div class="empty" style="padding:24px">Составляю карту изменений…</div>`
      : `<div class="empty" style="padding:24px">Ноутбук и компьютер синхронизированы</div>`;
    updateSyncStage();
    return;
  }
  box.innerHTML = changed.map((p) => `
    <div class="synccard">
      <div class="syncinfo">
        <div class="syncname ellip">${esc(p.label || p.name)}</div>
        <div class="syncpath ellip">${esc(p.name)}</div>
      </div>
      <div class="syncchanges">
          ${p.upload ? `<span class="badge up">↑ ${p.upload} · ${fmtB(p.uploadBytes)}</span>` : ''}
          ${p.download ? `<span class="badge down">↓ ${p.download} · ${fmtB(p.downloadBytes)}</span>` : ''}
          ${p.conflicts ? `<span class="badge conflict">⚠ ${p.conflicts} конфликтов</span>` : ''}
      </div>
      <div class="syncbtns">
        ${p.download ? `<button class="btn ghost sm" data-pull="${esc(p.name)}">Принять</button>` : ''}
        ${p.upload ? `<button class="btn ghost sm" data-push="${esc(p.name)}">Отправить</button>` : ''}
      </div>
    </div>`).join('');
  box.querySelectorAll('[data-push]').forEach((b) => (b.onclick = () => runSyncOp('push', b.dataset.push)));
  box.querySelectorAll('[data-pull]').forEach((b) => (b.onclick = () => runSyncOp('pull', b.dataset.pull)));
  updateSyncStage();
}

function fmtSyncDate(value) {
  if (!value) return 'ещё не было';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'ещё не было';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function openTransferConfirm(mode, only) {
  const i = sync.info || {};
  const count = mode === 'push' ? (only ? (sync.projects.find((p) => p.name === only)?.upload || 0) : (i.upload || 0))
    : (only ? (sync.projects.find((p) => p.name === only)?.download || 0) : (i.download || 0));
  let v = document.getElementById('sync-confirm-modal');
  if (!v) { v = document.createElement('div'); v.id = 'sync-confirm-modal'; v.className = 'editmodal'; document.body.appendChild(v); }
  const pushing = mode === 'push';
  v.innerHTML = `<div class="sync-confirm">
    <div class="sync-confirm-kicker">${pushing ? 'ЭТО УСТРОЙСТВО → СЕРВЕР' : 'СЕРВЕР → ЭТО УСТРОЙСТВО'}</div>
    <h3>${pushing ? 'Отправить законченную работу?' : 'Забрать актуальную работу?'}</h3>
    <div class="dim" style="margin-top:7px;line-height:1.5">${pushing
      ? `Noda сначала проверит все ${count} файлов на блокировки, затем атомарно отправит их на сервер и повторно сверит результат. Если Claude, Codex или редактор держит файл открытым, передача не начнётся.`
      : `Noda сначала проверит локальные назначения, затем заберёт ${count} файлов во временные копии, атомарно заменит старые версии и повторно сверит результат.`}</div>
    <div class="sync-confirm-summary two">
      <div><b>${count}</b><span>файлов</span></div>
      <div><b>${(i.conflicts || 0) + (i.blocked || 0)}</b><span>проверить до передачи</span></div>
    </div>
    <div class="row"><button class="btn ghost grow" id="sync-confirm-cancel">Отмена</button><button class="btn grow" id="sync-confirm-go">${pushing ? 'Отправить на сервер' : 'Забрать с сервера'}</button></div>
  </div>`;
  const close = () => v.remove();
  v.onclick = (e) => { if (e.target === v) close(); };
  document.getElementById('sync-confirm-cancel').onclick = close;
  document.getElementById('sync-confirm-go').onclick = () => { close(); runSyncOp(mode, only || null); };
}

async function renderSyncV2() {
  wireSyncEvents();
  if (sync.panelTab === 'log' && !sync.log.length && !sync.busy) sync.panelTab = 'tree';
  try {
    const st = await window.arra.getStatus();
    sync.deviceName = st.deviceName || 'Это устройство';
    sync.deviceProfile = st.deviceProfile || null;
    sync.autoRole = st.deviceProfile?.role || 'pc';
    if (sync.roleSource === 'auto' || !sync.role) sync.role = sync.autoRole;
  } catch { sync.deviceName = 'Это устройство'; if (!sync.role) sync.role = 'pc'; }
  app.innerHTML = `
    <div class="syncwrap sync-v3">
      <header class="sync-v3-head">
        <div class="synctitle">Передача</div>
        <div class="sync-head-actions"><button class="sync-refresh-link" id="sync-open-logs">Логи ошибок</button><button class="sync-refresh-link" id="sync-refresh">Проверить</button></div>
      </header>

      <div class="sync-workbench">
        <section class="sync-command" aria-label="Управление переносом">
          <div id="sync-route" class="sync-route-summary"></div>
          <div id="sync-actions" class="sync-transfer-list"></div>

          <div class="sync-runtime-strip">
            <div><span>Скорость</span><b id="sync-speed-value">—</b></div>
            <div><span>Осталось</span><b id="sync-eta-value">—</b></div>
            <div><span>Прогресс</span><b id="sync-pct-value">0%</b></div>
          </div>

          <div class="syncstage sync-v3-stage">
            <div class="syncstage-top">
              <div class="syncstage-icon" id="sync-stage-icon"><svg viewBox="0 0 24 24"><path d="M20 7h-5V2M4 17h5v5M20 7a8 8 0 0 0-14.5-2M4 17a8 8 0 0 0 14.5 2"/></svg></div>
              <div class="syncstage-copy"><div class="syncstage-title" id="sync-status">Готов</div><div class="syncstage-detail" id="sync-detail"></div></div>
              <div class="syncstage-time" id="sync-time"></div>
            </div>
            <div class="syncprogwrap"><div class="syncprogtrack" id="sync-track"><div class="syncprogbar" id="sync-bar"></div></div><div class="dim" id="sync-prog"></div></div>
            <button class="sync-stop-link" id="sync-cancel" hidden>Прервать передачу</button>
          </div>
          <div id="sync-metrics" class="sync-summary-strip"></div>
          <div id="sync-blocker-panel" class="sync-utility-panel"></div>
          <div id="sync-remote-devices" class="sync-utility-panel"></div>
        </section>

        <section class="sync-inspector" aria-label="Детали переноса">
          <div class="sync-inspector-head">
            <div class="sync-tabs" role="tablist">
              <button role="tab" data-sync-tab="tree" class="${sync.panelTab === 'tree' ? 'active' : ''}">Иерархия</button>
              <button role="tab" data-sync-tab="log" class="${sync.panelTab === 'log' ? 'active' : ''}">Журнал <span id="sync-log-count"></span></button>
            </div>
            <div class="sync-inspector-actions"><button id="sync-filter-projects">${sync.showAll ? 'Только изменения' : 'Все проекты'}</button><span id="sync-project-count"></span></div>
          </div>

          <div class="sync-inspector-panel ${sync.panelTab === 'tree' ? 'active' : ''}" data-sync-panel="tree">
            <div class="sync-tree-section"><div class="sync-tree-title"><b>Проекты</b><span>раскрой проект, чтобы увидеть файлы</span></div><div id="sync-projects" class="sync-table"></div></div>
            <div class="sync-tree-section"><div class="sync-tree-title"><b>Память помощников</b><span>Claude Code и Codex</span></div><div id="sync-memory" class="sync-table"></div></div>
            <details id="sync-system-wrap" class="sync-system-wrap"><summary>Служебные папки <span id="sync-system-count"></span></summary><div id="sync-system" class="sync-table"></div></details>
          </div>

          <div class="sync-inspector-panel ${sync.panelTab === 'log' ? 'active' : ''}" data-sync-panel="log">
            <div id="sync-live" class="sync-live" hidden></div>
            <pre id="sync-log" class="synclog">${esc(sync.log.join('\n'))}</pre>
            <div class="sync-log-empty" ${sync.log.length ? 'hidden' : ''}>Журнал появится здесь после проверки или передачи файлов.</div>
          </div>
        </section>
      </div>

    </div>`;
  document.getElementById('sync-refresh').onclick = startSyncStatus;
  document.getElementById('sync-open-logs').onclick = async () => {
    const result = await window.arra.openLogs();
    if (!result?.ok) { reportError('logs.open', new Error(result?.error || 'Не удалось открыть логи')); toast('Логи ошибок', result?.error || 'Не удалось открыть папку', 'warn'); }
  };
  document.getElementById('sync-cancel').onclick = async () => {
    await window.arra.syncCancel(); sync.busy = false; sync.indeterminate = false;
    sync.phase = 'Передача прервана'; sync.detail = 'Уже переданные файлы сохранены'; updateSyncStage(); renderSyncV2Body();
  };
  document.getElementById('sync-filter-projects').onclick = () => { sync.showAll = !sync.showAll; renderSyncV2(); };
  app.querySelectorAll('[data-sync-tab]').forEach((button) => {
    button.onclick = () => { sync.panelTab = button.dataset.syncTab; localStorage.setItem('noda-sync-panel', sync.panelTab); renderSyncV2(); };
  });
  renderSyncV2Body(); renderBlockerPanel(); renderRemoteDevices(); updateSyncStage(); updateSyncLive();
}

function syncDeviceGlyph(kind) {
  if (kind === 'laptop') return '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="11" rx="2"/><path d="M2.5 19h19M8 19l1-2h6l1 2"/></svg>';
  if (kind === 'server') return '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="7" rx="2"/><path d="M8 6.5h.01M8 17.5h.01M12 6.5h5M12 17.5h5"/></svg>';
  return '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8M12 16v5"/></svg>';
}

function renderSyncV2Body() {
  const projectsBox = document.getElementById('sync-projects');
  const memoryBox = document.getElementById('sync-memory');
  if (!projectsBox || !memoryBox) return;
  const i = sync.info || {};
  const stateInfo = i.serverState || {};
  const lastPush = stateInfo.lastPush || null;
  const route = document.getElementById('sync-route');
  if (route) route.innerHTML = `
    <i class="device-icon">${syncDeviceGlyph('server')}</i>
    <div><span>СЕРВЕР</span><b>${!sync.info ? 'статус не проверен' : (lastPush ? fmtSyncDate(lastPush.at) : (i.remoteFiles ? `${fmt(i.remoteFiles)} файлов` : 'копии пока нет'))}</b>${lastPush ? `<small>${esc(lastPush.device || '')}</small>` : ''}</div>`;

  const uploadBytes = sync.projects.reduce((n, p) => n + Number(p.uploadBytes || 0), 0);
  const downloadBytes = sync.projects.reduce((n, p) => n + Number(p.downloadBytes || 0), 0);
  const hasCheck = !!sync.info;
  const actions = document.getElementById('sync-actions');
  if (actions) actions.innerHTML = `
    <div class="sync-transfer-row push-action">
      <div class="sync-transfer-direction"><span>ЭТО УСТРОЙСТВО</span><i>→</i><span>СЕРВЕР</span></div>
      <div class="sync-transfer-copy"><b>Отправить</b></div>
      <div class="sync-transfer-data"><b>${hasCheck ? fmt(i.upload || 0) : '—'}</b><span>${hasCheck ? fmtB(uploadBytes) : 'проверит при запуске'}</span></div>
      <button class="btn sync-action-btn" id="sync-push-all">Отправить</button>
    </div>
    <div class="sync-transfer-row pull-action">
      <div class="sync-transfer-direction"><span>СЕРВЕР</span><i>→</i><span>ЭТО УСТРОЙСТВО</span></div>
      <div class="sync-transfer-copy"><b>Забрать</b></div>
      <div class="sync-transfer-data"><b>${hasCheck ? fmt(i.download || 0) : '—'}</b><span>${hasCheck ? fmtB(downloadBytes) : 'проверит при запуске'}</span></div>
      <button class="btn sync-action-btn secondary" id="sync-pull-all">Забрать</button>
    </div>`;
  document.getElementById('sync-push-all').onclick = () => runSyncOp('push', null);
  document.getElementById('sync-pull-all').onclick = () => runSyncOp('pull', null);

  const metrics = document.getElementById('sync-metrics');
  if (metrics) metrics.innerHTML = hasCheck ? `
    <span><b>${fmt(i.localFiles || 0)}</b> здесь</span>
    <span><b>${fmt(i.remoteFiles || 0)}</b> на сервере</span>
    <span class="${i.conflicts ? 'warn' : ''}"><b>${fmt(i.conflicts || 0)}</b> конфликтов</span>` : '';

  const renderRows = (rows) => {
    if (!rows.length) return `<div class="sync-empty">${sync.busy ? 'Считаю файлы…' : 'Нет данных'}</div>`;
    return `<div class="sync-table-head"><span>Проект / папки</span><span>Здесь</span><span>Сервер</span><span>Что изменилось</span><span></span></div>` + rows.map((p) => {
      const current = !(p.upload || p.download || p.conflicts);
      const changes = p.changes || [];
      const byFolder = {};
      changes.forEach((change) => { const parts = String(change.path || '').split('/'); const folder = parts.length > 1 ? parts[0] : '(корень)'; (byFolder[folder] ||= []).push(change); });
      const tree = Object.entries(byFolder).sort((a, b) => a[0].localeCompare(b[0], 'ru')).map(([folder, files]) => `
        <div class="sync-folder-group">
          <div class="sync-folder-head">${FOLDER_BADGE}<b>${esc(folder)}</b><span>${files.length} файлов · ${fmtB(files.reduce((n, f) => n + Number(f.bytes || 0), 0))}</span></div>
          ${files.map((f) => { const name = String(f.path || '').split('/').pop() || f.path; const dir = f.direction === 'upload' ? '↑' : f.direction === 'download' ? '↓' : '!'; return `<div class="sync-tree-file ${f.blocked ? 'blocked' : ''}">${fileBadge(name)}<div><b>${esc(name)}</b><span>${esc(f.path)}</span>${f.reason ? `<small>${esc(f.reason)}</small>` : ''}</div><em class="${f.direction}">${dir}</em><strong>${fmtB(f.bytes || 0)}</strong></div>`; }).join('')}
        </div>`).join('');
      return `<details class="sync-project-group" ${p.blocked ? 'open' : ''}>
        <summary class="sync-row">
          <div class="sync-row-name"><b>${esc(p.label || p.name)}</b><span>${esc(p.name)}${p.folders?.length ? ` · ${p.folders.length} папок с изменениями` : ''}</span></div>
          <div class="sync-count"><b>${fmt(p.localFiles || 0)}</b><span>файлов</span></div>
          <div class="sync-count"><b>${fmt(p.remoteFiles || 0)}</b><span>файлов</span></div>
          <div class="sync-row-status">${current ? '<span class="sync-ok">актуально</span>' : ''}${p.upload ? `<span class="badge up">↑ ${fmt(p.upload)} · ${fmtB(p.uploadBytes)}</span>` : ''}${p.download ? `<span class="badge down">↓ ${fmt(p.download)} · ${fmtB(p.downloadBytes)}</span>` : ''}${p.conflicts ? `<span class="badge conflict">${fmt(p.conflicts)} конфликтов</span>` : ''}${p.blocked ? `<span class="badge conflict">занято ${fmt(p.blocked)}</span>` : ''}</div>
          <div class="sync-row-actions">${p.upload ? `<button data-push="${esc(p.name)}">На сервер</button>` : ''}${p.download ? `<button data-pull="${esc(p.name)}">С сервера</button>` : ''}<i class="sync-expand">⌄</i></div>
        </summary>
        <div class="sync-tree">${tree || '<div class="sync-empty">Изменённых файлов нет</div>'}${changes.length >= 120 ? '<div class="sync-more">Показаны первые 120 изменений</div>' : ''}</div>
      </details>`;
    }).join('');
  };
  const isSystem = (p) => p.scope === 'projects' && (/^(_sync|_setup|_temp|sync-(push|pull)\.bat)$/i.test(p.name) || /(^|\/)\_archive/i.test(p.name));
  const changed = (p) => (p.upload || 0) + (p.download || 0) + (p.conflicts || 0) + (p.blocked || 0) > 0;
  const normalProjects = sync.projects.filter((p) => p.scope === 'projects' && !isSystem(p) && (sync.showAll || changed(p)));
  const systemProjects = sync.projects.filter(isSystem);
  projectsBox.innerHTML = renderRows(normalProjects);
  memoryBox.innerHTML = renderRows(sync.projects.filter((p) => p.scope !== 'projects' && (sync.showAll || changed(p))));
  const systemBox = document.getElementById('sync-system');
  const systemWrap = document.getElementById('sync-system-wrap');
  if (systemBox) systemBox.innerHTML = renderRows(systemProjects);
  if (systemWrap) systemWrap.hidden = !systemProjects.length;
  const systemCount = document.getElementById('sync-system-count'); if (systemCount) systemCount.textContent = `· ${systemProjects.length}`;
  const changedCount = sync.projects.filter((p) => (p.upload || 0) + (p.download || 0) + (p.conflicts || 0) > 0).length;
  const projectCount = document.getElementById('sync-project-count'); if (projectCount) projectCount.textContent = changedCount ? `${changedCount} требуют внимания` : 'всё актуально';
  const logCount = document.getElementById('sync-log-count'); if (logCount) logCount.textContent = sync.log.length ? String(sync.log.length) : '';
  app.querySelectorAll('[data-push]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openTransferConfirm('push', b.dataset.push); }));
  app.querySelectorAll('[data-pull]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openTransferConfirm('pull', b.dataset.pull); }));
  renderRemoteDevices(); updateSyncStage(); updateSyncLive();
}

// Иконка + цвет по типу файла (своя ФОРМА для pdf, md, фото, кода, архива и т.д. — как в VS Code)
// Белые глифы РАЗНОЙ ФОРМЫ по типу (рисуются на ярком цветном тайле). Читаются даже мелко.
const GLYPH = {
  image: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="10" r="1.7"/><path d="M21 16l-5-5L4.5 19.5"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.2v5.6l4.5-2.8z"/>',
  audio: '<path d="M9 17V6l9-1.8V15"/><circle cx="6.3" cy="17.2" r="2.4"/><circle cx="15.6" cy="15.2" r="2.4"/>',
  pdf: '<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13 3v6h6"/><path d="M8.5 13.5h5M8.5 16.5h7"/>',
  doc: '<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13 3v6h6"/><path d="M8.5 12.5h7M8.5 15.5h7M8.5 18h4"/>',
  sheet: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17M15 3.5v17"/>',
  ppt: '<rect x="3.5" y="4" width="17" height="13" rx="2"/><path d="M8 13v-4M12 13V8M16 13v-2.5M12 20.5v-3.5M8.5 20.5h7"/>',
  code: '<path d="M8.5 8 4.5 12l4 4M15.5 8l4 4-4 4M13.5 6l-3 12"/>',
  json: '<path d="M9 4a3 3 0 0 0-3 3v2.2A1.8 1.8 0 0 1 4.2 11 1.8 1.8 0 0 1 6 12.8V15a3 3 0 0 0 3 3M15 4a3 3 0 0 1 3 3v2.2A1.8 1.8 0 0 0 19.8 11 1.8 1.8 0 0 0 18 12.8V15a3 3 0 0 1-3 3"/>',
  zip: '<rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M12 3v2.2M10.4 5.2h1.6M12 5.2v2M10.4 7.2h1.6M12 7.2v2M10.4 9.2h1.6"/><rect x="10.2" y="11.4" width="3.6" height="4.2" rx="1"/>',
  md: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M6.5 15V9.5l3 3 3-3V15M17 9.5V15m0 0-2-2m2 2 2-2"/>',
  txt: '<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13 3v6h6"/><path d="M8.5 13h7M8.5 16h7M8.5 19h4"/>',
  file: '<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13 3v6h6"/>',
};
// возвращает [яркий цвет тайла, ключ глифа]
function fileMeta(name) {
  const e = (name.split('.').pop() || '').toLowerCase();
  if (/^(png|jpe?g|gif|webp|bmp|svg|ico|heic|avif|tiff)$/.test(e)) return ['#1AA251', 'image'];
  if (/^(mp4|mov|avi|mkv|webm|m4v)$/.test(e)) return ['#E0556E', 'video'];
  if (/^(mp3|wav|ogg|m4a|flac|aac)$/.test(e)) return ['#8B5CF6', 'audio'];
  if (/^pdf$/.test(e)) return ['#E5484D', 'pdf'];
  if (/^(md|mdx)$/.test(e)) return ['#2AA7C9', 'md'];
  if (/^(jsx?|mjs|cjs)$/.test(e)) return ['#E0A21A', 'code'];
  if (/^tsx?$/.test(e)) return ['#2D6FF0', 'code'];
  if (/^(py|rb|go|rs|java|c|cpp|h|cs|php|sh|bat|ps1|sql|css|scss|html|vue|svelte)$/.test(e)) return ['#0E9488', 'code'];
  if (/^(json|ya?ml|toml|ini|conf|env|xml)$/.test(e)) return ['#C98A1A', 'json'];
  if (/^(zip|rar|7z|tar|gz)$/.test(e)) return ['#7C6CE0', 'zip'];
  if (/^(xlsx?|csv)$/.test(e)) return ['#1FA463', 'sheet'];
  if (/^docx?$/.test(e)) return ['#2D6FF0', 'doc'];
  if (/^pptx?$/.test(e)) return ['#E8833A', 'ppt'];
  if (/^(txt|log|rtf)$/.test(e)) return ['#6B7280', 'txt'];
  return ['#8A8F98', 'file'];
}
function fileColor(name) { return fileMeta(name)[0]; }
// Компактная иконка (как в VS Code): тонкий глиф, окрашенный в цвет типа, без плашки
function fileBadge(name) {
  const [color, key] = fileMeta(name);
  return `<span class="ficon fmini" style="color:${color}"><svg class="fbsvg" viewBox="0 0 24 24">${GLYPH[key] || GLYPH.file}</svg></span>`;
}
// Папка — приглушённый сине-серый (как в иконках VS Code)
const FOLDER_BADGE = `<span class="ficon fmini" style="color:#519ABA"><svg class="fbsvg" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4.2a2 2 0 0 1 1.4.6L12 7h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></span>`;
const RE_TEXT = /\.(txt|md|js|jsx|ts|tsx|json|css|scss|html|xml|ya?ml|py|java|c|cpp|h|cs|go|rs|rb|php|sh|bat|ps1|env|gitignore|sql|toml|ini|conf|log|mjs|cjs|vue|svelte)$/i;
const RE_IMG = /\.(png|jpe?g|gif|webp|bmp|svg|ico|heic)$/i;
const RE_PDF = /\.pdf$/i;
// Открыть файл по-умному: текст → редактор, картинка/PDF → просмотр внутри, остальное → системное приложение
function openFileSmart(path, name) {
  if (RE_TEXT.test(name)) { termSend({ type: 'fs_read', reqId: newReq(), path }); return; }
  if (RE_IMG.test(name)) { showMediaModal(name, `<img src="${fileURL(path)}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:6px"/>`, path); return; }
  if (RE_PDF.test(name)) { showMediaModal(name, `<iframe src="${fileURL(path)}" style="width:100%;height:100%;border:none;border-radius:6px;background:#fff"></iframe>`, path); return; }
  window.arra.openFile(path); toast('Открыл', name + ' — в приложении по умолчанию', 'info');
}
function showMediaModal(title, inner, path) {
  let v = document.getElementById('mediamodal');
  if (!v) { v = document.createElement('div'); v.id = 'mediamodal'; v.className = 'mediamodal'; document.body.appendChild(v); }
  v.innerHTML = `<div class="mediacard"><div class="mediahead"><span class="b ellip" style="flex:1">${esc(title)}</span><button class="ws-mini" id="mopen" title="Открыть в системе">↗</button><button class="ws-mini" id="mclose">✕</button></div><div class="mediabody">${inner}</div></div>`;
  const close = () => v.remove();
  v.onclick = (e) => { if (e.target === v) close(); };
  document.getElementById('mclose').onclick = close;
  document.getElementById('mopen').onclick = () => window.arra.openFile(path);
}

function renderTree() {
  const box = document.getElementById('treebox');
  if (!box) return;
  const t = term.tree;
  const pathEl = document.getElementById('treepath');
  if (pathEl) { pathEl.textContent = t.drives ? 'Этот компьютер' : (t.path || ''); pathEl.title = t.path || ''; }
  let html = '';
  if (!t.drives && t.parent != null) html += `<div class="treerow up" data-up="${esc(t.parent)}">‹ наверх</div>`;
  if (!t.entries.length) html += `<div class="empty" style="padding:14px">Пусто</div>`;
  else html += t.entries.map((e) => {
    let ic;
    if (e.dir) ic = FOLDER_BADGE;
    else ic = fileBadge(e.name);
    return `<div class="treerow ${e.dir ? 'isdir' : ''}" draggable="true" data-path="${esc(e.path)}" data-dir="${e.dir ? 1 : 0}">${ic}<span class="ellip">${esc(e.name)}</span></div>`;
  }).join('');
  box.innerHTML = html;
  const upEl = box.querySelector('.treerow.up');
  if (upEl) upEl.onclick = () => termSend({ type: 'fs_list', reqId: newReq(), path: upEl.dataset.up });
  box.querySelectorAll('.treerow[data-path]').forEach((el) => {
    el.onclick = () => {
      const p = el.dataset.path;
      if (el.dataset.dir === '1') termSend({ type: 'fs_list', reqId: newReq(), path: p });
      else openFileSmart(p, el.textContent.trim());
    };
    // Перетаскивание (как в VS Code): тащим путь файла/папки в терминал — он подставится в команду
    el.ondragstart = (ev) => { ev.dataTransfer.setData('text/plain', `"${el.dataset.path}" `); ev.dataTransfer.effectAllowed = 'copy'; };
    // Правый клик — меню действий
    el.oncontextmenu = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const p = el.dataset.path; const isDir = el.dataset.dir === '1';
      const name = el.textContent.trim();
      const items = isDir ? [
        { label: 'Открыть', action: () => termSend({ type: 'fs_list', reqId: newReq(), path: p }) },
        { label: '▸ Терминал в этой папке', action: () => addTermQuick(p) },
        { sep: true },
        { label: 'Копировать путь', action: () => { window.arra.copyPath(p); toast('Скопировано', p, 'ok', 2500); } },
        { label: 'Показать в проводнике', action: () => window.arra.openPath(p) },
        { label: 'Заархивировать → в приложение', action: () => { termSend({ type: 'fs_zip', reqId: newReq(), path: p }); toast('Архивирую…', name, 'info'); } },
        { sep: true },
        { label: 'Удалить', danger: true, action: () => confirmDelete(p, name) },
      ] : [
        { label: 'Открыть в системе (блокнот и т.п.)', action: () => window.arra.openFile(p) },
        { label: 'Просмотр / редактирование здесь', action: () => openFileSmart(p, name) },
        { sep: true },
        { label: 'Копировать путь', action: () => { window.arra.copyPath(p); toast('Скопировано', p, 'ok', 2500); } },
        { label: 'Показать в проводнике', action: () => window.arra.openPath(p) },
        { label: 'Скачать в приложение', action: () => { termSend({ type: 'fs_download', reqId: newReq(), path: p }); toast('Отправляю в приложение…', name, 'info'); } },
        { sep: true },
        { label: 'Удалить', danger: true, action: () => confirmDelete(p, name) },
      ];
      showCtxMenu(ev.clientX, ev.clientY, items);
    };
  });
}

function openEditorModal() {
  const f = term.file;
  if (!f) return;
  let v = document.getElementById('editmodal');
  if (!v) { v = document.createElement('div'); v.id = 'editmodal'; v.className = 'editmodal'; document.body.appendChild(v); }
  v.innerHTML = `
    <div class="editcard">
      <div class="row"><div class="b ellip" title="${esc(f.path)}">${esc(f.path.split(/[\\/]/).pop())}</div>
        <span id="savestate" class="lbl right"></span>
        <button class="vs-mini" id="editclose" style="margin-left:10px">✕</button></div>
      <textarea id="codearea" class="codearea" ${f.editable ? '' : 'readonly'} spellcheck="false">${esc(f.content)}</textarea>
      ${f.editable ? `<button class="btn sm" id="savecode" style="margin-top:8px">Сохранить</button>` : `<div class="lbl" style="margin-top:8px">Только просмотр</div>`}`;
  document.getElementById('editclose').onclick = () => v.remove();
  const save = document.getElementById('savecode');
  if (save) save.onclick = () => {
    const content = document.getElementById('codearea').value;
    termSend({ type: 'fs_write', reqId: newReq(), path: f.path, content });
    const s = document.getElementById('savestate'); if (s) s.textContent = 'Сохраняю…';
  };
}

// ================= file receive events =================
window.arra.onFile((f) => {
  state.files.unshift(f);
  if (state.section === 'files') renderFeed();
  toast('Файл получен', `${f.name} — скопирован (${f.copied || 'путь'})`, 'ok');
});
window.arra.onStatus((s) => {
  if (!s.paired) { renderLogin(); return; }
  state.presence.status = s;
  state.presence.phone = !!s.phoneOnline;
  if (state.section && !document.querySelector('.sidebar.hidden')) renderNav();
});
window.arra.onWarn((m) => toast('Внимание', m, 'warn', 14000));
// Автообновление: показываем прогресс/готовность тостами (перезапуск предложит нативный диалог)
window.arra.onUpdate((o) => {
  if (!o) return;
  if (o.state === 'checking') setUpdateButton('checking', 'Проверяю…');
  else if (o.state === 'available') {
    setUpdateButton('downloading', `Скачиваю ${o.version || ''}…`);
    toast('Обновление', 'Найдена версия ' + (o.version || '') + ' — качаю…', 'info', 6000);
  } else if (o.state === 'progress') {
    setUpdateButton('downloading', `Скачиваю ${Math.round(o.percent || 0)}%`);
  } else if (o.state === 'none') {
    setUpdateButton('', 'Установлена последняя');
    toast('Обновление', 'Установлена последняя версия', 'ok', 3500);
    setTimeout(() => setUpdateButton('', 'Проверить обновление'), 5000);
  } else if (o.state === 'ready') {
    setUpdateButton('ready', `Готово ${o.version || ''}`);
    toast('Обновление готово', 'Версия ' + (o.version || '') + ' скачана', 'ok', 8000);
  } else if (o.state === 'error') {
    setUpdateButton('', 'Проверить обновление');
    toast('Обновление', 'Не удалось проверить: ' + (o.message || ''), 'warn', 6000);
  }
});
// Защита: дроп файла мимо терминала не должен «открывать» файл как страницу (Electron иначе уводит окно)
window.addEventListener('dragover', (e) => { e.preventDefault(); }, false);
window.addEventListener('drop', (e) => { e.preventDefault(); }, false);

// ================= boot =================
async function boot() {
  const st = await window.arra.getStatus();
  if (!st.paired || !st.hasAuth) { renderLogin(); return; }
  try { const hist = await window.arra.getHistory(); if (Array.isArray(hist)) state.files = hist; } catch {}
  await refreshPresence(false);
  renderNav();
  route();
}
boot();
setInterval(() => refreshPresence(true), 5000);
