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

function wirePty() {
  if (ptyWired) return;
  ptyWired = true;
  // вывод приходит со своим termId — пишем в нужную вкладку
  window.arra.onPtyData((p) => { if (!p) return; const x = xts[p.termId || 'L1']; if (x) x.term.write(p.data); });
  window.addEventListener('resize', () => fitLocal(activeLocal));
}
function fitLocal(termId) {
  const x = xts[termId]; if (!x) return;
  try { x.fit.fit(); window.arra.ptyResize({ cols: x.term.cols, rows: x.term.rows }, termId); } catch {}
}
function ensureXterm(termId, cwd) {
  if (xts[termId]) return xts[termId];
  const term = new Terminal({
    fontSize: 13, lineHeight: 1.0, letterSpacing: 0,
    fontFamily: 'Cascadia Code, Consolas, ui-monospace, monospace',
    cursorBlink: true, scrollback: 8000,
    theme: { background: '#0a0b0d', foreground: '#cfd3da', cursor: '#5E6AD2' },
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
  xts[termId] = { term, fit, ro: null, started: false, cwd: cwd || '' };
  return xts[termId];
}
function mountActiveTerm(host) {
  if (!host) return;
  if (typeof Terminal === 'undefined') { host.innerHTML = '<div class="empty">Терминал не загрузился</div>'; return; }
  const x = ensureXterm(activeLocal);
  host.innerHTML = '';
  if (!x.term.element) x.term.open(host); else host.appendChild(x.term.element);
  host.onclick = () => { try { x.term.focus(); } catch {} };
  // Правый клик: есть выделение → копируем; нет → вставляем (как в консоли Windows).
  host.oncontextmenu = (e) => {
    e.preventDefault();
    const sel = x.term.getSelection();
    if (sel) { window.arra.copyText(sel); x.term.clearSelection(); }
    else { window.arra.clipRead().then((t) => { if (t) window.arra.ptyInput(t, activeLocal); }).catch(() => {}); }
    try { x.term.focus(); } catch {}
  };
  // ВАЖНО: без ResizeObserver — он зацикливался с fit() (терминал бесконечно рос/мигал).
  // Подгоняем по window-resize и по таймерам при монтировании/переключении.
  const fitNow = () => { fitLocal(activeLocal); try { x.term.focus(); } catch {} };
  requestAnimationFrame(() => {
    fitNow();
    if (!x.started) {
      x.started = true;
      window.arra.ptyStart({ cols: x.term.cols || 100, rows: x.term.rows || 30, termId: activeLocal, cwd: x.cwd || undefined })
        .then(() => { window.arra.ptyResize({ cols: x.term.cols, rows: x.term.rows }, activeLocal); try { x.term.focus(); } catch {} });
    }
  });
  setTimeout(fitNow, 150);
  setTimeout(fitNow, 400);
  setTimeout(fitNow, 800);
}
function renderTermTabs() {
  const bar = document.getElementById('termtabs');
  if (!bar) return;
  bar.innerHTML = localTerms.map((id, i) =>
    `<button class="ttab ${id === activeLocal ? 'on' : ''}" data-id="${id}">${i + 1}${localTerms.length > 1 ? ` <span class="tclose" data-close="${id}">✕</span>` : ''}</button>`
  ).join('') + `<button class="ttadd" id="ttadd" title="Новый терминал в папке">＋</button>`;
  bar.querySelectorAll('.ttab').forEach((b) => (b.onclick = (e) => {
    if (e.target.dataset.close) { closeLocalTerm(e.target.dataset.close); return; }
    switchLocalTerm(b.dataset.id);
  }));
  document.getElementById('ttadd').onclick = addLocalTerm;
}
function switchLocalTerm(id) { activeLocal = id; renderTermTabs(); mountActiveTerm(document.getElementById('xterm-host')); }
async function addLocalTerm() {
  let folder = '';
  try { folder = await window.arra.chooseCodeRoot(); } catch {}
  localCounter++;
  const id = 'L' + localCounter;
  localTerms.push(id);
  ensureXterm(id, folder);
  activeLocal = id;
  renderTermTabs();
  mountActiveTerm(document.getElementById('xterm-host'));
}
function closeLocalTerm(id) {
  try { window.arra.ptyKill(id); } catch {}
  const x = xts[id];
  if (x) { try { x.ro?.disconnect(); } catch {} try { x.term.dispose(); } catch {} delete xts[id]; }
  const idx = localTerms.indexOf(id); if (idx >= 0) localTerms.splice(idx, 1);
  if (!localTerms.length) { localCounter++; const nid = 'L' + localCounter; localTerms.push(nid); activeLocal = nid; }
  else if (activeLocal === id) { activeLocal = localTerms[localTerms.length - 1]; }
  renderTermTabs();
  mountActiveTerm(document.getElementById('xterm-host'));
}

// ---- titlebar ----
document.getElementById('min').onclick = () => window.arra.winMin();
document.getElementById('close').onclick = () => window.arra.winClose();

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

// ================= NAV =================
function renderNav() {
  nav.classList.remove('hidden');
  const items = [
    ['fin', 'Финансы', NAVICON.fin],
    ['chat', 'Помощник', NAVICON.chat],
    ['term', 'Терминал', NAVICON.term],
    ['files', 'Файлы', NAVICON.files],
    ['notes', 'Заметки', NAVICON.notes],
  ];
  nav.innerHTML = items.map(([k, label, ic]) => `<button data-s="${k}" class="${state.section === k ? 'active' : ''}">${ic}<span>${label}</span></button>`).join('');
  nav.querySelectorAll('button').forEach((b) => (b.onclick = () => { state.section = b.dataset.s; renderNav(); route(); }));
}

function route() {
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
  app.innerHTML = `<h1>Финансы</h1><div id="fin-body"><div class="empty">Загрузка…</div></div>`;
  const body = document.getElementById('fin-body');
  let s, t, d;
  try {
    [s, t, d] = await Promise.all([
      api('GET', `/stats/summary?month=${monthStr()}`),
      api('GET', `/transactions?month=${monthStr()}&limit=500`),
      api('GET', '/debts'),
    ]);
  } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }

  const now = new Date();
  const isCur = state.monthDate.getFullYear() === now.getFullYear() && state.monthDate.getMonth() === now.getMonth();
  const mLabel = state.monthDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  let html = `
    <div class="monthbar">
      <button id="mprev">‹</button><span class="m">${mLabel}</span><button id="mnext" ${isCur ? 'disabled' : ''}>›</button>
    </div>
    <div class="card hero">
      <div class="grow"><div class="lbl">Потрачено</div><div class="big">${fmt(s.summary.expense)} ₽</div></div>
      <span class="pill" style="color:var(--green)">↙ ${fmt(s.summary.income)} ₽</span>
      <span class="pill" style="color:var(--red)">↗ ${fmt(s.summary.expense)} ₽</span>
    </div>`;

  if (s.byCategory?.length) {
    const max = Math.max(1, ...s.byCategory.map((c) => c.total));
    html += `<h2>По категориям</h2><div class="card gap">` + s.byCategory.slice(0, 8).map((c) => `
      <div class="row"><div class="tile">${SVG.tag}</div><div class="grow">
        <div class="row"><span class="b">${esc(c.category)}</span><span class="b right">${fmt(c.total)} ₽</span></div>
        <div class="track" style="margin-top:6px"><i style="width:${Math.max(6, (c.total / max) * 100)}%"></i></div>
      </div></div>`).join('') + `</div>`;
  }
  if (s.byMerchant?.length) {
    const max = Math.max(1, ...s.byMerchant.map((c) => c.total));
    html += `<h2>По магазинам</h2><div class="card gap">` + s.byMerchant.slice(0, 8).map((c) => `
      <div class="row"><div class="tile">${SVG.bag}</div><div class="grow">
        <div class="row"><span class="b">${esc(c.merchant)}</span><span class="b right">${fmt(c.total)} ₽</span></div>
        <div class="track" style="margin-top:6px"><i style="width:${Math.max(6, (c.total / max) * 100)}%"></i></div>
      </div></div>`).join('') + `</div>`;
  }

  html += `<h2>Операции</h2>`;
  if (!t.transactions.length) html += `<div class="empty">Пусто. Запиши через «Помощник».</div>`;
  else {
    let lastDay = '';
    for (const x of t.transactions) {
      const dl = dayLabel(x.occurred_at);
      if (dl !== lastDay) { html += `<div class="lbl" style="margin:14px 2px 8px">${dl}</div>`; lastDay = dl; }
      const time = new Date(x.occurred_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const sub = [x.merchant, x.category].filter(Boolean).join(' · ');
      html += `<div class="txrow"><div class="tile">${x.type === 'income' ? SVG.tag : SVG.tag}</div>
        <div class="grow"><div class="b ellip">${esc(x.title || x.category)}</div><div class="lbl">${esc(sub)} · ${time}</div></div>
        <span class="amount ${x.type === 'income' ? 'inc' : 'exp'}">${x.type === 'income' ? '+' : '−'}${fmt(x.amount)} ₽</span>
        <button class="copybtn tx-del" data-id="${x.id}">✕</button></div>`;
    }
  }

  if (d.debts?.length) {
    html += `<h2>Долги</h2>`;
    for (const db of d.debts) {
      const col = db.direction === 'owes_me' ? 'var(--green)' : 'var(--yellow)';
      html += `<div class="txrow"><div class="tile" style="color:${col}">${SVG.user}</div>
        <div class="grow"><div class="b">${esc(db.counterparty)}</div><div class="lbl">${db.direction === 'owes_me' ? 'должен мне' : 'я должен'}</div></div>
        <span class="b" style="color:${col}">${db.direction === 'owes_me' ? '+' : '−'}${fmt(db.amount)} ₽</span>
        <button class="copybtn debt-del" data-id="${db.id}">✕</button></div>`;
    }
  }

  body.innerHTML = html;
  document.getElementById('mprev').onclick = () => { state.monthDate = new Date(state.monthDate.getFullYear(), state.monthDate.getMonth() - 1, 1); renderFin(); };
  const mnext = document.getElementById('mnext'); if (mnext && !isCur) mnext.onclick = () => { state.monthDate = new Date(state.monthDate.getFullYear(), state.monthDate.getMonth() + 1, 1); renderFin(); };
  body.querySelectorAll('.tx-del').forEach((b) => (b.onclick = async () => { try { await api('DELETE', '/transactions/' + b.dataset.id); renderFin(); } catch {} }));
  body.querySelectorAll('.debt-del').forEach((b) => (b.onclick = async () => { try { await api('DELETE', '/debts/' + b.dataset.id); renderFin(); } catch {} }));
}

// ================= ПОМОЩНИК =================
async function renderChat() {
  app.innerHTML = `<h1>Помощник</h1><div class="chat" id="chat"><div class="empty">Загрузка…</div></div>
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
      const m = document.querySelector('main'); if (m) m.scrollTop = m.scrollHeight;
    } catch {}
  }
  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const c = document.getElementById('chat');
    c.innerHTML += `<div class="msg user">${esc(text)}</div><div class="msg ai" id="typing">…</div>`;
    const m = document.querySelector('main'); if (m) m.scrollTop = m.scrollHeight;
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
  app.innerHTML = `<h1>Файлы</h1>
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
    html += `<div class="feed-grid">` + imgs.map((f) => `<div class="imgcard" data-p="${esc(f.path)}"><img src="${fileURL(f.path)}" loading="lazy" /></div>`).join('') + `</div>`;
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
  let idx = Math.max(0, imgs.findIndex((f) => f.path === path));
  const show = () => {
    let v = document.getElementById('viewer');
    if (!v) { v = document.createElement('div'); v.id = 'viewer'; v.className = 'viewer'; document.body.appendChild(v); }
    v.innerHTML = `<button class="vnav vprev">‹</button><img src="${fileURL(imgs[idx].path)}" /><button class="vnav vnext">›</button>
      <button class="vclose">✕</button><button class="copybtn vcopy">Скопировать путь</button>`;
    v.querySelector('.vclose').onclick = () => v.remove();
    v.onclick = (e) => { if (e.target === v) v.remove(); };
    v.querySelector('.vprev').onclick = (e) => { e.stopPropagation(); idx = (idx - 1 + imgs.length) % imgs.length; show(); };
    v.querySelector('.vnext').onclick = (e) => { e.stopPropagation(); idx = (idx + 1) % imgs.length; show(); };
    v.querySelector('.vcopy').onclick = async (e) => { e.stopPropagation(); await window.arra.copyPath(imgs[idx].path); const b = v.querySelector('.vcopy'); b.textContent = 'Скопировано ✓'; b.classList.add('ok'); };
  };
  show();
}

// ================= ЗАМЕТКИ =================
async function renderNotes() {
  app.innerHTML = `<div class="row"><h1 style="margin-bottom:0">Заметки</h1><button class="btn sm right" id="newnote">+ Новая</button></div><div id="notes" style="margin-top:14px"><div class="empty">Загрузка…</div></div>`;
  document.getElementById('newnote').onclick = () => editNote(null);
  try {
    const r = await api('GET', '/notes');
    const box = document.getElementById('notes');
    if (!r.notes.length) box.innerHTML = '<div class="empty">Пусто. Нажми «+ Новая».</div>';
    else box.innerHTML = r.notes.map((n) => `<div class="note" data-id="${n.id}"><div class="nt">${esc(n.title || 'Без названия')}</div>${n.body ? `<div class="nb">${esc(n.body)}</div>` : ''}</div>`).join('');
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
    <div class="row"><h1 style="margin-bottom:0">Терминал</h1>
      <button class="btn ghost sm right" id="chroot">+ Терминал в папке</button></div>
    <div class="vscode">
      <div class="vs-left">
        <div class="vs-lhead">
          <button class="vs-mini" id="drives" title="Диски">${SVG.drive}</button>
          <span class="treepath lbl ellip" id="treepath" title="">обзор</span>
        </div>
        <div id="treebox" class="treebox"></div>
      </div>
      <div class="vs-right">
        <div class="termtabs" id="termtabs"></div>
        <div id="xterm-host" class="xterm-host"></div>
      </div>
    </div>`;
  document.getElementById('chroot').onclick = addLocalTerm;
  document.getElementById('drives').onclick = () => termSend({ type: 'fs_list', reqId: newReq(), path: '' });
  // загрузить дерево (от папки кода) и поднять терминалы
  termSend({ type: 'fs_list', reqId: newReq(), path: term.root || '' });
  renderTree();
  wirePty();
  renderTermTabs();
  mountActiveTerm(document.getElementById('xterm-host'));
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
    `<div class="treerow ${e.dir ? 'isdir' : ''}" data-path="${esc(e.path)}" data-dir="${e.dir ? 1 : 0}">${e.dir ? SVG.folder : SVG.file} ${esc(e.name)}</div>`).join('');
  box.innerHTML = html;
  const upEl = box.querySelector('.treerow.up');
  if (upEl) upEl.onclick = () => termSend({ type: 'fs_list', reqId: newReq(), path: upEl.dataset.up });
  box.querySelectorAll('.treerow[data-path]').forEach((el) => (el.onclick = () => {
    const p = el.dataset.path;
    if (el.dataset.dir === '1') termSend({ type: 'fs_list', reqId: newReq(), path: p });
    else termSend({ type: 'fs_read', reqId: newReq(), path: p });
  }));
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
window.arra.onFile((f) => { state.files.unshift(f); if (state.section === 'files') renderFeed(); });
window.arra.onStatus((s) => { if (!s.paired) renderLogin(); });

// ================= boot =================
async function boot() {
  const st = await window.arra.getStatus();
  if (!st.paired || !st.hasAuth) { renderLogin(); return; }
  try { const hist = await window.arra.getHistory(); if (Array.isArray(hist)) state.files = hist; } catch {}
  renderNav();
  route();
}
boot();
