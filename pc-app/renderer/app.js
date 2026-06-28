const app = document.getElementById('app');
const nav = document.getElementById('nav');

// ---- helpers ----
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');
const fileURL = (p) => 'file:///' + encodeURI(String(p).replace(/\\/g, '/'));
async function api(method, path, body) {
  const r = await window.arra.api(method, path, body);
  if (!r.ok) throw new Error(r.error || 'Ошибка сети');
  return r.data;
}

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
const state = { section: 'fin', files: [], monthDate: null, viewer: null };

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
  try { x.fit.fit(); window.arra.ptyResize({ cols: x.term.cols, rows: x.term.rows }, termId); } catch {}
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
    theme: { background: '#0E1014', foreground: '#D4D7DE', cursor: '#7C86F0', selectionBackground: 'rgba(124,134,240,0.35)' },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
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
    e.preventDefault();
    let text = '';
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      text = Array.from(e.dataTransfer.files).map((f) => `"${f.path}"`).join(' ') + ' ';
    } else { text = e.dataTransfer.getData('text/plain'); }
    if (text) { window.arra.ptyInput(text, id); try { x.term.focus(); } catch {} }
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
function renderTermTabs() {
  const bar = document.getElementById('termtabs');
  if (!bar) return;
  bar.innerHTML = `<button class="ttadd" id="treetoggle" title="Скрыть/показать файлы">${SVG.folder}</button>`
    + localTerms.map((id, i) => {
      const x = xts[id]; const phone = x && x.phone;
      return `<button class="ttab ${id === activeLocal ? 'on' : ''} ${phone ? 'phone' : ''}" data-id="${id}">${phone ? '📱 ' : ''}${i + 1}${localTerms.length > 1 ? ` <span class="tclose" data-close="${id}">✕</span>` : ''}</button>`;
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
    ['chat', 'Помощник', NAVICON.chat],
    ['notes', 'Заметки', NAVICON.notes],
    ['fin', 'Финансы', NAVICON.fin],
  ];
  let st = {};
  try { st = await window.arra.getStatus(); } catch {}
  nav.innerHTML =
    `<div class="side-sec">Рабочее место</div>` +
    items.map(([k, label, ic]) => `<button data-s="${k}" class="navitem ${state.section === k ? 'active' : ''}">${ic}<span>${label}</span></button>`).join('') +
    `<div class="side-spacer"></div>` +
    `<div class="side-status"><span class="dot ${st.online ? 'on' : ''}"></span><span class="ellip">${st.online ? 'Телефон на связи' : 'Не в сети'}</span></div>`;
  nav.querySelectorAll('button.navitem').forEach((b) => (b.onclick = () => { state.section = b.dataset.s; renderNav(); route(); }));
}

function route() {
  document.body.classList.toggle('term-mode', state.section === 'term');
  document.body.classList.toggle('chat-mode', state.section === 'chat');
  if (state.section === 'fin') renderFin();
  else if (state.section === 'chat') renderChat();
  else if (state.section === 'term') renderTerminal();
  else if (state.section === 'files') renderFiles();
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

  html += `<h2>Операции</h2>`;
  if (!t.transactions.length) html += `<div class="empty">Пусто. Запиши через «Помощник».</div>`;
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

  if (d.debts?.length) {
    html += `<h2>Долги</h2><div class="card" style="padding:8px">`;
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
async function renderChat() {
  app.innerHTML = `<div class="page-head"><h1>Помощник</h1></div><div class="chat" id="chat"><div class="empty">Загрузка…</div></div>
    <div class="composer"><input id="cinput" placeholder="Спроси или запиши: «купил на озоне кофе 250»" /><button class="send" id="csend">${SVG.arrow}</button></div>`;
  const input = document.getElementById('cinput');
  const sendBtn = document.getElementById('csend');
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
    else box.innerHTML = r.notes.map((n) => `<div class="note" data-id="${n.id}"><div class="nt ellip">${esc(n.title || 'Без названия')}</div>${n.body ? `<div class="nb">${esc(n.body)}</div>` : ''}</div>`).join('');
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
        <div class="termtabs" id="termtabs"></div>
        <div id="xterm-host" class="xterm-host"></div>
      </div>
    </div>`;
  document.getElementById('drives').onclick = () => termSend({ type: 'fs_list', reqId: newReq(), path: '' });
  // загрузить дерево (от папки кода) и поднять терминалы
  termSend({ type: 'fs_list', reqId: newReq(), path: term.root || '' });
  renderTree();
  wirePty();
  renderTermTabs();
  mountActiveTerm();
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
  else html += t.entries.map((e) =>
    `<div class="treerow ${e.dir ? 'isdir' : ''}" draggable="true" data-path="${esc(e.path)}" data-dir="${e.dir ? 1 : 0}">${e.dir ? SVG.folder : SVG.file}<span class="ellip">${esc(e.name)}</span></div>`).join('');
  box.innerHTML = html;
  const upEl = box.querySelector('.treerow.up');
  if (upEl) upEl.onclick = () => termSend({ type: 'fs_list', reqId: newReq(), path: upEl.dataset.up });
  box.querySelectorAll('.treerow[data-path]').forEach((el) => {
    el.onclick = () => {
      const p = el.dataset.path;
      if (el.dataset.dir === '1') termSend({ type: 'fs_list', reqId: newReq(), path: p });
      else termSend({ type: 'fs_read', reqId: newReq(), path: p });
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
        { label: 'Открыть', action: () => window.arra.openFile(p) },
        { label: 'Редактировать здесь', action: () => termSend({ type: 'fs_read', reqId: newReq(), path: p }) },
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
  if (state.section && !document.querySelector('.sidebar.hidden')) renderNav();
});

// ================= boot =================
async function boot() {
  const st = await window.arra.getStatus();
  if (!st.paired || !st.hasAuth) { renderLogin(); return; }
  try { const hist = await window.arra.getHistory(); if (Array.isArray(hist)) state.files = hist; } catch {}
  renderNav();
  route();
}
boot();
