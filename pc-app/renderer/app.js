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
function toast(title, msg, kind = 'info', ms = 5000, action = null, extraClass = '') {
  const box = document.getElementById('toasts');
  if (!box) return;
  const ico = kind === 'ok' ? '✓' : kind === 'warn' ? '!' : '↗';
  const el = document.createElement('div');
  el.className = `toast ${kind} ${extraClass}`.trim();
  el.innerHTML = `<div class="tico">${ico}</div><div class="tbody"><div class="ttitle">${esc(title)}</div>${msg ? `<div class="tmsg">${esc(msg)}</div>` : ''}</div><div class="tbar"></div>`;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const bar = el.querySelector('.tbar');
  if (bar) { bar.style.transition = `transform ${ms}ms linear`; requestAnimationFrame(() => { bar.style.transform = 'scaleX(0)'; }); }
  const kill = () => { el.classList.remove('show'); el.classList.add('hide'); setTimeout(() => el.remove(), 350); };
  let timer = setTimeout(kill, ms);
  el.onclick = () => { if (typeof action === 'function') action(); kill(); };
  el.onmouseenter = () => clearTimeout(timer);
  el.onmouseleave = () => { timer = setTimeout(kill, 1400); };
  return el;
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

// Иконки разделов — те же плитки, что в веб-версии (сгенерированы Codex)
const NAVICON = Object.fromEntries(
  [['fin', 'finance'], ['chat', 'assistant'], ['files', 'files'], ['notes', 'notes'],
   ['term', 'terminal'], ['sync', 'transfer'], ['remote', 'remote']]
    .map(([key, file]) => [key, `<span class="glyph"><img src="assets/tabs/${file}.png" alt=""></span>`]),
);
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
  presenceSignature: '',
};

const remoteDesktop = {
  deviceId: null, running: false, screens: [], activeScreen: null,
  frame: null, frameW: 16, frameH: 9, frameQueued: false, lastFrameAt: 0,
  moveAt: 0, uiAt: 0, error: '',
};

function deviceRole(device, currentId, currentRole, deviceCount) {
  if (['laptop', 'pc', 'server'].includes(device.role)) return device.role;
  if (device.id === currentId) return currentRole || 'pc';
  const name = String(device.name || '').toLowerCase();
  if (/сервер|server|rack|host/.test(name)) return 'server';
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
    const nextPresence = {
      phone: !!status.phoneOnline,
      laptop: devices.some((device) => device.role === 'laptop' && device.online),
      pc: devices.some((device) => device.role === 'pc' && device.online),
      devices,
      currentId: status.deviceId || null,
      status,
    };
    const signature = JSON.stringify({
      phone: nextPresence.phone, laptop: nextPresence.laptop, pc: nextPresence.pc,
      currentId: nextPresence.currentId,
      devices: devices.map((device) => [device.id, device.role, !!device.online]),
      role: status.deviceProfile?.role || '',
    });
    const changed = signature !== state.presenceSignature;
    state.presence = nextPresence;
    state.presenceSignature = signature;
    if (redraw && changed) {
      renderNav();
      if (state.section === 'sync') renderSyncV2Body();
      if (state.section === 'remote') updateRemoteDeviceUi();
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
let renamingTermId = null;
const AGENT_LABELS = { codex: 'Codex', claude: 'Claude' };
const AGENT_STATE_LABELS = { idle: 'готов', starting: 'запускается', working: 'работает', waiting: 'ждёт ответа', done: 'завершил', error: 'ошибка' };
let agentSoundEnabled = localStorage.getItem('noda-agent-sound') !== 'off';
let agentAudioContext = null;

// Ошибкой считаем только явный аварийный результат. Раньше сюда попадали слова
// «ошибка», «лимит» и т. п. из запроса самого пользователя, который Codex
// перерисовывает внутри TUI.
const AGENT_ERROR_RE = /(?:^|\n)\s*(?:■\s*)?(?:error|fatal|panic)(?:\[[^\]]+\])?\s*:\s*\S|(?:api request failed|rate limit exceeded|too many requests|context (?:window|length).*(?:exceeded|too large)|network error|connection (?:failed|lost)|econn(?:reset|refused)|etimedout|enotfound|unauthorized|forbidden|internal server error|stream disconnected|\[код выхода [1-9])/im;
const AGENT_QUESTION_RE = /(?:do you want|would you like|shall i|approval required|allow (?:this|the )?command|press enter to confirm|choose (?:an|one)|select (?:an|one)|\[[Yy]\/\s*[Nn]\]|\([Yy]\/\s*[Nn]\)|разрешить|подтвердить|продолжить\?|выберите|нужен.{0,24}ответ|требуется.{0,24}подтверждение)/i;
const AGENT_DONE_RE = /(?:worked for \d|task (?:completed|finished)|completed successfully|all done|задача завершена|работа завершена|готово[.!]?\s*$|waiting for (?:your )?(?:input|instructions)|what (?:would you like|can i)|how can i help)/im;
const AGENT_PROMPT_RE = /(?:^|\n)\s*[›❯]\s*[^\n]{0,180}(?:$|\n)|(?:^|\n)\s*PS [^>\n]{0,180}>\s*$/m;

function plainTerminalText(value) {
  return String(value || '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1bP[\s\S]*?\x1b\\/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

function visibleTerminalText(x) {
  try {
    const buffer = x?.term?.buffer?.active;
    if (!buffer) return '';
    const from = Math.max(0, buffer.length - (x.term.rows || 30) - 2);
    const lines = [];
    for (let i = from; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.join('\n');
  } catch { return ''; }
}

function readAgentMetrics(text) {
  const clean = plainTerminalText(text);
  const lines = clean.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const statusLine = [...lines].reverse().find((line) => /\bweekly\s+\d+%\s+left\b/i.test(line) || /\bcontext\s+\d+%\s+left\b/i.test(line));
  if (!statusLine) return null;
  const model = statusLine.match(/\b((?:gpt|o\d|claude)[\w.-]*(?:\s+(?:low|medium|high|xhigh|max|ultra))?)/i)?.[1] || '';
  const weekly = statusLine.match(/\bweekly\s+(\d+%)\s+left\b/i)?.[1] || '';
  const context = statusLine.match(/\bcontext\s+(\d+%)\s+left\b/i)?.[1] || '';
  const used = statusLine.match(/\b([\d.]+[KMB]?)\s+used\b/i)?.[1] || '';
  return { model, weekly, context, used };
}

function updateAgentMetrics(termId, text) {
  const x = xts[termId]; if (!x) return;
  const next = readAgentMetrics(text);
  if (!next) return;
  const signature = JSON.stringify(next);
  if (signature === x.agentMetricsSignature) return;
  x.agentMetrics = next;
  x.agentMetricsSignature = signature;
  if (termId === activeLocal && document.getElementById('termtabs')) renderTermTabs();
}

function agentTopic(text) {
  const clean = plainTerminalText(text)
    .replace(/^(?:пожалуйста|please|можешь|can you)\s+/i, '')
    .replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const words = clean.split(' ').slice(0, 5).join(' ');
  return words.length > 34 ? words.slice(0, 33).trimEnd() + '…' : words;
}

function playAgentTone(kind = 'done') {
  if (!agentSoundEnabled || !window.AudioContext) return;
  try {
    agentAudioContext ||= new AudioContext();
    const now = agentAudioContext.currentTime;
    const gain = agentAudioContext.createGain();
    const first = agentAudioContext.createOscillator();
    const second = agentAudioContext.createOscillator();
    const tones = kind === 'error' ? [196, 155] : kind === 'waiting' ? [392, 523] : [440, 659];
    first.frequency.value = tones[0]; second.frequency.value = tones[1];
    first.type = second.type = 'sine';
    first.connect(gain); second.connect(gain); gain.connect(agentAudioContext.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    first.start(now); first.stop(now + 0.22);
    second.start(now + 0.09); second.stop(now + 0.34);
  } catch {}
}

async function activateAgentTerminal(termId) {
  if (!localTerms.includes(termId)) return;
  if (state.section !== 'term') {
    state.section = 'term';
    await renderNav();
    await route();
  }
  switchLocalTerm(termId);
  requestAnimationFrame(() => document.getElementById('terminal-command')?.focus());
}

function notifyAgentState(termId, stateName, detail = '') {
  const x = xts[termId];
  if (!x || x.intentionalClose) return;
  const now = Date.now();
  const noticeKey = `${stateName}:${detail}`;
  if (x.lastAgentNotice === noticeKey && now - (x.lastAgentNoticeAt || 0) < 10000) return;
  x.lastAgentNotice = noticeKey; x.lastAgentNoticeAt = now;
  const tab = termTabLabel(termId).name;
  const kind = stateName === 'error' ? 'warn' : stateName === 'done' ? 'ok' : 'info';
  const title = stateName === 'waiting' ? `${tab} ждёт ответа` : stateName === 'error' ? `${tab}: ошибка` : `${tab} завершил работу`;
  const message = detail || (stateName === 'waiting' ? 'Нужно подтверждение или ответ' : stateName === 'error' ? 'Проверь вывод агента' : 'Результат готов');
  toast(title, message, kind, 2800, () => activateAgentTerminal(termId), 'agent-toast');
  const nativePayload = { termId, kind: stateName, title, body: message };
  const request = window.arra.notifyAgent ? window.arra.notifyAgent(nativePayload) : Promise.resolve({ native: false });
  Promise.resolve(request).then((result) => { if (!result?.native) playAgentTone(stateName); }).catch(() => playAgentTone(stateName));
}

function setAgentState(termId, next, detail = '', notify = false) {
  const x = xts[termId]; if (!x) return;
  x.agentState = next;
  if (next === 'working' || next === 'starting') x.lastAgentNotice = '';
  if (document.getElementById('termtabs')) renderTermTabs();
  updateTerminalComposer();
  updateTerminalTurnBar();
  if (notify) notifyAgentState(termId, next, detail);
}

function setAgentKind(termId, kind, topic = '') {
  const x = xts[termId]; if (!x || !AGENT_LABELS[kind]) return;
  x.agentKind = kind;
  x.agentState = 'starting';
  x.agentBuffer = '';
  x.agentSubmittedAt = 0;
  if (!x.nameCustom) {
    const base = topic || String(x.cwd || term.root || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'сессия';
    x.name = `${AGENT_LABELS[kind]} · ${base}`;
  }
  if (document.getElementById('termtabs')) renderTermTabs();
  document.querySelector(`[data-pane="${termId}"]`)?.classList.add('agent-ui');
  updateTerminalComposer();
}

function beginAgentWork(termId, prompt) {
  const x = xts[termId]; if (!x || !x.agentKind) return;
  x.agentBuffer = '';
  x.agentSubmittedAt = Date.now();
  x.lastPrompt = String(prompt || '').trim();
  if (!x.nameCustom) {
    const topic = agentTopic(prompt);
    if (topic) x.name = `${AGENT_LABELS[x.agentKind]} · ${topic}`;
  }
  setAgentState(termId, 'working');
}

function handleAgentSubmission(termId, value) {
  const x = xts[termId]; if (!x) return;
  const command = String(value || '').trim();
  if (!command) return;
  const launch = command.match(/^(codex|claude)(?:\s|$)/i);
  if (launch) { setAgentKind(termId, launch[1].toLowerCase()); return; }
  if (x.agentKind) beginAgentWork(termId, command);
}

function trackTerminalInput(termId, data) {
  const x = xts[termId]; if (!x) return;
  if (data === '\r' || data === '\n') {
    const value = x.userInputBuffer || '';
    x.userInputBuffer = '';
    handleAgentSubmission(termId, value);
    return;
  }
  if (data === '\x7f') { x.userInputBuffer = (x.userInputBuffer || '').slice(0, -1); return; }
  if (/^[\x20-\x7e\u0400-\u04ff]+$/.test(data)) x.userInputBuffer = (x.userInputBuffer || '') + data;
}

function inspectAgentOutput(termId, data) {
  const x = xts[termId]; if (!x || !x.agentKind) return;
  const clean = plainTerminalText(data);
  if (!clean) return;
  x.agentBuffer = ((x.agentBuffer || '') + clean).slice(-6000);
  updateAgentMetrics(termId, x.agentBuffer);
  clearTimeout(x.agentInspectTimer);
  x.agentInspectTimer = setTimeout(() => {
    const current = xts[termId]; if (!current) return;
    const screen = visibleTerminalText(current);
    const tail = ((screen && screen.trim()) ? screen : (current.agentBuffer || '')).slice(-4200);
    const promptVisible = AGENT_PROMPT_RE.test(tail);
    if (current.agentState === 'starting' && promptVisible) {
      setAgentState(termId, 'idle');
    } else if (['working', 'waiting', 'error'].includes(current.agentState) && Date.now() - (current.agentSubmittedAt || 0) > 1000 && AGENT_QUESTION_RE.test(tail)) {
      setAgentState(termId, 'waiting', 'Нужно подтверждение или ответ', true);
    } else if (['working', 'waiting', 'error'].includes(current.agentState) && Date.now() - (current.agentSubmittedAt || 0) > 1000 && (AGENT_DONE_RE.test(tail) || promptVisible)) {
      if (AGENT_ERROR_RE.test(tail)) {
        const line = tail.split('\n').map((part) => part.trim()).filter((part) => AGENT_ERROR_RE.test(`\n${part}`)).pop() || 'Агент остановился с ошибкой';
        setAgentState(termId, 'error', line.slice(0, 150), true);
        return;
      }
      setAgentState(termId, 'done', 'Результат готов — нажми, чтобы открыть сессию', true);
    }
  }, 1180);
}

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
    x.term.write(p.data, () => inspectAgentOutput(id, p.data));
  });
  window.arra.onPtyExit && window.arra.onPtyExit((p) => {
    if (!p) return;
    const id = p.termId; const x = xts[id];
    if (x?.agentKind && !x.intentionalClose) {
      if (Number(p.exitCode || 0) === 0) setAgentState(id, 'done', 'Сессия завершена', true);
      else setAgentState(id, 'error', `Процесс завершился с кодом ${p.exitCode}`, true);
    }
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
    // FitAddon уже учитывает реальный размер контейнера. Дополнительный ручной resize
    // заставлял полноэкранные TUI перерисовываться дважды и визуально «ронял» курсор.
    x.fit.fit();
    window.arra.ptyResize({ cols: x.term.cols, rows: x.term.rows }, termId);
    const metrics = document.getElementById('terminal-metrics');
    if (metrics && termId === activeLocal) metrics.textContent = `${x.term.cols} × ${x.term.rows}`;
  } catch {}
}
// Точная подгонка терминала под контейнер при любом изменении размера (ресайз окна, сворачивание панели).
// Безопасно от зацикливания: host растягивается флексом (его размер НЕ зависит от содержимого терминала),
// поэтому fit() не меняет размер host → новый вызов observer не триггерится.
let hostRO = null;
let hostFitTimer = null;
function observeHost(host) {
  if (!window.ResizeObserver) return;
  if (hostRO) { try { hostRO.disconnect(); } catch {} }
  let lw = 0, lh = 0;
  hostRO = new ResizeObserver(() => {
    const r = host.getBoundingClientRect();
    if (Math.abs(r.width - lw) < 2 && Math.abs(r.height - lh) < 2) return;
    lw = r.width; lh = r.height;
    clearTimeout(hostFitTimer);
    hostFitTimer = setTimeout(() => fitLocal(activeLocal), 84);
  });
  hostRO.observe(host);
}
function ensureXterm(termId, cwd) {
  if (xts[termId]) return xts[termId];
  const term = new Terminal({
    fontSize: 13.5, lineHeight: 1.22, letterSpacing: 0,
    fontFamily: 'Cascadia Code, Consolas, ui-monospace, monospace',
    fontWeight: '400', fontWeightBold: '600',
    cursorBlink: false, cursorStyle: 'bar', cursorWidth: 2, cursorInactiveStyle: 'none',
    scrollback: 10000, scrollOnUserInput: false, smoothScrollDuration: 0,
    drawBoldTextInBrightColors: false, minimumContrastRatio: 3,
    theme: XTERM_THEMES[curTheme()],
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  // Шрифт Cascadia Code может догрузиться ПОСЛЕ первого fit() — ячейка станет шире,
  // и правый столбец начнёт резаться. Как только шрифты готовы — перемеряем.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { try { term.clearTextureAtlas?.(); } catch {} fitLocal(termId); });
  term.onData((d) => { trackTerminalInput(termId, d); window.arra.ptyInput(d, termId); });
  // Копирование/вставка как в консоли Windows:
  //  • Ctrl+C — копирует выделенное; без выделения уходит обычный ^C (прерывание).
  //  • Ctrl+Shift+C — всегда копировать выделенное.
  //  • Ctrl+V / Ctrl+Shift+V — вставить из буфера.
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    const k = (e.key || '').toLowerCase();
    if (state.section === 'term' && e.key === 'F2') {
      e.preventDefault(); e.stopPropagation(); beginRenameTerm(termId); return false;
    }
    if (state.section === 'term' && e.ctrlKey && e.shiftKey && k === 't') {
      e.preventDefault(); e.stopPropagation(); addTermQuick(); return false;
    }
    if (state.section === 'term' && e.ctrlKey && e.shiftKey && k === 'e') {
      e.preventDefault(); e.stopPropagation(); toggleTerminalExplorer(); return false;
    }
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
    // Windows-поведение для Codex/Claude: Ctrl+Backspace удаляет слово слева.
    // В терминальных приложениях это стандартный управляющий символ Ctrl+W.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && k === 'backspace') {
      window.arra.ptyInput('\x17', termId);
      return false;
    }
    return true;
  });
  xts[termId] = {
    term, fit, opened: false, started: false, cwd: cwd || '', name: '', nameCustom: false,
    agentKind: '', agentState: 'idle', agentBuffer: '', agentSubmittedAt: 0,
    agentMetrics: null, agentMetricsSignature: '', lastPrompt: '',
    userInputBuffer: '', draft: '', commandHistory: [], commandHistoryIndex: -1,
  };
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
    pane.classList.toggle('agent-ui', !!x.agentKind);
    pane.style.display = id === activeLocal ? 'block' : 'none';
  }
  // удалить панели закрытых вкладок
  host.querySelectorAll('.xterm-pane').forEach((p) => { if (!localTerms.includes(p.dataset.pane)) p.remove(); });
  const x = xts[activeLocal];
  if (!x) return;
  const fitNow = () => fitLocal(activeLocal);
  requestAnimationFrame(() => {
    fitNow();
    if (!x.started) {
      x.started = true;
      window.arra.ptyStart({ cols: x.term.cols || 100, rows: x.term.rows || 30, termId: activeLocal, cwd: x.cwd || undefined })
        .then(() => { window.arra.ptyResize({ cols: x.term.cols, rows: x.term.rows }, activeLocal); });
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
  return { name: x?.name || base || `PowerShell ${id.replace(/^L/, '')}`, path: p };
}
function beginRenameTerm(id) {
  if (!xts[id]) return;
  renamingTermId = id;
  renderTermTabs();
  requestAnimationFrame(() => {
    const input = document.querySelector(`.term-rename[data-id="${id}"]`);
    if (input) { input.focus(); input.select(); }
  });
}
function finishRenameTerm(id, value, cancel = false) {
  if (!cancel && xts[id]) {
    xts[id].name = String(value || '').trim().slice(0, 48);
    xts[id].nameCustom = !!xts[id].name;
  }
  renamingTermId = null;
  renderTermTabs();
}
function toggleTerminalExplorer(force) {
  panelCollapsed = force == null ? !panelCollapsed : !!force;
  document.querySelector('.workspace')?.classList.toggle('ws-collapsed', panelCollapsed);
  renderTermTabs();
  requestAnimationFrame(() => fitLocal(activeLocal));
  setTimeout(() => fitLocal(activeLocal), 170);
}
function renderAgentLauncher(kind, image) {
  const x = xts[activeLocal];
  const active = x?.agentKind === kind;
  const stateName = active ? (x.agentState || 'idle') : '';
  const status = stateName ? AGENT_STATE_LABELS[stateName] : '';
  const label = AGENT_LABELS[kind];
  return `<button class="term-preset ${kind}${active ? ' agent-active' : ''}" data-agent-state="${stateName}" id="start-${kind}" title="${active ? `${label} · ${status}` : `Запустить ${label} в текущей папке`}">
    <span class="agent-preset-icon"><img src="${image}" alt="">${active ? `<i class="agent-preset-dot ${stateName}"></i>` : ''}</span>
    <span class="agent-preset-copy"><b>${label}</b>${active ? `<small>${esc(status)}</small>` : ''}</span>
  </button>`;
}
function renderAgentMetrics(x) {
  const metrics = x?.agentMetrics;
  if (!metrics || !x?.agentKind) return '';
  return `<div class="agent-metrics" aria-label="Лимиты активного агента">
    ${metrics.model ? `<span class="agent-metric model" title="Модель"><b>${esc(metrics.model)}</b></span>` : ''}
    ${metrics.weekly ? `<span class="agent-metric" title="Недельный лимит"><small>неделя</small><b>${esc(metrics.weekly)}</b></span>` : ''}
    ${metrics.context ? `<span class="agent-metric" title="Контекст"><small>контекст</small><b>${esc(metrics.context)}</b></span>` : ''}
    ${metrics.used ? `<span class="agent-metric optional" title="Использовано токенов"><small>исп.</small><b>${esc(metrics.used)}</b></span>` : ''}
  </div>`;
}
function renderTermTabs() {
  const bar = document.getElementById('termtabs');
  if (!bar) return;
  const tabs = localTerms.map((id) => {
    const x = xts[id]; const phone = x && x.phone;
    const t = termTabLabel(id);
    const agentState = x?.agentKind ? (x.agentState || 'idle') : '';
    const stateLabel = agentState ? AGENT_STATE_LABELS[agentState] : '';
    const label = renamingTermId === id
      ? `<input class="term-rename" data-id="${id}" value="${esc(t.name)}" maxlength="48" aria-label="Имя терминала">`
      : `<span class="tname">${esc(t.name)}</span>`;
    const marker = agentState ? `<span class="agent-tab-state ${agentState}" title="${esc(stateLabel)}"></span>` : phone ? '<span class="tphone">●</span>' : TERM_TAB_ICON;
    return `<div class="ttab ${id === activeLocal ? 'on' : ''} ${phone ? 'phone' : ''} ${agentState ? `agent-${agentState}` : ''}" data-id="${id}" role="tab" tabindex="0" aria-selected="${id === activeLocal}" title="${esc(t.path || t.name)}${stateLabel ? ` · ${esc(stateLabel)}` : ''} — двойной щелчок для переименования">${marker}${label}<button class="tclose" data-close="${id}" title="Закрыть терминал" aria-label="Закрыть ${esc(t.name)}">×</button></div>`;
  }).join('');
  const zen = document.body.classList.contains('term-zen');
  const activeX = xts[activeLocal];
  bar.innerHTML = `
    <button class="term-tool" id="term-navtoggle" title="${document.body.classList.contains('nav-collapsed') ? 'Показать' : 'Скрыть'} навигацию" aria-label="${document.body.classList.contains('nav-collapsed') ? 'Показать' : 'Скрыть'} навигацию"><svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="17" height="16" rx="2"></rect><path d="M9 4v16"></path></svg></button>
    <button class="term-tool" id="treetoggle" title="${panelCollapsed ? 'Показать' : 'Скрыть'} проводник (Ctrl+Shift+E)" aria-label="${panelCollapsed ? 'Показать' : 'Скрыть'} проводник">${SVG.folder}</button>
    <div class="terminal-tabstrip" role="tablist" aria-label="Терминалы">${tabs}<button class="term-tool tab-add" id="ttadd" title="Новый терминал (Ctrl+Shift+T)" aria-label="Новый терминал">＋</button></div>
    <span class="terminal-divider"></span>
    ${renderAgentLauncher('codex', 'assets/merchants/openai.png')}
    ${renderAgentLauncher('claude', 'assets/merchants/anthropic.png')}
    ${renderAgentMetrics(activeX)}
    <button class="term-tool" id="termzen" title="${zen ? 'Выйти из полноэкранного режима' : 'Терминал на весь экран'}" aria-label="${zen ? 'Выйти из полноэкранного режима' : 'Терминал на весь экран'}">${zen ? '⤡' : '⤢'}</button>
  `;
  bar.querySelectorAll('.ttab').forEach((tab) => {
    tab.onclick = (e) => {
      if (e.target.closest('.term-rename, .tclose')) return;
      switchLocalTerm(tab.dataset.id);
    };
    tab.ondblclick = (e) => { if (!e.target.closest('.tclose')) beginRenameTerm(tab.dataset.id); };
    tab.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      showCtxMenu(e.clientX, e.clientY, [
        { label: 'Переименовать', action: () => beginRenameTerm(tab.dataset.id) },
        { sep: true },
        { label: 'Закрыть терминал', danger: localTerms.length === 1, action: () => closeLocalTerm(tab.dataset.id) },
      ]);
    };
    tab.onkeydown = (e) => {
      if (e.target.matches('.term-rename')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchLocalTerm(tab.dataset.id); }
      if (e.key === 'F2') { e.preventDefault(); beginRenameTerm(tab.dataset.id); }
    };
  });
  bar.querySelectorAll('.tclose').forEach((button) => {
    button.onclick = (e) => { e.preventDefault(); e.stopPropagation(); closeLocalTerm(button.dataset.close); };
  });
  const rename = bar.querySelector('.term-rename');
  if (rename) {
    rename.onclick = (e) => e.stopPropagation();
    rename.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finishRenameTerm(rename.dataset.id, rename.value); }
      if (e.key === 'Escape') { e.preventDefault(); finishRenameTerm(rename.dataset.id, rename.value, true); }
    };
    rename.onblur = () => { if (renamingTermId === rename.dataset.id) finishRenameTerm(rename.dataset.id, rename.value); };
  }
  document.getElementById('ttadd').onclick = () => addTermQuick();
  document.getElementById('termzen').onclick = () => toggleTermZen();
  document.getElementById('term-navtoggle').onclick = () => { toggleAppNavigation(); renderTermTabs(); };
  document.getElementById('start-codex').onclick = () => launchTerminalPreset('codex --yolo');
  document.getElementById('start-claude').onclick = () => launchTerminalPreset('claude --dangerously-skip-permissions');
  document.getElementById('treetoggle').onclick = () => toggleTerminalExplorer();
  updateTerminalTurnBar();
}
/** Терминал во весь экран: прячем боковые панели и лаунчбар. Esc — выйти. */
function toggleTermZen(force) {
  const on = force != null ? force : !document.body.classList.contains('term-zen');
  document.body.classList.toggle('term-zen', on);
  renderTermTabs();
  requestAnimationFrame(() => fitLocal(activeLocal));
  setTimeout(() => fitLocal(activeLocal), 180);
}
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('term-zen')) toggleTermZen(false);
});

function switchLocalTerm(id) {
  const current = xts[activeLocal];
  const input = document.getElementById('terminal-command');
  if (current && input) current.draft = input.value;
  activeLocal = id;
  renderTermTabs();
  mountActiveTerm();
  updateTerminalComposer();
  updateTerminalTurnBar();
  requestAnimationFrame(() => document.getElementById('terminal-command')?.focus());
}
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
  const x = xts[id];
  if (x) x.intentionalClose = true;
  try { window.arra.ptyKill(id); } catch {}
  if (x) { try { x.ro?.disconnect(); } catch {} try { x.term.dispose(); } catch {} delete xts[id]; }
  const idx = localTerms.indexOf(id); if (idx >= 0) localTerms.splice(idx, 1);
  if (!localTerms.length) { localCounter++; const nid = 'L' + localCounter; localTerms.push(nid); activeLocal = nid; }
  else if (activeLocal === id) { activeLocal = localTerms[localTerms.length - 1]; }
  renderTermTabs();
  mountActiveTerm();
}

const SOUND_ON_ICON = '<svg viewBox="0 0 24 24"><path d="M5 10v4h4l5 4V6L9 10H5z"></path><path d="M17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"></path></svg>';
const SOUND_OFF_ICON = '<svg viewBox="0 0 24 24"><path d="M5 10v4h4l5 4V6L9 10H5z"></path><path d="M18 10l4 4M22 10l-4 4"></path></svg>';
const terminalVoice = {
  phase: 'idle', detail: '', active: false, stopRequested: false, stream: null,
  recorder: null, chunkTimer: null, queue: Promise.resolve(), termId: null,
};
function resizeTerminalComposer(input, collapse = false) {
  if (!input) return;
  if (collapse) input.style.removeProperty('height');
  if (!CSS.supports?.('field-sizing', 'content')) {
    const before = Math.round(input.getBoundingClientRect().height);
    input.style.height = 'auto';
    const next = Math.min(320, Math.max(38, input.scrollHeight));
    if (Math.abs(before - next) > 1) input.style.height = `${next}px`;
  }
  const x = xts[activeLocal];
  const height = Math.round(input.getBoundingClientRect().height);
  if (x && x.composerHeight !== height) {
    x.composerHeight = height;
  }
}

function updateTerminalVoiceUi() {
  const button = document.getElementById('terminal-voice');
  const status = document.getElementById('terminal-voice-status');
  if (!button || !status) return;
  button.className = `composer-tool terminal-voice ${terminalVoice.phase}`;
  button.setAttribute('aria-pressed', terminalVoice.active ? 'true' : 'false');
  button.title = terminalVoice.active ? 'Остановить диктовку' : 'Локальная диктовка Whisper';
  status.hidden = terminalVoice.phase === 'idle' && !terminalVoice.detail;
  status.textContent = terminalVoice.detail || '';
}

function setTerminalVoicePhase(phase, detail = '') {
  terminalVoice.phase = phase;
  terminalVoice.detail = detail;
  updateTerminalVoiceUi();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function voiceBlobToWavBase64(blob) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioCtx();
  try {
    const decoded = await audioContext.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const frames = Math.max(1, Math.ceil(decoded.duration * 16000));
    const offline = new OfflineAudioContext(1, frames, 16000);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    const wav = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(wav);
    const text = (offset, value) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE');
    text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i += 1) {
      const value = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    }
    return arrayBufferToBase64(wav);
  } finally {
    audioContext.close().catch(() => {});
  }
}

function appendTerminalVoiceText(termId, text) {
  const x = xts[termId];
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!x || !clean) return;
  x.draft = `${x.draft || ''}${x.draft?.trim() ? ' ' : ''}${clean}`;
  const input = termId === activeLocal ? document.getElementById('terminal-command') : null;
  if (input) {
    input.value = x.draft;
    resizeTerminalComposer(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function queueTerminalVoiceBlob(blob, termId) {
  if (!blob?.size) return terminalVoice.queue;
  terminalVoice.queue = terminalVoice.queue.then(async () => {
    setTerminalVoicePhase(terminalVoice.active ? 'listening' : 'transcribing', terminalVoice.active ? 'Слушаю · распознаю фрагмент…' : 'Распознаю…');
    const wav = await voiceBlobToWavBase64(blob);
    const result = await window.arra.localVoiceTranscribe(wav);
    if (result?.ok) appendTerminalVoiceText(termId, result.text);
    else if (!result?.busy) throw new Error(result?.error || 'Whisper не распознал фрагмент');
  }).catch((error) => {
    setTerminalVoicePhase('error', error.message);
    toast('Диктовка', error.message, 'warn', 5000);
  });
  return terminalVoice.queue;
}

function finishTerminalVoice() {
  clearTimeout(terminalVoice.chunkTimer);
  terminalVoice.chunkTimer = null;
  try { terminalVoice.stream?.getTracks().forEach((track) => track.stop()); } catch {}
  terminalVoice.stream = null;
  terminalVoice.recorder = null;
  terminalVoice.active = false;
  terminalVoice.stopRequested = false;
  terminalVoice.termId = null;
  setTerminalVoicePhase('idle', '');
}

function recordTerminalVoiceChunk() {
  if (!terminalVoice.active || !terminalVoice.stream) return;
  const chunks = [];
  const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : undefined;
  const recorder = new MediaRecorder(terminalVoice.stream, options);
  terminalVoice.recorder = recorder;
  recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
  recorder.onstop = () => {
    clearTimeout(terminalVoice.chunkTimer);
    terminalVoice.chunkTimer = null;
    terminalVoice.recorder = null;
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    const pending = queueTerminalVoiceBlob(blob, terminalVoice.termId);
    if (terminalVoice.active && !terminalVoice.stopRequested) recordTerminalVoiceChunk();
    else pending.finally(finishTerminalVoice);
  };
  recorder.start();
  terminalVoice.chunkTimer = setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop();
  }, 4200);
}

async function startTerminalVoice() {
  if (terminalVoice.active || terminalVoice.phase === 'preparing') return;
  terminalVoice.termId = activeLocal;
  setTerminalVoicePhase('preparing', 'Проверяю локальный Whisper…');
  let status = await window.arra.localVoiceStatus();
  if (!status?.ready) {
    setTerminalVoicePhase('preparing', 'Загрузка Whisper · 0%');
    toast('Локальная диктовка', 'Один раз загружаю модель Whisper small · 181 МБ', 'info', 5000);
    status = await window.arra.localVoicePrepare();
  }
  if (!status?.ready) throw new Error(status?.error || 'Не удалось подготовить локальный Whisper');
  terminalVoice.stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  terminalVoice.active = true;
  terminalVoice.stopRequested = false;
  terminalVoice.queue = Promise.resolve();
  setTerminalVoicePhase('listening', 'Слушаю · текст появится здесь');
  recordTerminalVoiceChunk();
}

function stopTerminalVoice() {
  if (!terminalVoice.active) return;
  terminalVoice.active = false;
  terminalVoice.stopRequested = true;
  setTerminalVoicePhase('transcribing', 'Дописываю последнюю фразу…');
  clearTimeout(terminalVoice.chunkTimer);
  if (terminalVoice.recorder?.state === 'recording') terminalVoice.recorder.stop();
  else terminalVoice.queue.finally(finishTerminalVoice);
}

window.arra.onLocalVoiceProgress?.((payload) => {
  if (!payload) return;
  if (payload.phase === 'downloading') setTerminalVoicePhase('preparing', `Загрузка Whisper · ${Math.round(payload.percent || 0)}%`);
  else if (payload.phase === 'ready') setTerminalVoicePhase('preparing', 'Whisper готов');
  else if (payload.phase === 'error') setTerminalVoicePhase('error', payload.message || 'Ошибка загрузки Whisper');
});

function updateTerminalTurnBar() {
  const bar = document.getElementById('terminal-turnbar');
  const x = xts[activeLocal];
  if (!bar || !x?.lastPrompt) {
    if (bar) bar.hidden = true;
    return;
  }
  const agent = AGENT_LABELS[x.agentKind] || 'Терминал';
  const stateName = x.agentState || 'idle';
  const activity = stateName === 'working' || stateName === 'starting'
    ? `${agent} пишет`
    : stateName === 'waiting' ? `${agent} ждёт ответа`
      : stateName === 'error' ? `${agent} остановился`
        : stateName === 'done' ? `${agent} ответил` : `${agent} готов`;
  bar.hidden = false;
  bar.className = `terminal-turnbar ${stateName}`;
  bar.innerHTML = `<span class="turn-who">Вы</span><span class="turn-text" title="${esc(x.lastPrompt)}">${esc(x.lastPrompt)}</span><span class="turn-activity"><i></i>${esc(activity)}</span>`;
}

function updateTerminalComposer() {
  const input = document.getElementById('terminal-command');
  const meta = document.getElementById('terminal-agent-meta');
  const label = document.getElementById('terminal-agent-label');
  const sound = document.getElementById('agent-sound');
  const x = xts[activeLocal];
  if (!input || !x) return;
  const stateName = x.agentKind ? (x.agentState || 'idle') : 'idle';
  input.value = x.draft || '';
  input.placeholder = x.agentKind ? `Сообщение для ${AGENT_LABELS[x.agentKind]}…` : 'Команда PowerShell или сообщение агенту…';
  if (meta) meta.className = `terminal-agent-meta ${stateName}`;
  if (label) label.textContent = x.agentKind ? `${AGENT_LABELS[x.agentKind]} · ${AGENT_STATE_LABELS[stateName]}` : 'PowerShell · готов';
  if (sound) {
    sound.innerHTML = agentSoundEnabled ? SOUND_ON_ICON : SOUND_OFF_ICON;
    sound.classList.toggle('muted', !agentSoundEnabled);
    sound.title = agentSoundEnabled ? 'Выключить звук уведомлений' : 'Включить звук уведомлений';
  }
  resizeTerminalComposer(input);
  updateTerminalVoiceUi();
  updateTerminalTurnBar();
}

function sendTerminalComposer() {
  const input = document.getElementById('terminal-command');
  const x = xts[activeLocal];
  if (!input || !x) return;
  const value = input.value.trim();
  if (!value) return;
  x.commandHistory.push(value);
  if (x.commandHistory.length > 80) x.commandHistory.shift();
  x.commandHistoryIndex = x.commandHistory.length;
  x.draft = '';
  handleAgentSubmission(activeLocal, value);
  const normalized = value.replace(/\r?\n/g, '\r');
  const payload = value.includes('\n') ? `\x1b[200~${normalized}\x1b[201~` : normalized;
  const targetTerm = activeLocal;
  window.arra.ptyInput(payload, targetTerm);
  setTimeout(() => window.arra.ptyInput('\r', targetTerm), 28);
  input.value = '';
  resizeTerminalComposer(input, true);
  renderTermTabs();
  updateTerminalComposer();
  input.focus();
}

function wireTerminalComposer() {
  const form = document.getElementById('terminal-composer');
  const input = document.getElementById('terminal-command');
  const sound = document.getElementById('agent-sound');
  const voice = document.getElementById('terminal-voice');
  if (!form || !input) return;
  form.onsubmit = (event) => { event.preventDefault(); sendTerminalComposer(); };
  input.oninput = () => {
    const x = xts[activeLocal]; if (x) x.draft = input.value;
    resizeTerminalComposer(input);
  };
  input.onkeydown = (event) => {
    const x = xts[activeLocal];
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault(); sendTerminalComposer(); return;
    }
    if (event.key === 'F2') { event.preventDefault(); beginRenameTerm(activeLocal); return; }
    if (!x || !x.commandHistory.length) return;
    const browsingHistory = x.commandHistoryIndex >= 0 && x.commandHistoryIndex < x.commandHistory.length;
    if (input.value && !browsingHistory) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      x.commandHistoryIndex = Math.max(0, (x.commandHistoryIndex < 0 ? x.commandHistory.length : x.commandHistoryIndex) - 1);
      input.value = x.commandHistory[x.commandHistoryIndex] || '';
      x.draft = input.value; resizeTerminalComposer(input);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      x.commandHistoryIndex = Math.min(x.commandHistory.length, x.commandHistoryIndex + 1);
      input.value = x.commandHistoryIndex >= x.commandHistory.length ? '' : (x.commandHistory[x.commandHistoryIndex] || '');
      x.draft = input.value; resizeTerminalComposer(input);
    }
  };
  if (sound) sound.onclick = () => {
    agentSoundEnabled = !agentSoundEnabled;
    localStorage.setItem('noda-agent-sound', agentSoundEnabled ? 'on' : 'off');
    updateTerminalComposer();
    if (agentSoundEnabled) playAgentTone('done');
  };
  if (voice) voice.onclick = async () => {
    if (terminalVoice.active) { stopTerminalVoice(); return; }
    try { await startTerminalVoice(); }
    catch (error) {
      finishTerminalVoice();
      setTerminalVoicePhase('error', error.message);
      toast('Диктовка', error.message.includes('Permission') ? 'Нет доступа к микрофону' : error.message, 'warn', 6000);
    }
  };
  const x = xts[activeLocal];
  if (x?.composerRO) { try { x.composerRO.disconnect(); } catch {} }
  if (x && window.ResizeObserver) {
    x.composerRO = new ResizeObserver(() => {
      const height = Math.round(input.getBoundingClientRect().height);
      if (x.composerHeight !== height) x.composerHeight = height;
    });
    x.composerRO.observe(input);
  }
}

// ---- titlebar ----
document.getElementById('min').onclick = () => window.arra.winMin();
document.getElementById('max').onclick = () => window.arra.winMax();
document.getElementById('close').onclick = () => window.arra.winClose();
let updateUiState = '';
let updateUiLabel = 'Проверить обновление';
let appVersionCache = '';
let appVersionRequest = null;
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
// Десктоп использует тот же светлый визуальный язык, что и основная веб-версия.
// Старую локально сохранённую тёмную тему больше не восстанавливаем.
const XTERM_THEMES = {
  light: {
    background: '#0D0F12', foreground: '#D7DAE0', cursor: '#F1F2F4', cursorAccent: '#0D0F12',
    selectionBackground: 'rgba(140, 151, 168, .34)', selectionForeground: '#FFFFFF',
    black: '#20242A', red: '#E06C75', green: '#98C379', yellow: '#D6B46B',
    blue: '#73A9E6', magenta: '#C58ACB', cyan: '#63B3B1', white: '#D7DAE0',
    brightBlack: '#68707D', brightRed: '#EE818A', brightGreen: '#ADD58C', brightYellow: '#E4C77E',
    brightBlue: '#8DBBF0', brightMagenta: '#D9A0DE', brightCyan: '#7BC8C4', brightWhite: '#F1F2F4',
  },
  dark: {
    background: '#0D0F12', foreground: '#D7DAE0', cursor: '#F1F2F4', cursorAccent: '#0D0F12',
    selectionBackground: 'rgba(140, 151, 168, .34)', selectionForeground: '#FFFFFF',
    black: '#20242A', red: '#E06C75', green: '#98C379', yellow: '#D6B46B',
    blue: '#73A9E6', magenta: '#C58ACB', cyan: '#63B3B1', white: '#D7DAE0',
    brightBlack: '#68707D', brightRed: '#EE818A', brightGreen: '#ADD58C', brightYellow: '#E4C77E',
    brightBlue: '#8DBBF0', brightMagenta: '#D9A0DE', brightCyan: '#7BC8C4', brightWhite: '#F1F2F4',
  },
};
function curTheme() { return document.body.dataset.theme === 'dark' ? 'dark' : 'light'; }
function applyTheme() {
  delete document.body.dataset.theme;
  try { localStorage.setItem('arra-theme', 'light'); } catch {}
  // перекрасить уже открытые терминалы
  for (const id in xts) { try { xts[id].term.options.theme = XTERM_THEMES[curTheme()]; } catch {} }
  const b = document.getElementById('themebtn');
  if (b) b.title = 'Тема Noda';
}
const themeButton = document.getElementById('themebtn');
if (themeButton) themeButton.remove();
applyTheme();
try {
  const savedNavState = localStorage.getItem('noda-nav-collapsed');
  document.body.classList.toggle('nav-collapsed', savedNavState == null ? true : savedNavState === '1');
} catch { document.body.classList.add('nav-collapsed'); }
// Скрыть/показать глобальную навигацию. В терминале та же команда доступна в его toolbar.
function toggleAppNavigation(force) {
  const collapsed = force == null ? !document.body.classList.contains('nav-collapsed') : !!force;
  document.body.classList.toggle('nav-collapsed', collapsed);
  try { localStorage.setItem('noda-nav-collapsed', collapsed ? '1' : '0'); } catch {}
  document.getElementById('side-brand-toggle')?.setAttribute('aria-expanded', String(!collapsed));
  if (state.section === 'term') { requestAnimationFrame(() => fitLocal(activeLocal)); setTimeout(() => fitLocal(activeLocal), 290); }
}
document.getElementById('navtoggle').onclick = toggleAppNavigation;

// ================= LOGIN =================
function renderLogin() {
  nav.classList.add('hidden');
  app.innerHTML = `
    <div class="center">
      <div class="card gap login-card">
        <span class="login-mark"><img src="../icon.png" alt=""></span>
        <h1>Noda</h1>
        <p class="login-sub">Финансы, заметки и компьютер — в одном месте</p>
        <label class="field"><span>Логин</span><input id="login" type="text" autocomplete="username" /></label>
        <label class="field"><span>Пароль</span><input id="password" type="password" autocomplete="current-password" /></label>
        <label class="field"><span>Имя компьютера</span><input id="device" type="text" placeholder="Определится автоматически" /></label>
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
  const deviceName = document.getElementById('device').value.trim();
  const err = document.getElementById('err');
  const btn = document.getElementById('connect');
  if (!login || !password) { err.textContent = 'Введи логин и пароль'; return; }
  btn.disabled = true; btn.textContent = 'Подключаю…'; err.textContent = '';
  const r = await window.arra.login({ login, password, deviceName });
  if (!r.ok) { err.textContent = r.error || 'Не удалось подключить'; btn.disabled = false; btn.textContent = 'Подключить'; return; }
  boot();
}

// ================= NAV (боковая, десктоп) =================
function renderNav() {
  nav.classList.remove('hidden');
  const items = [
    ['fin', 'Финансы', NAVICON.fin],
    ['chat', 'Помощник', NAVICON.chat],
    ['notes', 'Заметки', NAVICON.notes],
    ['files', 'Файлы', NAVICON.files],
    ['sync', 'Передача', NAVICON.sync],
    ['remote', 'Удалённый ПК', NAVICON.remote],
    ['term', 'Терминал', NAVICON.term],
  ];
  const st = state.presence.status || {};
  const currentRole = st.deviceProfile?.role;
  nav.style.setProperty('--active-index', String(Math.max(0, items.findIndex(([key]) => key === state.section))));
  nav.innerHTML =
    `<button class="side-brand" id="side-brand-toggle" type="button" title="${document.body.classList.contains('nav-collapsed') ? 'Развернуть' : 'Свернуть'} навигацию" aria-label="${document.body.classList.contains('nav-collapsed') ? 'Развернуть' : 'Свернуть'} навигацию" aria-expanded="${!document.body.classList.contains('nav-collapsed')}">
      <img src="assets/noda.png" alt="">
      <div><b>Noda</b><small>рабочий контур</small></div>
    </button>` +
    items.map(([k, label, ic]) => `<button data-s="${k}" class="navitem ${state.section === k ? 'active' : ''}" title="${label}" aria-label="${label}">${ic}<span>${label}</span></button>`).join('') +
    `<div class="side-spacer"></div>` +
    `<button class="side-update ${esc(updateUiState)}" id="side-update" type="button"><span>↻</span><b>${esc(updateUiLabel)}</b><small>${esc(appVersionCache)}</small></button>` +
    `<div class="side-presence">
      <div><span class="dot ${state.presence.phone ? 'on' : ''}"></span><span>Телефон</span><small>${state.presence.phone ? 'в сети' : 'не в сети'}</small></div>
      <div><span class="dot ${state.presence.laptop ? 'on' : ''}"></span><span>Ноутбук</span><small>${currentRole === 'laptop' ? 'это устройство' : (state.presence.laptop ? 'в сети' : 'не в сети')}</small></div>
      <div><span class="dot ${state.presence.pc ? 'on' : ''}"></span><span>ПК</span><small>${currentRole === 'pc' ? 'это устройство' : (state.presence.pc ? 'в сети' : 'не в сети')}</small></div>
    </div>`;
  nav.querySelectorAll('button.navitem').forEach((b) => (b.onclick = () => { state.section = b.dataset.s; renderNav(); route(); }));
  document.getElementById('side-brand-toggle').onclick = () => toggleAppNavigation();
  const su = document.getElementById('side-update');
  if (su) su.onclick = triggerUpdateCheck;
  if (!appVersionCache && !appVersionRequest) {
    appVersionRequest = window.arra.appVersion().then((version) => {
      appVersionCache = String(version || '');
      const target = document.querySelector('#side-update small');
      if (target) target.textContent = appVersionCache;
    }).catch(() => {}).finally(() => { appVersionRequest = null; });
  }
}

let lastRoutedSection = '';
function route() {
  if (state.section !== 'remote' && remoteDesktop.running) stopRemoteDesktop();
  if (state.section !== 'term' && terminalVoice.active) stopTerminalVoice();
  document.body.classList.toggle('term-mode', state.section === 'term');
  document.body.classList.toggle('chat-mode', state.section === 'chat');
  document.body.classList.toggle('notes-mode', state.section === 'notes');
  document.body.classList.toggle('remote-mode', state.section === 'remote');
  document.body.classList.toggle('sync-mode', state.section === 'sync');
  if (lastRoutedSection !== state.section) {
    app.classList.remove('section-enter');
    void app.offsetWidth;
    app.classList.add('section-enter');
    clearTimeout(route.animationTimer);
    route.animationTimer = setTimeout(() => app.classList.remove('section-enter'), 280);
    lastRoutedSection = state.section;
  }
  if (state.section === 'fin') return renderFin();
  if (state.section === 'chat') return renderChat();
  if (state.section === 'term') return renderTerminal();
  if (state.section === 'files') return renderFiles();
  if (state.section === 'sync') return renderSyncV2();
  if (state.section === 'remote') return renderRemoteDesktop();
  if (state.section === 'notes') return renderNotes();
}

// ================= УДАЛЁННЫЙ ПК =================
function availableRemoteDevices() {
  return state.presence.devices.filter((device) => device.id !== state.presence.currentId);
}

function selectedRemoteDevice() {
  const devices = availableRemoteDevices();
  return devices.find((device) => device.id === remoteDesktop.deviceId)
    || devices.find((device) => device.online)
    || devices[0]
    || null;
}

async function sendRemoteDesktop(message) {
  const device = selectedRemoteDevice();
  if (!device) return { ok: false, error: 'Другой компьютер не найден' };
  remoteDesktop.deviceId = device.id;
  const result = await window.arra.remoteScreenSend(device.id, message);
  if (!result?.ok) {
    remoteDesktop.error = result?.error || 'Команда не отправлена';
    updateRemoteDeviceUi();
  }
  return result;
}

async function startRemoteDesktop() {
  const device = selectedRemoteDevice();
  if (!device?.online) { remoteDesktop.error = 'Выбранный компьютер не в сети'; updateRemoteDeviceUi(); return; }
  remoteDesktop.deviceId = device.id;
  remoteDesktop.error = '';
  remoteDesktop.running = true;
  remoteDesktop.lastFrameAt = 0;
  updateRemoteDeviceUi();
  await sendRemoteDesktop({ type: 'screen_start', displayId: remoteDesktop.activeScreen || undefined, fps: 15, quality: 68, width: 1680 });
  await sendRemoteDesktop({ type: 'screen_list' });
}

async function stopRemoteDesktop() {
  if (remoteDesktop.deviceId) await window.arra.remoteScreenSend(remoteDesktop.deviceId, { type: 'screen_stop' });
  remoteDesktop.running = false;
  remoteDesktop.frame = null;
  remoteDesktop.lastFrameAt = 0;
  updateRemoteDeviceUi();
}

async function switchRemoteScreen(displayId) {
  remoteDesktop.activeScreen = String(displayId);
  await sendRemoteDesktop({ type: 'screen_switch', displayId: remoteDesktop.activeScreen });
  renderRemoteScreenButtons();
}

function fitRemoteCanvas() {
  const stage = document.getElementById('remote-stage');
  const canvas = document.getElementById('remote-canvas');
  if (!stage || !canvas) return;
  const maxW = Math.max(1, stage.clientWidth - 24);
  const maxH = Math.max(1, stage.clientHeight - 24);
  const ratio = Math.max(0.2, remoteDesktop.frameW / Math.max(1, remoteDesktop.frameH));
  let width = maxW;
  let height = width / ratio;
  if (height > maxH) { height = maxH; width = height * ratio; }
  canvas.style.width = `${Math.round(width)}px`;
  canvas.style.height = `${Math.round(height)}px`;
}

function drawRemoteFrame() {
  remoteDesktop.frameQueued = false;
  const frame = remoteDesktop.frame;
  const canvas = document.getElementById('remote-canvas');
  if (!frame || !canvas || state.section !== 'remote') return;
  const image = new Image();
  image.onload = () => {
    const width = remoteDesktop.frameW || image.naturalWidth || 16;
    const height = remoteDesktop.frameH || image.naturalHeight || 9;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    canvas.getContext('2d', { alpha: false })?.drawImage(image, 0, 0, width, height);
    fitRemoteCanvas();
    const hint = document.getElementById('remote-stage-hint'); if (hint) hint.hidden = true;
  };
  image.src = `data:image/jpeg;base64,${frame}`;
}

function queueRemoteFrame(data, width, height) {
  remoteDesktop.frame = data;
  remoteDesktop.frameW = Number(width) || remoteDesktop.frameW;
  remoteDesktop.frameH = Number(height) || remoteDesktop.frameH;
  remoteDesktop.lastFrameAt = Date.now();
  if (!remoteDesktop.frameQueued) {
    remoteDesktop.frameQueued = true;
    requestAnimationFrame(drawRemoteFrame);
  }
  if (remoteDesktop.lastFrameAt - remoteDesktop.uiAt > 1000) {
    remoteDesktop.uiAt = remoteDesktop.lastFrameAt;
    updateRemoteDeviceUi();
  }
}

function handleRemoteDesktopEvent(message) {
  if (!message) return;
  if (message.sourceDeviceId && remoteDesktop.deviceId && message.sourceDeviceId !== remoteDesktop.deviceId) return;
  if (message.type === 'screen_frame' && message.data) {
    remoteDesktop.running = true;
    queueRemoteFrame(message.data, message.w, message.h);
  } else if (message.type === 'screens') {
    remoteDesktop.screens = message.screens || [];
    remoteDesktop.activeScreen = remoteDesktop.activeScreen
      || remoteDesktop.screens.find((screen) => screen.primary)?.id
      || remoteDesktop.screens[0]?.id
      || null;
    renderRemoteScreenButtons();
  } else if (message.type === 'pc_offline') {
    remoteDesktop.running = false;
    remoteDesktop.error = 'Компьютер отключился';
    updateRemoteDeviceUi();
  }
}

window.arra.onRemoteScreenEvent?.(handleRemoteDesktopEvent);

function remotePoint(event) {
  const canvas = document.getElementById('remote-canvas');
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    nx: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
    ny: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
  };
}

function wireRemoteCanvas() {
  const canvas = document.getElementById('remote-canvas');
  if (!canvas) return;
  canvas.onpointerdown = (event) => {
    canvas.focus();
    if (event.button !== 0) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    const point = remotePoint(event); if (point) sendRemoteDesktop({ type: 'screen_input', action: 'down', ...point });
  };
  canvas.onpointermove = (event) => {
    const now = Date.now(); if (now - remoteDesktop.moveAt < 28) return;
    remoteDesktop.moveAt = now;
    const point = remotePoint(event); if (point) sendRemoteDesktop({ type: 'screen_input', action: 'move', ...point });
  };
  canvas.onpointerup = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const point = remotePoint(event); if (point) sendRemoteDesktop({ type: 'screen_input', action: 'up', ...point });
  };
  canvas.oncontextmenu = (event) => {
    event.preventDefault();
    const point = remotePoint(event); if (point) sendRemoteDesktop({ type: 'screen_input', action: 'click', button: 'right', ...point });
  };
  canvas.onwheel = (event) => {
    event.preventDefault();
    const point = remotePoint(event); if (point) sendRemoteDesktop({ type: 'screen_input', action: 'scroll', dy: event.deltaY > 0 ? -120 : 120, ...point });
  };
  canvas.onkeydown = (event) => {
    const map = { Enter: 'enter', Backspace: 'backspace', Escape: 'esc', Tab: 'tab', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Delete: 'delete', Home: 'home', End: 'end', ' ': 'space' };
    const key = map[event.key];
    if (key) {
      event.preventDefault();
      sendRemoteDesktop({ type: 'screen_input', action: 'key', key });
    } else if (event.key.length === 1) {
      event.preventDefault();
      if (event.ctrlKey || event.altKey || event.metaKey) {
        sendRemoteDesktop({ type: 'screen_input', action: 'key', key: event.key, ctrl: event.ctrlKey || event.metaKey, alt: event.altKey, shift: event.shiftKey });
      } else {
        sendRemoteDesktop({ type: 'screen_input', action: 'key', text: event.key });
      }
    }
  };
  new ResizeObserver(fitRemoteCanvas).observe(document.getElementById('remote-stage'));
}

function renderRemoteScreenButtons() {
  const box = document.getElementById('remote-monitors');
  if (!box) return;
  box.innerHTML = remoteDesktop.screens.map((screen, index) => `<button data-display="${esc(screen.id)}" class="${String(screen.id) === String(remoteDesktop.activeScreen) ? 'active' : ''}">${screen.primary ? 'Основной' : `Монитор ${index + 1}`}<small>${screen.width || ''}${screen.width ? '×' : ''}${screen.height || ''}</small></button>`).join('');
  box.querySelectorAll('[data-display]').forEach((button) => { button.onclick = () => switchRemoteScreen(button.dataset.display); });
}

function updateRemoteDeviceUi() {
  const device = selectedRemoteDevice();
  if (!remoteDesktop.deviceId && device) remoteDesktop.deviceId = device.id;
  const select = document.getElementById('remote-device');
  if (select) {
    const devices = availableRemoteDevices();
    const value = remoteDesktop.deviceId;
    select.innerHTML = devices.map((item) => `<option value="${esc(item.id)}">${esc(item.name || (item.role === 'laptop' ? 'Ноутбук' : 'ПК'))}${item.online ? ' · в сети' : ' · офлайн'}</option>`).join('');
    if (value && devices.some((item) => item.id === value)) select.value = value;
  }
  const current = selectedRemoteDevice();
  const hint = document.getElementById('remote-stage-hint');
  const canvas = document.getElementById('remote-canvas');
  const stage = document.getElementById('remote-stage');
  if (hint) hint.hidden = !!remoteDesktop.frame;
  if (hint && !remoteDesktop.frame) {
    hint.innerHTML = `<i class="remote-empty-icon">${syncDeviceGlyph(current?.role === 'laptop' ? 'laptop' : 'pc')}</i>
      <b>${current ? (current.online ? 'Готов к подключению' : 'Устройство сейчас не в сети') : 'Другой компьютер не найден'}</b>
      <span>${current ? (current.online ? 'Подключись — экран появится здесь. Мышь, клавиатура и прокрутка работают прямо в окне.' : 'Открой Noda на этом устройстве. Подключение станет доступно автоматически, когда оно появится в сети.') : 'Открой Noda на другом устройстве и войди под тем же аккаунтом.'}</span>`;
  }
  if (canvas) canvas.classList.toggle('has-frame', !!remoteDesktop.frame);
  if (stage) {
    stage.classList.toggle('device-online', !!current?.online);
    stage.classList.toggle('device-offline', !current?.online);
    stage.classList.toggle('streaming', !!remoteDesktop.frame);
  }
  const status = document.getElementById('remote-status');
  const action = document.getElementById('remote-connect');
  if (status) {
    const frameAge = remoteDesktop.lastFrameAt ? Math.max(0, Math.round((Date.now() - remoteDesktop.lastFrameAt) / 1000)) : null;
    status.textContent = remoteDesktop.error || (remoteDesktop.running
      ? (frameAge != null && frameAge > 4 ? `Жду кадры · ${frameAge} с` : 'Удалённое управление активно')
      : (current?.online ? 'Готов к подключению' : 'Устройство не в сети'));
    status.className = remoteDesktop.error ? 'sub bad' : 'sub';
  }
  if (action) {
    action.textContent = remoteDesktop.running ? 'Отключиться' : 'Подключиться';
    action.disabled = !remoteDesktop.running && !current?.online;
    action.className = remoteDesktop.running ? 'btn ghost sm' : 'btn sm';
  }
}

function renderRemoteDesktop() {
  const device = selectedRemoteDevice();
  const devices = availableRemoteDevices();
  if (!remoteDesktop.deviceId && device) remoteDesktop.deviceId = device.id;
  const label = (item) => (item.role === 'laptop' ? 'Ноутбук' : item.role === 'phone' ? 'Телефон' : 'Компьютер') + (item.online ? '' : ' · не в сети');
  app.innerHTML = `
    <div class="page-head">
      <h1>Удалённый ПК</h1>
      <div class="sub" id="remote-status">Готов к подключению</div>
      <div class="grow"></div>
      <div class="seg" id="remote-devices">
        ${devices.length ? devices.map((item) => `<button data-device="${esc(item.id)}" class="${String(item.id) === String(remoteDesktop.deviceId) ? 'active' : ''}">${esc(label(item))}</button>`).join('')
          : '<button class="active">устройств нет</button>'}
      </div>
      <div id="remote-monitors" class="remote-monitors"></div>
      <button class="btn sm" id="remote-connect">Подключиться</button>
    </div>
    <div class="remote-stage full ${device?.online ? 'device-online' : 'device-offline'}" id="remote-stage">
      <canvas id="remote-canvas" tabindex="0"></canvas>
      <div id="remote-stage-hint" class="remote-stage-hint">
        <i class="remote-empty-icon">${syncDeviceGlyph(device?.role === 'laptop' ? 'laptop' : 'pc')}</i>
        <b>${device ? (device.online ? 'Готов к подключению' : 'Устройство сейчас не в сети') : 'Другой компьютер не найден'}</b>
        <span>${device ? (device.online ? 'Подключись — экран появится здесь. Мышь, клавиатура и прокрутка работают прямо в окне.' : 'Открой Noda на этом устройстве. Подключение станет доступно автоматически, когда оно появится в сети.') : 'Открой Noda на другом устройстве и войди под тем же аккаунтом.'}</span>
      </div>
    </div>`;

  app.querySelectorAll('#remote-devices [data-device]').forEach((button) => button.onclick = async () => {
    if (String(button.dataset.device) === String(remoteDesktop.deviceId)) return;
    if (remoteDesktop.running) await stopRemoteDesktop();
    remoteDesktop.deviceId = button.dataset.device;
    remoteDesktop.screens = [];
    remoteDesktop.activeScreen = null;
    remoteDesktop.error = '';
    renderRemoteDesktop();
  });
  document.getElementById('remote-connect').onclick = () => remoteDesktop.running ? stopRemoteDesktop() : startRemoteDesktop();
  wireRemoteCanvas();
  renderRemoteScreenButtons();
  updateRemoteDeviceUi();
  if (remoteDesktop.frame) drawRemoteFrame();
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
/** Иконка записи: логотип бренда, если узнали, иначе цветная плитка по смыслу траты. */
function financeDebtIcon(debt, purposeText) {
  const value = `${debt?.counterparty || ''} ${purposeText || ''}`.toLowerCase();
  const brands = [
    [/белка|belka/, 'belkacar'], [/сити\s?драйв|city\s?drive|citydrive/, 'citydrive'],
    [/делимоб/, 'delimobil'], [/яндекс\s?драйв/, 'yandexdrive'],
    [/озон|ozon/, 'ozon'], [/wildberries|вайлдбер/, 'wildberries'],
    [/openai|chat\s?gpt/, 'openai'], [/яндекс\s?еда/, 'yandexeda'],
    [/самокат/, 'samokat'], [/вкусвилл/, 'vkusvill'], [/пятёрочка|пятерочка/, 'pyaterochka'],
    [/магнит/, 'magnit'], [/перекрёсток|перекресток/, 'perekrestok'],
  ];
  const brand = brands.find(([pattern]) => pattern.test(value));
  if (/каршер/.test(value) && !brand) {
    return '<div class="finance-brand-stack"><img src="assets/merchants/citydrive.ico" alt=""><img src="assets/merchants/delimobil.png" alt=""><img src="assets/merchants/belkacar.png" alt=""></div>';
  }
  if (brand) return `<div class="finance-brand-icon"><img src="assets/merchants/${brand[1]}.png" alt="" onerror="this.parentElement.style.display='none'"></div>`;

  // цвет и глиф по смыслу — как в веб-версии
  const kinds = [
    [/каршер|такси|парков|бензин|заправ/, '#5AC8FA', '<path d="M5 16h14M6.5 16V11l1.6-4h7.8l1.6 4v5"/><circle cx="8" cy="17.5" r="1.5"/><circle cx="16" cy="17.5" r="1.5"/>'],
    [/достав|курьер|посылк/, '#AF52DE', '<path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>'],
    [/ингредиент|напит|кофе|еда|продукт|обед|кафе/, '#FF9500', '<path d="M5 3v8M9 3v8M5 7h4M7 11v10M16 3v18M16 3c4 2 4 8 0 10"/>'],
    [/печат|фото|бумаг|канцел/, '#30B0C7', '<rect x="6" y="3" width="12" height="6" rx="1"/><rect x="4" y="9" width="16" height="7" rx="2"/><rect x="7" y="14" width="10" height="7" rx="1"/>'],
    [/подпис|сервис|облак|api|тариф/, '#5E5CE6', '<path d="M7 17a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.4A3.5 3.5 0 0 1 17.5 17z"/>'],
    [/баланс|пополн|перевод|карта|счёт|счет/, '#34C759', '<rect x="2.5" y="5.5" width="19" height="13" rx="3"/><path d="M2.5 10h19M6 15h3"/>'],
    [/аптек|лекарст|бад|витамин|здоров/, '#FF3B30', '<path d="M12 5v14M5 12h14"/>'],
  ];
  const found = kinds.find(([pattern]) => pattern.test(value));
  const [, color, path] = found || [null, '#8E939E', '<path d="M4 7h16v12H4zM8 4h8v3M8 11h8M8 15h5"/>'];
  return `<div class="finance-picto" style="--picto:${color}"><svg viewBox="0 0 24 24">${path}</svg></div>`;
}

// ================= ФИНАНСЫ (тот же вид, что в веб-версии) =================

const FIN_PEOPLE = ['Тима', 'Даня', 'Женя'];
const FIN_CARS = [
  { name: 'Ситидрайв', icon: 'citydrive' },
  { name: 'Делимобиль', icon: 'delimobil' },
  { name: 'BelkaCar', icon: 'belkacar' },
  { name: 'Яндекс Драйв', icon: 'yandexdrive' },
];
const finPerson = (d) => (String(d.note || '').match(/\[(Тима|Даня|Женя)\]/) || [])[1] || 'Тима';
const normalizeFinanceText = (value) => String(value || '')
  .replace(/(^|[\s(])зон(?=$|[\s).,])/giu, '$1Ozon')
  .replace(/(^|[\s(])zone(?=$|[\s).,])/giu, '$1Ozon')
  .replace(/пополнение баланса озон/giu, 'Пополнение баланса Ozon');
const normalizeFinanceCounterparty = (value) => {
  const normalized = normalizeFinanceText(value).trim();
  return /^(belka\s*car|белка\s*кар|белкакар)$/i.test(normalized) ? 'BelkaCar' : normalized;
};
const finPurpose = (d) => normalizeFinanceText(String(d.note || '').replace(/\[(Тима|Даня|Женя)\]\s*/g, '')).trim();
const finDate = (d) => new Date(d.occurred_at || d.created_at || Date.now());
const finPlural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};
const finStartOfDay = (v) => { const x = new Date(v); x.setHours(0, 0, 0, 0); return x; };
const finStartOfWeek = (v) => { const x = finStartOfDay(v); x.setDate(x.getDate() - ((x.getDay() || 7) - 1)); return x; };
const finSum = (list) => list.reduce((acc, d) => acc + Number(d.amount || 0), 0);

function finRange() {
  const anchor = state.finAnchor || new Date();
  if (state.finPeriod === 'month') {
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    return { from, to: new Date(from.getFullYear(), from.getMonth() + 1, 1) };
  }
  const from = finStartOfWeek(anchor);
  const to = new Date(from); to.setDate(from.getDate() + 7);
  return { from, to };
}

function finPeriodTitle() {
  const { from, to } = finRange();
  if (state.finPeriod === 'month') {
    const label = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(from);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const last = new Date(to.getTime() - 86400000);
  const same = from.getMonth() === last.getMonth();
  const left = new Intl.DateTimeFormat('ru-RU', same ? { day: 'numeric' } : { day: 'numeric', month: 'short' }).format(from);
  const right = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(last);
  return `${left} — ${right}`;
}

function finDayTitle(value) {
  const date = finStartOfDay(value);
  const today = finStartOfDay(new Date());
  const diff = Math.round((today - date) / 86400000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  const withYear = date.getFullYear() !== today.getFullYear();
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}) }).format(date);
}

/* Периоды — необязательный фильтр. По умолчанию всегда «Всё»: заходишь и
   видишь всю историю, как в банке, а не срез за текущий месяц. */
const FIN_SPANS = [
  { id: 'all', label: 'Всё' },
  { id: 'month', label: 'Месяц' },
  { id: 'week', label: 'Неделя' },
  { id: 'year', label: 'Год' },
];

function finSpanFrom(span) {
  const now = new Date();
  if (span === 'week') return finStartOfWeek(now);
  if (span === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (span === 'year') return new Date(now.getFullYear(), 0, 1);
  return null;
}

async function renderFin() {
  app.innerHTML = '<div class="empty">Загружаю…</div>';
  let result;
  try { result = await api('GET', '/debts?all=true'); }
  catch (e) { app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const all = result.debts || [];
  state.debtList = all.filter((d) => d.direction !== 'i_owe' && Number(d.amount) > 0);
  state.myDebts = all.filter((d) => d.direction === 'i_owe' && !d.settled && Number(d.amount) > 0);
  state.finView = state.finView || localStorage.getItem('noda_pc_fin_view') || 'period';
  state.finSpan = state.finSpan || 'all';
  finDraw();
}

function finDraw() {
  const span = state.finSpan || 'all';
  const from = finSpanFrom(span);
  const sorted = state.debtList.slice().sort((a, b) => finDate(b) - finDate(a));
  const allRows = from ? sorted.filter((d) => finDate(d) >= from) : sorted;
  const returned = allRows.filter((d) => d.settled);
  const unpaid = allRows.filter((d) => !d.settled);
  const total = finSum(unpaid);
  const people = state.finView === 'people';
  const oldest = unpaid.length ? new Date(Math.min(...unpaid.map((d) => finDate(d)))) : null;
  const hidden = sorted.length - allRows.length;

  // Сверху то, что ждёт возврата, ниже — закрытые записи. Иначе единственный
  // живой долг тонет в сотне уже возвращённых.
  const groupByDay = (list) => {
    const map = new Map();
    for (const d of list) {
      const key = finStartOfDay(finDate(d)).getTime();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    }
    return map;
  };
  const days = groupByDay(unpaid);
  const closedDays = groupByDay(returned);

  app.innerHTML = `
    <div class="page-head">
      <h1>Финансы</h1>
      <div class="grow"></div>
      <button class="btn ghost sm" id="fin-car">Каршеринг</button>
      <button class="btn ghost sm" id="fin-add">＋ Запись</button>
    </div>

    <div class="summary">
      <div>
        <b>${fmt(total)} ₽</b>
        <span>${unpaid.length
          ? `ждёт возврата · ${unpaid.length} ${finPlural(unpaid.length, 'запись', 'записи', 'записей')}${oldest ? ` · самая давняя от ${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(oldest)}` : ''}`
          : 'все возвраты закрыты'}</span>
      </div>
      <div class="summary-right">
        <div class="seg">
          <button data-view="period" class="${people ? '' : 'active'}">По датам</button>
          <button data-view="people" class="${people ? 'active' : ''}">Кто должен</button>
        </div>
      </div>
    </div>

    <div class="fin-spans">
      ${FIN_SPANS.map((item) => `<button class="fin-span${span === item.id ? ' active' : ''}" data-span="${item.id}">${item.label}</button>`).join('')}
      <span class="fin-span-note">${span === 'all' ? `вся история · ${allRows.length} ${finPlural(allRows.length, 'запись', 'записи', 'записей')}` : `${hidden ? `скрыто ${hidden} за пределами периода` : 'всё внутри периода'}`}</span>
    </div>

    ${people ? finPeopleList(unpaid) : `
      ${days.size ? `<div class="fin-section-head">Ждут возврата · ${fmt(total)} ₽</div>
        ${[...days.entries()].map(([key, rows]) => finDayGroup(key, rows)).join('')}` : ''}
      ${closedDays.size ? `<div class="fin-section-head muted">Уже вернули · ${fmt(finSum(returned))} ₽${span === 'all' ? '' : ' за период'}</div>
        <div class="fin-closed">${[...closedDays.entries()].map(([key, rows]) => finDayGroup(key, rows)).join('')}</div>` : ''}
      ${!days.size && !closedDays.size ? '<div class="empty">Записей пока нет<br><small>Добавь первый ожидаемый возврат</small></div>' : ''}`}
  `;

  document.getElementById('fin-add').onclick = () => openDebtModal(null);
  document.getElementById('fin-car').onclick = openCarModal;
  app.querySelectorAll('[data-span]').forEach((b) => b.onclick = () => {
    state.finSpan = b.dataset.span;
    finDraw();
  });
  app.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => {
    state.finView = b.dataset.view;
    localStorage.setItem('noda_pc_fin_view', state.finView);
    finDraw();
  });
  app.querySelectorAll('[data-person-toggle]').forEach((b) => b.onclick = (event) => {
    if (event.target.closest('[data-settle]') || event.target.closest('[data-entry]')) return;
    b.closest('.person').classList.toggle('open');
  });
  app.querySelectorAll('[data-entry]').forEach((row) => row.onclick = (event) => {
    if (event.target.closest('[data-settle]')) return;
    openDebtModal(state.debtList.concat(state.myDebts || []).find((d) => d.id === row.dataset.entry));
  });
  app.querySelectorAll('[data-settle]').forEach((b) => b.onclick = async (event) => {
    event.stopPropagation();
    const d = state.debtList.find((x) => x.id === b.dataset.settle);
    if (!d) return;
    // Отмечаем сразу и с анимацией: сеть догоняет в фоне, экран не мигает.
    const next = !d.settled;
    const row = b.closest('.fin-row');
    b.classList.toggle('on', next);
    if (row) {
      row.classList.add('fin-flip');
      row.classList.toggle('settled', next);
      setTimeout(() => row.classList.remove('fin-flip'), 420);
    }
    d.settled = next;
    try { await api('PATCH', '/debts/' + d.id, { settled: next }); }
    catch (e) { d.settled = !next; toast('Не сохранилось', e.message, 'warn'); finDraw(); }
  });
}

function finDayGroup(key, rows) {
  const daySum = finSum(rows.filter((d) => !d.settled));
  return `<section class="fin-group">
      <div class="fin-group-head">${esc(finDayTitle(Number(key)))} · ${daySum ? fmt(daySum) + ' ₽' : 'закрыто'}</div>
      <div class="card fin-card">${rows.map(finRow).join('')}</div>
    </section>`;
}

function finRow(d) {
  const purpose = finPurpose(d);
  const counterparty = normalizeFinanceCounterparty(d.counterparty);
  const named = counterparty && !/компан/i.test(counterparty);
  const title = named ? counterparty : (purpose || 'Без названия');
  const who = finPerson(d);
  const whom = ({ Тима: 'Тиме', Даня: 'Дане', Женя: 'Жене' })[who] || who;
  const relation = d.direction === 'i_owe' ? 'я должен' : `вернуть ${whom}`;
  const when = finDate(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `
    <div class="fin-row${d.settled ? ' settled' : ''}" data-entry="${d.id}">
      ${financeDebtIcon(d, purpose)}
      <div class="fin-main">
        <b>${esc(title)}</b>
        <small>${purpose ? esc(purpose) + ' · ' : ''}${esc(relation)} · ${esc(when)}</small>
      </div>
      <strong class="fin-amount">${fmt(d.amount)} ₽</strong>
      <button class="fin-check${d.settled ? ' on' : ''}" data-settle="${d.id}" title="Вернули">✓</button>
    </div>`;
}

function finPeopleList(unpaid) {
  const mine = state.myDebts || [];
  const owed = finGroupBy(unpaid);
  if (!unpaid.length && !mine.length) return '<div class="empty">Все долги закрыты</div>';
  return `${owed}${mine.length ? `<div class="fin-group-head" style="margin-top:18px">Я должен · ${fmt(finSum(mine))} ₽</div>${finGroupBy(mine)}` : ''}`;
}

function finGroupBy(list) {
  if (!list.length) return '';
  const groups = new Map();
  for (const d of list) {
    const key = normalizeFinanceCounterparty(d.counterparty || 'Без имени');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  const rows = [...groups.entries()]
    .map(([name, items]) => ({ name, items: items.sort((a, b) => finDate(b) - finDate(a)), total: finSum(items) }))
    .sort((a, b) => b.total - a.total);
  return `<div class="people">${rows.map((row) => {
    const last = finDate(row.items[0]);
    return `
      <div class="person">
        <button class="person-head" data-person-toggle="${esc(row.name)}">
          ${financeDebtIcon(row.items[0], finPurpose(row.items[0]))}
          <span class="fin-main"><b>${esc(row.name)}</b><small>${row.items.length} ${finPlural(row.items.length, 'запись', 'записи', 'записей')} · последняя ${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(last)}</small></span>
          <span class="fin-amount">${fmt(row.total)} ₽</span>
          <span class="caret">›</span>
        </button>
        <div class="person-body"><div>${row.items.map(finRow).join('')}</div></div>
      </div>`;
  }).join('')}</div>`;
}

/** Быстрый каршеринг: сервис + сумма, остальное подставляется само. */
function openCarModal() {
  let v = document.getElementById('carmodal');
  if (!v) { v = document.createElement('div'); v.id = 'carmodal'; v.className = 'editmodal'; document.body.appendChild(v); }
  let picked = localStorage.getItem('noda_last_car') || FIN_CARS[0].name;
  v.innerHTML = `
    <div class="editcard" style="max-width:420px">
      <div class="row"><div class="b grow">Каршеринг</div><button class="ws-mini" id="carclose">✕</button></div>
      <div class="car-picker">
        ${FIN_CARS.map((car) => `<button class="car-pick${car.name === picked ? ' active' : ''}" data-car="${esc(car.name)}">
          <img src="assets/merchants/${car.icon}.png" alt="" onerror="this.style.visibility='hidden'">${esc(car.name)}</button>`).join('')}
      </div>
      <label class="field" style="margin-top:14px"><span>Сумма, ₽</span><input id="caramount" type="number" placeholder="480" autofocus /></label>
      <button class="btn full" id="carsave" style="margin-top:16px">Записать</button>
    </div>`;
  const close = () => v.remove();
  v.onclick = (e) => { if (e.target === v) close(); };
  document.getElementById('carclose').onclick = close;
  v.querySelectorAll('[data-car]').forEach((b) => b.onclick = () => {
    picked = b.dataset.car;
    v.querySelectorAll('[data-car]').forEach((x) => x.classList.toggle('active', x === b));
    document.getElementById('caramount').focus();
  });
  const save = async () => {
    const amount = Number(document.getElementById('caramount').value);
    if (!amount) { toast('Впиши сумму', '', 'warn'); return; }
    localStorage.setItem('noda_last_car', picked);
    try {
      await api('POST', '/debts', { counterparty: picked, note: '[Тима] Каршеринг', amount, direction: 'owes_me', occurred_at: new Date().toISOString() });
      close();
      toast('Записано', `${picked} · ${fmt(amount)} ₽`, 'ok');
      state.finAnchor = new Date();
      await renderFin();
    } catch (e) { toast('Не сохранилось', e.message, 'warn'); }
  };
  document.getElementById('carsave').onclick = save;
  document.getElementById('caramount').onkeydown = (e) => { if (e.key === 'Enter') save(); };
}

// Карточка долга: детали + погасить/вернуть/удалить
function openDebtModal(db) {
  let v = document.getElementById('txmodal');
  if (!v) { v = document.createElement('div'); v.id = 'txmodal'; v.className = 'editmodal'; document.body.appendChild(v); }
  const pick = (String(db?.note || '').match(/\[(Тима|Даня|Женя)\]/) || [])[1] || 'Тима';
  const note = String(db?.note || '').replace(/\[(Тима|Даня|Женя)\]\s*/g, '').trim();
  const d = new Date(db?.occurred_at || db?.created_at || Date.now()); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  v.innerHTML = `
    <div class="editcard" style="max-width:440px">
      <div class="row"><div class="b grow">${db ? 'Изменить запись' : 'Новая запись'}</div><button class="ws-mini" id="dbclose">✕</button></div>
      <div class="seg" id="dbperson" style="width:100%;margin:14px 0">${['Тима','Даня','Женя'].map((x) => `<button data-person="${x}" class="${pick === x ? 'active' : ''}" style="flex:1">${x}</button>`).join('')}</div>
      <label class="field"><span>Кто</span><input id="dbcounterparty" value="${esc(db?.counterparty || 'Компания')}" /></label>
      <label class="field" style="margin-top:10px"><span>За что</span><input id="dbnote" value="${esc(note)}" /></label>
      <label class="field" style="margin-top:10px"><span>Сумма, ₽</span><input id="dbamount" type="number" value="${esc(db?.amount || '')}" /></label>
      <label class="field" style="margin-top:10px"><span>Когда</span><input id="dbwhen" type="datetime-local" value="${d.toISOString().slice(0,16)}" /></label>
      <button class="btn full" id="dbsave" style="margin-top:16px">Сохранить</button>
      ${db ? `<button class="btn ghost full" id="dbsettle" style="margin-top:8px">${db.settled ? 'Вернуть в активные' : '✓ Отметить возвращённым'}</button><button class="btn ghost sm full" id="dbdel" style="margin-top:8px;color:var(--red)">Удалить</button>` : ''}
    </div>`;
  const close = () => v.remove();
  v.onclick = (e) => { if (e.target === v) close(); };
  document.getElementById('dbclose').onclick = close;
  let who = pick;
  v.querySelectorAll('#dbperson button').forEach((b) => b.onclick = () => { who = b.dataset.person; v.querySelectorAll('#dbperson button').forEach((x) => x.classList.toggle('active', x === b)); });
  document.getElementById('dbsave').onclick = async () => { const counterparty = document.getElementById('dbcounterparty').value.trim(), amount = Number(document.getElementById('dbamount').value), occurred = document.getElementById('dbwhen').value; if (!counterparty || !amount || !occurred) return; const body = { counterparty, amount, direction: db?.direction || 'owes_me', note: `[${who}] ${document.getElementById('dbnote').value.trim()}`.trim(), occurred_at: new Date(occurred).toISOString() }; try { await api(db ? 'PATCH' : 'POST', db ? '/debts/' + db.id : '/debts', body); close(); renderFin(); } catch (e) { toast('Не сохранилось', e.message, 'warn'); } };
  const settle = document.getElementById('dbsettle'); if (settle) settle.onclick = async () => { await api('PATCH', '/debts/' + db.id, { settled: !db.settled }); close(); renderFin(); };
  const del = document.getElementById('dbdel'); if (del) del.onclick = async () => { try { await api('DELETE', '/debts/' + db.id); close(); renderFin(); } catch {} };
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
  'openai': 'openai.com', 'chatgpt': 'openai.com', 'chat gpt': 'openai.com',
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
const CHAT_PRESETS = {
  finance: { title: 'Финансы', icon: '₽', empty: 'Напиши: «купил на Ozon кофе 250», «дал Егору 500» или «сколько мне должны»', placeholder: 'Запиши расход, долг или задай вопрос' },
  general: { title: 'Обычный разговор', icon: '✦', empty: 'Можно обсудить идею, решение, план или просто поговорить.', placeholder: 'О чём поговорим?' },
  tech: { title: 'Покупки и техника', icon: '⌘', empty: 'Расскажи, что выбираешь, для каких задач и какой примерно бюджет.', placeholder: 'Например: какой компьютер купить дальше?' },
};
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
// ================= ПОМОЩНИК (чаты слева, как в веб-версии) =================

let chatThreads = [];
let chatThreadId = localStorage.getItem('noda_pc_thread') || 'main';

async function renderChat() {
  app.innerHTML = `
    <div class="page-head">
      <h1>Помощник</h1>
      <span class="chat-active-preset" id="chat-active-preset">Финансы</span>
      <div class="grow"></div>
      <button class="btn ghost sm" id="chat-clear">Очистить чат</button>
    </div>
    <div class="chat-split">
      <aside class="chat-side">
        <div class="chat-new-wrap">
          <button class="btn sm" id="chat-new">＋ Новый чат</button>
          <div class="chat-new-menu" id="chat-new-menu" hidden>
            ${Object.entries(CHAT_PRESETS).map(([id, preset]) => `<button data-new-preset="${id}"><i>${preset.icon}</i><span><b>${preset.title}</b><small>${preset.empty}</small></span></button>`).join('')}
          </div>
        </div>
        <div class="chat-list" id="chat-list"><div class="empty">…</div></div>
      </aside>
      <section class="chat-main">
        <div class="chat" id="chat"><div class="empty">Загружаю переписку…</div></div>
        <div class="quickrow" id="quickrow">${CHAT_QUICK.map((q, i) => `<button class="chip" data-i="${i}">${q.t}</button>`).join('')}</div>
        <div class="composer">
          <button class="micbtn" id="cmic" title="Записать голосом"><span class="mic-glyph">${MICSVG}</span><span class="mic-meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></button>
          <input id="cinput" placeholder="Спроси или запиши: «купил на озоне кофе 250»" />
          <button class="send" id="csend">${SVG.arrow}</button>
        </div>
      </section>
    </div>`;
  const input = document.getElementById('cinput');
  const sendBtn = document.getElementById('csend');
  const micBtn = document.getElementById('cmic');

  function currentThread() {
    return chatThreads.find((thread) => String(thread.id) === String(chatThreadId))
      || { id: 'main', title: 'Основной', preset: 'finance', main: true };
  }

  function applyChatMode() {
    const thread = currentThread();
    const preset = CHAT_PRESETS[thread.preset] || CHAT_PRESETS.finance;
    const badge = document.getElementById('chat-active-preset');
    const quick = document.getElementById('quickrow');
    if (badge) badge.innerHTML = `<i>${preset.icon}</i>${esc(preset.title)}`;
    if (input) input.placeholder = preset.placeholder;
    if (quick) quick.hidden = thread.preset !== 'finance';
  }

  async function loadThreads() {
    try {
      const r = await api('GET', '/ai/threads');
      chatThreads = r.threads || [];
      if (!chatThreads.some((t) => String(t.id) === String(chatThreadId))) chatThreadId = 'main';
    } catch { chatThreads = [{ id: 'main', title: 'Основной', preset: 'finance', count: 0, main: true }]; }
    drawThreads();
  }

  function drawThreads() {
    const list = document.getElementById('chat-list');
    if (!list) return;
    list.innerHTML = chatThreads.map((t) => {
      const preview = String(t.preview || '').replace(/\s+/g, ' ').slice(0, 46);
      return `<button class="chat-item${String(t.id) === String(chatThreadId) ? ' active' : ''}" data-thread="${esc(t.id)}">
          <b>${esc(t.title || 'Новый чат')}</b><em>${esc((CHAT_PRESETS[t.preset] || CHAT_PRESETS.finance).title)}</em>
          <small>${esc(preview || 'пока пусто')}</small>
          <span class="meta">${t.count ? t.count + ' сообщ.' : 'новый'}</span>
          ${t.main ? '' : `<span class="chat-more" data-thread-menu="${esc(t.id)}">⋯</span>`}
        </button>`;
    }).join('');
    list.querySelectorAll('[data-thread]').forEach((b) => b.onclick = (event) => {
      if (event.target.closest('[data-thread-menu]')) return;
      if (String(b.dataset.thread) === String(chatThreadId)) return;
      chatThreadId = b.dataset.thread;
      localStorage.setItem('noda_pc_thread', chatThreadId);
      drawThreads();
      refresh();
    });
    list.querySelectorAll('[data-thread-menu]').forEach((node) => node.onclick = async (event) => {
      event.stopPropagation();
      const thread = chatThreads.find((t) => String(t.id) === String(node.dataset.threadMenu));
      if (!thread) return;
      const name = prompt('Название чата (пусто — удалить)', thread.title || '');
      if (name === null) return;
      try {
        if (!name.trim()) {
          await api('DELETE', '/ai/threads/' + thread.id);
          if (String(chatThreadId) === String(thread.id)) { chatThreadId = 'main'; localStorage.setItem('noda_pc_thread', chatThreadId); refresh(); }
        } else {
          await api('PATCH', '/ai/threads/' + thread.id, { title: name.trim() });
        }
        await loadThreads();
      } catch (e) { toast('Чат', e.message, 'warn'); }
    });
    applyChatMode();
  }

  const newMenu = document.getElementById('chat-new-menu');
  document.getElementById('chat-new').onclick = () => { newMenu.hidden = !newMenu.hidden; };
  app.querySelectorAll('[data-new-preset]').forEach((button) => button.onclick = async () => {
    const preset = button.dataset.newPreset;
    try {
      const r = await api('POST', '/ai/threads', { preset });
      chatThreads.unshift(r.thread);
      chatThreadId = r.thread.id;
      localStorage.setItem('noda_pc_thread', chatThreadId);
      newMenu.hidden = true;
      drawThreads();
      document.getElementById('chat').innerHTML = `<div class="empty">${esc(CHAT_PRESETS[preset]?.empty || 'Что нужно сделать?')}</div>`;
      input.focus();
    } catch (e) { toast('Чат', e.message, 'warn'); }
  });

  document.getElementById('chat-clear').onclick = async () => {
    if (!confirm('Очистить этот чат? Сообщения удалятся на всех устройствах.')) return;
    try { await api('DELETE', '/ai/messages?thread=' + encodeURIComponent(chatThreadId)); await refresh(); await loadThreads(); }
    catch (e) { toast('Чат', e.message, 'warn'); }
  };

  async function refresh() {
    try {
      const r = await api('GET', '/ai/messages?thread=' + encodeURIComponent(chatThreadId));
      const c = document.getElementById('chat');
      if (!c) return;
      const messages = (r.messages || []).slice(-120);
      const preset = CHAT_PRESETS[currentThread().preset] || CHAT_PRESETS.finance;
      if (!messages.length) c.innerHTML = `<div class="empty">${esc(preset.empty)}</div>`;
      else c.innerHTML = messages.map((m, i) => `<div class="msg ${m.role === 'user' ? 'user' : 'ai'}${i === messages.length - 1 ? ' fresh' : ''}">${esc(m.content)}</div>`).join('');
      c.scrollTop = c.scrollHeight;
      applyChatMode();
    } catch {}
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const c = document.getElementById('chat');
    c.innerHTML += `<div class="msg user fresh">${esc(text)}</div><div class="msg ai" id="typing">…</div>`;
    c.scrollTop = c.scrollHeight;
    sendBtn.disabled = true;
    try { await api('POST', '/ai/assistant', { text, thread: chatThreadId }); } catch (e) { /* ignore */ }
    sendBtn.disabled = false;
    await refresh();
    loadThreads();
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
  let rec = null, chunks = [], audioContext = null, meterFrame = 0;
  const meterBars = [...micBtn.querySelectorAll('.mic-meter i')];
  function stopMeter() {
    if (meterFrame) cancelAnimationFrame(meterFrame);
    meterFrame = 0;
    if (audioContext) audioContext.close().catch(() => {});
    audioContext = null;
    meterBars.forEach((bar) => { bar.style.height = '5px'; });
  }
  function startMeter(stream) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || !meterBars.length) return;
    audioContext = new AudioCtx();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = .72;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(samples);
      const stride = Math.max(1, Math.floor(samples.length / meterBars.length));
      meterBars.forEach((bar, index) => {
        let peak = 0;
        for (let i = index * stride; i < Math.min(samples.length, (index + 1) * stride); i += 1) peak = Math.max(peak, samples[i]);
        bar.style.height = `${Math.max(5, Math.min(23, 5 + Math.round((peak / 255) * 18)))}px`;
      });
      meterFrame = requestAnimationFrame(draw);
    };
    draw();
  }
  micBtn.onclick = async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        try { stream.getTracks().forEach((t) => t.stop()); } catch {}
        stopMeter();
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
      startMeter(stream);
      micBtn.classList.add('rec');
    } catch (e) { toast('Микрофон', 'Нет доступа к микрофону', 'warn'); }
  };

  await loadThreads();
  refresh();
}

// ================= ФАЙЛЫ =================
// Галерея принятых с телефона файлов. Превью делает main-процесс: iPhone
// присылает HEIC (Chromium его не рисует) и фото по 5 МБ, от которых сетка
// карточек начинает лагать.

const FILES_PAGE = 48;
let filesShown = FILES_PAGE;
const thumbCache = new Map();
let thumbWatcher = null;

// Действия на карточке — только иконки: подписи «Картинка · Путь» съедали строку
// и читались как текст, а не как кнопки.
const ACT_ICON = {
  // фото в буфер
  image: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10.5" r="1.6"/><path d="M20 15.5l-4.6-4.6L7 19.5"/></svg>',
  // сам файл в буфер (две страницы = копировать)
  file: '<svg viewBox="0 0 24 24"><rect x="8.5" y="3.5" width="11" height="14" rx="2"/><path d="M15.5 20.5H6.5a2 2 0 0 1-2-2V7"/></svg>',
  // путь: звено цепи
  path: '<svg viewBox="0 0 24 24"><path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.54 3.54 0 0 0-5-5l-1 1"/><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0L6 13a3.54 3.54 0 0 0 5 5l1-1"/></svg>',
  // открыть в системе
  open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M18.5 14.5v3a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h3"/></svg>',
};

const isImageFile = (file) => String(file.mime || '').startsWith('image') || /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif|tiff?)$/i.test(file.name || '');

async function renderFiles() {
  const st = await window.arra.getStatus();
  filesShown = FILES_PAGE;
  app.innerHTML = `
    <div class="page-head">
      <h1>Файлы</h1>
      <div class="grow"></div>
      <button class="btn ghost sm" id="openf">Папка</button>
      <button class="btn ghost sm" id="chf">Сменить</button>
    </div>
    <div class="files-bar">
      <span class="dot ${st.online ? 'on' : ''}"></span>
      <div class="grow"><b>${st.online ? 'На связи с телефоном' : 'Не в сети'}</b><small>${esc(st.folder || '')}</small></div>
      <button class="btn ghost sm" id="logout">Выйти</button>
    </div>
    <div id="feed"></div>`;
  document.getElementById('openf').onclick = () => window.arra.openFolder();
  document.getElementById('chf').onclick = async () => { await window.arra.chooseFolder(); renderFiles(); };
  document.getElementById('logout').onclick = async () => { await window.arra.logout(); renderLogin(); };
  renderFeed();
}

function renderFeed() {
  const feed = document.getElementById('feed');
  if (!feed) return;
  if (!state.files.length) {
    feed.innerHTML = '<div class="empty">Пока пусто<br><small>Отправь файл с телефона — он появится здесь</small></div>';
    return;
  }
  const visible = state.files.slice(0, filesShown);
  const days = new Map();
  for (const file of visible) {
    const stamp = file.at || file.time || Date.now();
    const date = new Date(typeof stamp === 'number' ? stamp : Date.parse(stamp) || Date.now());
    const key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(file);
  }
  const rest = state.files.length - visible.length;
  feed.innerHTML = `<div class="gallery">${[...days.entries()].map(([key, rows]) => `
    <div class="gallery-day">${esc(finDayTitle(Number(key)))} · ${rows.length} ${finPlural(rows.length, 'файл', 'файла', 'файлов')}</div>
    ${rows.map(fileTile).join('')}`).join('')}</div>
    ${rest > 0 ? `<button class="btn ghost files-more" id="files-more">Показать ещё ${Math.min(rest, FILES_PAGE)} из ${rest}</button>` : ''}`;

  const more = document.getElementById('files-more');
  if (more) more.onclick = () => { filesShown += FILES_PAGE; renderFeed(); };
  wireFileTiles(feed);
  watchThumbs(feed);
}

/** Одна карточка: превью, имя и два способа забрать файл — сам файл или путь. */
function fileTile(file) {
  const image = isImageFile(file);
  return `<figure class="shot" data-p="${esc(file.path)}" data-image="${image ? 1 : 0}" data-name="${esc(file.name)}" title="${esc(file.name)}">
      <span class="shot-media" data-thumb="${image ? esc(file.path) : ''}">${image
        ? '<span class="shot-skeleton"></span>'
        : `<span class="tile">${SVG.file}</span>`}</span>
      <figcaption>
        <b>${esc(file.name)}</b>
        <span class="shot-copy">${esc(file.time || '')}</span>
        <span class="shot-acts">
          <button class="shot-act" data-copy-file="1" title="${image ? 'Скопировать саму картинку' : 'Скопировать сам файл'}">${image ? ACT_ICON.image : ACT_ICON.file}</button>
          <button class="shot-act" data-copy-path="1" title="Скопировать путь к файлу">${ACT_ICON.path}</button>
          <button class="shot-act" data-open="1" title="Открыть в системе">${ACT_ICON.open}</button>
        </span>
      </figcaption>
    </figure>`;
}

function shotHint(tile, text, kind = 'ok') {
  const hint = tile.querySelector('.shot-copy');
  if (!hint) return;
  if (!tile.dataset.hint) tile.dataset.hint = hint.textContent;
  hint.textContent = text;
  hint.classList.toggle('ok', kind === 'ok');
  hint.classList.toggle('bad', kind === 'bad');
  clearTimeout(Number(tile.dataset.hintTimer || 0));
  tile.dataset.hintTimer = String(setTimeout(() => {
    hint.textContent = tile.dataset.hint || '';
    hint.classList.remove('ok', 'bad');
  }, 2600));
}

function wireFileTiles(root) {
  root.querySelectorAll('.shot').forEach((tile) => {
    const path = tile.dataset.p;
    tile.querySelector('.shot-media').onclick = () => {
      if (tile.dataset.image === '1') openViewer(path);
      else window.arra.openFile(path);
    };
    tile.querySelector('[data-copy-file]').onclick = async (event) => {
      event.stopPropagation();
      const result = tile.dataset.image === '1' ? await window.arra.copyImage(path) : await window.arra.copyFile(path);
      shotHint(tile, result?.ok ? (tile.dataset.image === '1' ? 'Картинка в буфере ✓' : 'Файл в буфере ✓') : (result?.error || 'Не получилось'), result?.ok ? 'ok' : 'bad');
    };
    tile.querySelector('[data-copy-path]').onclick = async (event) => {
      event.stopPropagation();
      await window.arra.copyPath(path);
      shotHint(tile, 'Путь скопирован ✓');
    };
    tile.querySelector('[data-open]').onclick = (event) => { event.stopPropagation(); window.arra.openFile(path); };
    tile.oncontextmenu = (event) => {
      event.preventDefault();
      showCtxMenu(event.clientX, event.clientY, [
        { label: 'Открыть', action: () => window.arra.openFile(path) },
        { label: 'Показать в папке', action: () => window.arra.openPath(path) },
        { label: 'Скопировать путь', action: () => window.arra.copyPath(path) },
      ]);
    };
  });
}

/** Превью подтягиваем только для карточек, которые реально видно. */
function watchThumbs(root) {
  thumbWatcher?.disconnect();
  thumbWatcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      thumbWatcher.unobserve(entry.target);
      void loadThumb(entry.target);
    }
  }, { rootMargin: '240px' });
  const boxes = [...root.querySelectorAll('.shot-media[data-thumb]')].filter((box) => box.dataset.thumb);
  boxes.forEach((box) => thumbWatcher.observe(box));
  // Пока окно свёрнуто, наблюдатель молчит — первый экран грузим сами,
  // иначе после разворачивания висят пустые плитки.
  boxes.slice(0, 12).forEach((box) => { thumbWatcher.unobserve(box); void loadThumb(box); });
}

async function loadThumb(box) {
  const path = box.dataset.thumb;
  if (!path || box.dataset.done === '1') return;
  box.dataset.done = '1';
  const cached = thumbCache.get(path);
  if (cached) { paintThumb(box, cached); return; }
  const result = await window.arra.fileThumb(path, 420);
  if (result?.ok && result.dataUrl) { thumbCache.set(path, result.dataUrl); paintThumb(box, result.dataUrl); return; }
  box.innerHTML = `<span class="shot-broken"><b>${esc(result?.error || 'Превью нет')}</b><small>${/нет на диске/i.test(result?.error || '') ? 'файл не дошёл целиком' : 'файл открывается системой'}</small></span>`;
}

function paintThumb(box, dataUrl) {
  const img = document.createElement('img');
  img.decoding = 'async';
  img.alt = '';
  img.src = dataUrl;
  box.innerHTML = '';
  box.appendChild(img);
}

/* ---- Просмотр фото ----
   Отдельные слои: панель сверху, картинка в центре, действия снизу. Кнопки
   больше не лежат поверх картинки, поэтому крестик нажимается там, где виден. */
function openViewer(path) {
  const imgs = state.files.filter(isImageFile);
  if (!imgs.length) return;
  let idx = Math.max(0, imgs.findIndex((f) => f.path === path));

  document.getElementById('viewer')?.remove();
  const v = document.createElement('div');
  v.id = 'viewer';
  v.className = 'viewer';
  v.innerHTML = `
    <div class="vbar">
      <span class="vname"></span>
      <span class="vcount"></span>
      <button class="vclose" title="Закрыть (Esc)">✕</button>
    </div>
    <div class="vstage">
      <button class="vnav vprev" title="Предыдущее (←)">‹</button>
      <div class="vframe"><img id="vimg" alt=""><canvas id="vdraw" hidden></canvas></div>
      <button class="vnav vnext" title="Следующее (→)">›</button>
    </div>
    <div class="vacts">
      <button class="vact" data-act="copy-image">Скопировать картинку</button>
      <button class="vact" data-act="copy-path">Скопировать путь</button>
      <button class="vact" data-act="draw">Рисовать</button>
      <button class="vact" data-act="open">Открыть</button>
    </div>`;
  document.body.appendChild(v);

  const img = v.querySelector('#vimg');
  const canvas = v.querySelector('#vdraw');
  const count = v.querySelector('.vcount');
  const name = v.querySelector('.vname');
  const flash = (text, bad = false) => {
    const bar = v.querySelector('.vflash') || Object.assign(document.createElement('div'), { className: 'vflash' });
    bar.textContent = text;
    bar.classList.toggle('bad', bad);
    if (!bar.parentElement) v.appendChild(bar);
    clearTimeout(Number(bar.dataset.timer || 0));
    bar.dataset.timer = String(setTimeout(() => bar.remove(), 2200));
  };

  // Сначала показываем готовое превью (мгновенно), полный файл догружаем следом.
  const update = async () => {
    stopDraw();
    const file = imgs[idx];
    name.textContent = file.name || '';
    count.textContent = `${idx + 1} / ${imgs.length}`;
    const shown = idx;
    const cached = thumbCache.get(file.path);
    if (cached) img.src = cached;
    else {
      const thumb = await window.arra.fileThumb(file.path, 720);
      if (shown !== idx) return;
      if (thumb?.ok) { thumbCache.set(file.path, thumb.dataUrl); img.src = thumb.dataUrl; }
    }
    const full = new Image();
    full.onload = () => { if (shown === idx) img.src = full.src; };
    full.src = fileURL(file.path);
  };
  const prev = () => { idx = (idx - 1 + imgs.length) % imgs.length; void update(); };
  const next = () => { idx = (idx + 1) % imgs.length; void update(); };
  const close = () => { v.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => {
    if (e.key === 'Escape') { if (drawing) stopDraw(); else close(); }
    else if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'ArrowRight') next();
  };

  v.querySelector('.vclose').onclick = close;
  v.querySelector('.vprev').onclick = prev;
  v.querySelector('.vnext').onclick = next;
  v.querySelector('.vstage').onclick = (e) => { if (e.target.classList.contains('vstage')) close(); };
  // Колесо и горизонтальный свайп тачпада — тоже листание.
  let wheelLock = 0;
  v.querySelector('.vstage').onwheel = (e) => {
    if (drawing) return;
    const now = Date.now();
    if (now - wheelLock < 220) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 12) return;
    wheelLock = now;
    if (delta > 0) next(); else prev();
  };
  document.addEventListener('keydown', onKey);
  if (imgs.length < 2) { v.querySelector('.vprev').hidden = true; v.querySelector('.vnext').hidden = true; }

  /* ---- рисование поверх фото ---- */
  let drawing = false;
  let strokes = [];
  let brush = { color: '#FF3B30', width: 6 };
  const ctx = canvas.getContext('2d');

  function stopDraw() {
    if (!drawing) return;
    drawing = false;
    strokes = [];
    canvas.hidden = true;
    v.querySelector('.vtools')?.remove();
    v.classList.remove('drawing');
  }

  function repaint() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      stroke.points.forEach((point, i) => (i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
      ctx.stroke();
    }
  }

  function startDraw() {
    if (drawing) { stopDraw(); return; }
    drawing = true;
    v.classList.add('drawing');
    const rect = img.getBoundingClientRect();
    canvas.width = Math.round(rect.width);
    canvas.height = Math.round(rect.height);
    canvas.hidden = false;
    strokes = [];
    repaint();

    const tools = document.createElement('div');
    tools.className = 'vtools';
    tools.innerHTML = `
      <span class="vcolors">${['#FF3B30', '#FFD60A', '#30D158', '#0A84FF', '#FFFFFF', '#111111'].map((color) => `<button data-color="${color}" style="background:${color}" class="${color === brush.color ? 'on' : ''}"></button>`).join('')}</span>
      <span class="vsizes">${[3, 6, 12, 22].map((size) => `<button data-size="${size}" class="${size === brush.width ? 'on' : ''}"><i style="width:${Math.min(size, 16)}px;height:${Math.min(size, 16)}px"></i></button>`).join('')}</span>
      <button class="vact" data-tool="undo">Отменить</button>
      <button class="vact" data-tool="clear">Стереть всё</button>
      <button class="vact primary" data-tool="save">Сохранить и скопировать</button>
      <button class="vact" data-tool="exit">Выйти из рисования</button>`;
    v.appendChild(tools);
    tools.querySelectorAll('[data-color]').forEach((button) => button.onclick = () => {
      brush.color = button.dataset.color;
      tools.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === button));
    });
    tools.querySelectorAll('[data-size]').forEach((button) => button.onclick = () => {
      brush.width = Number(button.dataset.size);
      tools.querySelectorAll('[data-size]').forEach((x) => x.classList.toggle('on', x === button));
    });
    tools.querySelector('[data-tool="undo"]').onclick = () => { strokes.pop(); repaint(); };
    tools.querySelector('[data-tool="clear"]').onclick = () => { strokes = []; repaint(); };
    tools.querySelector('[data-tool="exit"]').onclick = () => stopDraw();
    tools.querySelector('[data-tool="save"]').onclick = async () => {
      const merged = document.createElement('canvas');
      merged.width = img.naturalWidth || canvas.width;
      merged.height = img.naturalHeight || canvas.height;
      const mctx = merged.getContext('2d');
      mctx.drawImage(img, 0, 0, merged.width, merged.height);
      mctx.drawImage(canvas, 0, 0, merged.width, merged.height);
      const result = await window.arra.saveImage(imgs[idx].path, merged.toDataURL('image/png'));
      if (result?.ok) { flash('Сохранено рядом с фото и скопировано ✓'); stopDraw(); }
      else flash(result?.error || 'Не сохранилось', true);
    };
  }

  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  canvas.onpointerdown = (event) => {
    if (!drawing) return;
    canvas.setPointerCapture(event.pointerId);
    strokes.push({ color: brush.color, width: brush.width, points: [point(event)] });
    repaint();
  };
  canvas.onpointermove = (event) => {
    if (!drawing || !canvas.hasPointerCapture?.(event.pointerId)) return;
    strokes[strokes.length - 1]?.points.push(point(event));
    repaint();
  };
  canvas.onpointerup = (event) => { try { canvas.releasePointerCapture(event.pointerId); } catch {} };

  v.querySelectorAll('[data-act]').forEach((button) => button.onclick = async () => {
    const file = imgs[idx];
    if (button.dataset.act === 'copy-image') {
      const result = await window.arra.copyImage(file.path);
      flash(result?.ok ? 'Картинка в буфере ✓' : (result?.error || 'Не получилось'), !result?.ok);
    } else if (button.dataset.act === 'copy-path') {
      await window.arra.copyPath(file.path);
      flash('Путь скопирован ✓');
    } else if (button.dataset.act === 'draw') startDraw();
    else if (button.dataset.act === 'open') window.arra.openFile(file.path);
  });

  void update();
}

// ================= ЗАМЕТКИ =================
// ================= ЗАМЕТКИ (две колонки, как в веб-версии) =================

let pcNotes = [];
let pcNoteId = null;
let pcNoteTimer = null;
let pcNotesLoaded = false;
let pcNotesLoadedAt = 0;

async function renderNotes() {
  app.innerHTML = `
    <div class="page-head">
      <h1>Заметки</h1>
      <div class="grow"></div>
      <button class="btn sm" id="newnote">＋ Новая</button>
    </div>
    <div class="notes-split">
      <aside class="notes-side">
        <input class="notes-search" id="notesearch" type="search" placeholder="Поиск по заметкам" />
        <div class="notes-list" id="noteslist"><div class="empty">${pcNotesLoaded ? 'Нет заметок' : 'Загружаю…'}</div></div>
      </aside>
      <section class="note-paper" id="notepaper"><div class="empty">Выбери заметку слева</div></section>
    </div>`;
  document.getElementById('newnote').onclick = createPcNote;
  document.getElementById('notesearch').oninput = (e) => drawNoteList(e.target.value);
  if (pcNotesLoaded) {
    if (!pcNotes.some((n) => String(n.id) === String(pcNoteId))) pcNoteId = pcNotes[0]?.id || null;
    drawNoteList('');
    drawNotePaper();
    if (Date.now() - pcNotesLoadedAt < 30000) return;
  }
  try {
    const r = await api('GET', '/notes');
    pcNotes = r.notes || [];
    pcNotesLoaded = true;
    pcNotesLoadedAt = Date.now();
    if (state.section !== 'notes' || !document.getElementById('noteslist')) return;
    if (!pcNotes.some((n) => String(n.id) === String(pcNoteId))) pcNoteId = pcNotes[0]?.id || null;
    drawNoteList('');
    drawNotePaper();
  } catch (e) {
    document.getElementById('noteslist').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function drawNoteList(query) {
  const box = document.getElementById('noteslist');
  if (!box) return;
  const value = String(query || '').trim().toLowerCase();
  const list = pcNotes.filter((n) => !value || `${n.title || ''} ${n.body || ''}`.toLowerCase().includes(value));
  box.innerHTML = list.length ? list.map((n) => {
    const text = String(n.body || '').replace(/[#>*\-[\]`]/g, ' ').replace(/\s+/g, ' ').trim();
    const tasks = (String(n.body || '').match(/^- \[[ x]\]/gm) || []).length;
    const done = (String(n.body || '').match(/^- \[x\]/gm) || []).length;
    let when = '';
    try { when = new Date(n.updated_at || n.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); } catch {}
    return `<button class="note-item${String(n.id) === String(pcNoteId) ? ' active' : ''}" data-note="${n.id}">
        <b>${esc(n.title || text.slice(0, 30) || 'Без названия')}</b>
        <small>${esc(text.slice(0, 68) || 'пустая заметка')}</small>
        <span class="meta">${esc(when)}${tasks ? ` · задач ${done}/${tasks}` : ''}</span>
      </button>`;
  }).join('') : '<div class="empty">Ничего не найдено</div>';
  box.querySelectorAll('[data-note]').forEach((b) => b.onclick = () => selectPcNote(b.dataset.note));
}

/** Переключение мгновенное: прошлую заметку досохраняем в фоне. */
function selectPcNote(id) {
  if (String(id) === String(pcNoteId)) return;
  void savePcNote();
  pcNoteId = id;
  document.querySelectorAll('[data-note]').forEach((b) => b.classList.toggle('active', String(b.dataset.note) === String(id)));
  drawNotePaper(true);
}

function drawNotePaper(animate = false) {
  const paper = document.getElementById('notepaper');
  if (!paper) return;
  const note = pcNotes.find((n) => String(n.id) === String(pcNoteId));
  if (!note) { paper.innerHTML = '<div class="empty">Выбери заметку слева</div>'; return; }

  // Разметку не пересоздаём — меняем только содержимое полей. Иначе каждое
  // переключение стоит полного пересбора DOM и заметно «тормозит».
  const title = document.getElementById('notetitle');
  const body = document.getElementById('notebody');
  if (title && body && paper.dataset.ready === '1') {
    title.value = note.title || '';
    body.value = note.body || '';
    body.scrollTop = 0;
    const label = document.getElementById('notestate');
    if (label) label.textContent = 'Сохранено';
    if (animate) { paper.classList.remove('swap'); void paper.offsetWidth; paper.classList.add('swap'); }
    wireNotePaper(note);
    return;
  }

  paper.classList.remove('swap');
  paper.innerHTML = `
    <div class="note-head">
      <span class="note-state" id="notestate">Сохранено</span>
      <div class="row" style="gap:8px">
        <button class="btn ghost sm" id="noteai">Причесать через ИИ</button>
        <button class="btn ghost sm" id="notedel">Удалить</button>
      </div>
    </div>
    <input class="note-title" id="notetitle" placeholder="Заголовок" value="${esc(note.title || '')}" />
    <textarea class="note-body" id="notebody" placeholder="Текст заметки…">${esc(note.body || '')}</textarea>`;
  paper.dataset.ready = '1';
  if (animate) { void paper.offsetWidth; paper.classList.add('swap'); }
  wireNotePaper(note);
}

function wireNotePaper(note) {
  const markDirty = () => {
    const label = document.getElementById('notestate');
    if (label) label.textContent = 'Сохраняю…';
    clearTimeout(pcNoteTimer);
    pcNoteTimer = setTimeout(savePcNote, 700);
  };
  document.getElementById('notetitle').oninput = markDirty;
  document.getElementById('notebody').oninput = markDirty;
  document.getElementById('notedel').onclick = async () => {
    if (!confirm('Удалить заметку? Она исчезнет на всех устройствах.')) return;
    try {
      await api('DELETE', '/notes/' + note.id);
      pcNotes = pcNotes.filter((n) => String(n.id) !== String(note.id));
      pcNoteId = pcNotes[0]?.id || null;
      drawNoteList(document.getElementById('notesearch')?.value || '');
      drawNotePaper();
    } catch (e) { toast('Заметка', e.message, 'warn'); }
  };
  document.getElementById('noteai').onclick = async () => {
    toast('Заметка', 'Причёсываю…', 'info');
    try {
      const structured = await api('POST', '/notes/structure', { text: note.body || '' });
      const saved = await api('PUT', '/notes/' + note.id, { title: note.title, body: structured.structuredBody || note.body });
      Object.assign(note, saved.note || {});
      drawNotePaper(true);
      drawNoteList(document.getElementById('notesearch')?.value || '');
      toast('Заметка', 'Готово', 'ok');
    } catch (e) { toast('Заметка', e.message, 'warn'); }
  };
}

async function savePcNote() {
  clearTimeout(pcNoteTimer);
  const note = pcNotes.find((n) => String(n.id) === String(pcNoteId));
  const titleField = document.getElementById('notetitle');
  const bodyField = document.getElementById('notebody');
  if (!note || !titleField || !bodyField) return;
  const title = titleField.value.trim();
  const body = bodyField.value;
  if (title === (note.title || '') && body === (note.body || '')) return;
  try {
    const saved = await api('PUT', '/notes/' + note.id, { title, body });
    Object.assign(note, saved.note || { title, body });
    const label = document.getElementById('notestate');
    if (label) label.textContent = 'Сохранено только что';
    // Список целиком не перерисовываем: правим только строку этой заметки,
    // иначе каждый автосейв во время набора дёргает всю боковую панель.
    const item = document.querySelector(`[data-note="${note.id}"]`);
    if (item) {
      const text = String(body || '').replace(/[#>*\-[\]`]/g, ' ').replace(/\s+/g, ' ').trim();
      const titleEl = item.querySelector('b');
      const previewEl = item.querySelector('small');
      if (titleEl) titleEl.textContent = title || text.slice(0, 30) || 'Без названия';
      if (previewEl) previewEl.textContent = text.slice(0, 68) || 'пустая заметка';
    }
  } catch (e) {
    const label = document.getElementById('notestate');
    if (label) label.textContent = 'Не сохранилось: ' + e.message;
  }
}

async function createPcNote() {
  try {
    const r = await api('POST', '/notes', { title: '', body: '' });
    pcNotes.unshift(r.note);
    pcNoteId = r.note.id;
    drawNoteList(document.getElementById('notesearch')?.value || '');
    drawNotePaper(true);
    document.getElementById('notetitle')?.focus();
  } catch (e) { toast('Заметка', e.message, 'warn'); }
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
        <div class="terminal-turnbar" id="terminal-turnbar" hidden></div>
        <div id="xterm-host" class="xterm-host"></div>
        <form class="terminal-composer" id="terminal-composer">
          <textarea id="terminal-command" rows="1" spellcheck="false" aria-label="Команда или сообщение агенту" placeholder="Команда PowerShell или сообщение агенту"></textarea>
          <span class="terminal-voice-status" id="terminal-voice-status" aria-live="polite" hidden></span>
          <button class="composer-tool terminal-voice" id="terminal-voice" type="button" title="Локальная диктовка Whisper" aria-label="Локальная диктовка Whisper" aria-pressed="false"><span class="mic-glyph">${MICSVG}</span><span class="voice-stop" aria-hidden="true"></span></button>
          <button class="composer-tool" id="agent-sound" type="button" title="Звук уведомлений" aria-label="Звук уведомлений"></button>
          <button class="terminal-send" type="submit" title="Отправить (Enter)" aria-label="Отправить"><svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"></path></svg></button>
        </form>
      </div>
    </div>`;
  document.getElementById('drives').onclick = () => termSend({ type: 'fs_list', reqId: newReq(), path: '' });
  // загрузить дерево (от папки кода) и поднять терминалы
  termSend({ type: 'fs_list', reqId: newReq(), path: term.root || '' });
  renderTree();
  wirePty();
  renderTermTabs();
  mountActiveTerm();
  wireTerminalComposer();
  updateTerminalComposer();
  requestAnimationFrame(() => document.getElementById('terminal-command')?.focus());
}

function launchTerminalPreset(command) {
  const x = xts[activeLocal];
  if (!x) return;
  setAgentKind(activeLocal, command.startsWith('codex') ? 'codex' : 'claude');
  window.arra.ptyInput(command + '\r', activeLocal);
  requestAnimationFrame(() => document.getElementById('terminal-command')?.focus());
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
  // Полный список перенесённых файлов и итог последней передачи — из них
  // строится проводник «что именно уехало» под кнопками.
  transferLog: [], lastResult: null,
  codexSessions: [], codexOpen: new Set(), codexLoadedAt: 0, codexShowAll: false,
  step: 'idle', failedStep: 'scan', stepError: '', errors: [],
  panelTab: localStorage.getItem('noda-sync-panel') || 'tree',
  blockers: [], blockersChecked: false, blockersBusy: false, closeResult: null,
  remote: {}, showAll: false,
  lastRequest: null, networkRetries: 0,
  autoClosingBlockers: false,
  scanLocalFiles: 0, scanLocalDirs: 0,
  scanRemoteFiles: 0, scanRemoteDirs: 0,
  scanLocalScope: '', scanRemoteScope: '',
  scanLocalScopes: {}, scanRemoteScopes: {},
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
function fileCount(value) {
  const n = Math.max(0, Number(value) || 0);
  const mod100 = n % 100;
  const mod10 = n % 10;
  const word = mod100 >= 11 && mod100 <= 14 ? 'файлов' : (mod10 === 1 ? 'файл' : (mod10 >= 2 && mod10 <= 4 ? 'файла' : 'файлов'));
  return `${n} ${word}`;
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
  if (silent > 45) return { label: `сервер отвечает медленно · ${Math.round(silent)} сек`, cls: 'warn' };
  if (silent > 15) return { label: `жду следующий ответ · ${Math.round(silent)} сек`, cls: '' };
  return { label: 'соединение активно', cls: 'ok' };
}
function wireSyncEvents() {
  if (sync.wired) return; sync.wired = true;
  window.arra.onRemoteSyncEvent((message) => handleRemoteSyncEvent(message));
  window.arra.onSyncEvent((o) => {
    if (!o || !o.type) return;
    if (o.type === 'phase') {
      syncLog(o.msg || 'Подготовка переноса');
      sync.busy = true; sync.phase = o.msg || 'Подготовка…'; sync.detail = o.detail || '';
      sync.step = 'scan'; sync.stepError = '';
      sync.indeterminate = true; sync.lastProgressAt = Date.now(); updateSyncStage();
    } else if (o.type === 'scan') {
      sync.busy = true; sync.indeterminate = true;
      sync.step = 'scan';
      sync.lastProgressAt = Date.now();
      if (o.side === 'remote') {
        sync.scanRemoteScopes[o.scope || 'Сервер'] = { files: Number(o.files) || 0, dirs: Number(o.dirs) || 0 };
        sync.scanRemoteFiles = Object.values(sync.scanRemoteScopes).reduce((sum, row) => sum + row.files, 0);
        sync.scanRemoteDirs = Object.values(sync.scanRemoteScopes).reduce((sum, row) => sum + row.dirs, 0);
        sync.scanRemoteScope = o.scope || '';
      } else {
        sync.scanLocalScopes[o.scope || 'Компьютер'] = { files: Number(o.files) || 0, dirs: Number(o.dirs) || 0 };
        sync.scanLocalFiles = Object.values(sync.scanLocalScopes).reduce((sum, row) => sum + row.files, 0);
        sync.scanLocalDirs = Object.values(sync.scanLocalScopes).reduce((sum, row) => sum + row.dirs, 0);
        sync.scanLocalScope = o.scope || '';
      }
      sync.phase = o.msg || `Сканирую ${o.side === 'remote' ? 'сервер' : 'этот компьютер'}…`;
      sync.detail = 'Считаю файлы с обеих сторон';
      updateSyncStage();
    }
    else if (o.type === 'status') {
      syncLog(`Проверка завершена: ${o.localFiles || 0} здесь, ${o.remoteFiles || 0} на сервере, ${o.upload || 0} отправить, ${o.download || 0} забрать`);
      if ((o.excludedScopes || []).length) {
        syncLog('Архивные диалоги Codex не копируются; активные диалоги, память, настройки и навыки синхронизируются.');
      }
      sync.busy = false; sync.info = o; sync.projects = o.projects || [];
      sync.lastCheckSeconds = Number(o.elapsed) || Math.round(syncElapsed());
      if (!sync.lastRequest) sync.step = 'idle';
      // Короткие формулировки без пояснений: числа видны в кнопках.
      sync.detail = '';
      if (o.upload && o.download) sync.phase = 'Менялось с обеих сторон';
      else if (o.upload) sync.phase = 'Актуальнее этот компьютер';
      else if (o.download) sync.phase = 'Актуальнее сервер';
      else sync.phase = 'Версии совпадают';
      sync.pct = 0; sync.indeterminate = false; renderSyncViewBody(); updateSyncStage();
    } else if (o.type === 'plan') {
      syncLog(`${o.direction === 'push' ? 'Отправка на сервер' : 'Получение с сервера'}: ${o.files || 0} файлов, ${fmtB(o.bytes || 0)}`);
      sync.step = 'files'; sync.stepError = '';
      sync.phase = o.direction === 'push' ? 'Отправляю работу на сервер' : 'Забираю работу с сервера';
      sync.detail = `${o.files || 0} файлов · ${fmtB(o.bytes || 0)}${o.only ? ' · ' + o.only : ''}`;
      sync.indeterminate = !(o.files > 0);
      sync.speed = 0; sync.eta = null; sync.current = null; sync.recentFiles = []; sync.blockedFiles = []; sync.verify = null;
      sync.transferLog = []; sync.lastResult = null;
      sync.liveProjects = Object.fromEntries((o.projects || []).map((p) => [p.name, { ...p, done: 0, doneBytes: 0 }]));
      updateSyncStage(); updateSyncLive();
    } else if (o.type === 'storage') {
      const free = o.freeBytes == null ? 'неизвестно' : fmtB(o.freeBytes);
      syncLog(`Место на сервере: свободно ${free}, план ${fmtB(o.plannedUploadBytes || 0)}`);
      sync.detail = `Сервер: свободно ${free} · для передачи ${fmtB(o.plannedUploadBytes || 0)}`;
      updateSyncStage(); updateSyncLive();
    } else if (o.type === 'preflight') {
      sync.step = 'files';
      sync.phase = 'Проверяю, не заняты ли файлы';
      sync.detail = `${o.checked || 0} из ${o.total || 0}${o.blocked ? ` · занято ${o.blocked}` : ''}${o.file ? ` · ${syncShortPath(o.file)}` : ''}`;
      sync.pct = o.total ? Math.round((o.checked || 0) / o.total * 100) : 0;
      sync.indeterminate = false; sync.lastProgressAt = Date.now();
      setSyncProgress(sync.pct, sync.detail); updateSyncStage(); updateSyncLive();
    } else if (o.type === 'blocked') {
      sync.busy = false; sync.indeterminate = false; sync.blockedFiles = o.files || [];
      sync.step = 'blocked'; sync.phase = `${Number(o.count) === 1 ? 'Занят' : 'Занято'} ${fileCount(o.count)}`;
      sync.detail = 'Освобождаю занятые файлы и автоматически продолжаю передачу.';
      sync.pct = 0; setSyncProgress(0, sync.detail); updateSyncStage(); updateSyncLive(); renderSyncV2Body();
      refreshSyncBlockers().then(() => autoResolveSyncBlockers());
      toast('Файлы заняты', `${fileCount(o.count)} · пробую освободить автоматически`, 'warn', 6000);
    } else if (o.type === 'progress') {
      sync.step = 'transfer';
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
        if (sync.transferLog.length < 900) sync.transferLog.push({
          file: o.file || '', project: o.project || projectKey || 'Прочее', projectKey: projectKey || '',
          scope: o.scope || '', direction: o.direction || '', bytes: o.fileTotal || 0, ok: o.state === 'done',
        });
      }
      setSyncProgress(pct, sync.detail); updateSyncStage(); updateSyncLive();
    } else if (o.type === 'retry') {
      sync.step = 'transfer';
      sync.lastProgressAt = Date.now();
      syncLog(`↻ попытка ${o.attempt}/${o.maxAttempts || 3} · ${o.file}: ${o.error}`);
      sync.phase = 'Повторяю файл после ошибки';
      sync.detail = `${syncShortPath(o.file)} · ${o.error}`;
      updateSyncStage(); updateSyncLive();
    } else if (o.type === 'verify') {
      sync.step = 'verify';
      sync.verify = { done: o.done || 0, total: o.total || 0, verified: 0, errors: 0 };
      sync.phase = 'Проверяю, что все файлы дошли';
      sync.detail = `0 из ${o.total || 0} подтверждено на стороне назначения`;
      sync.pct = 0; sync.indeterminate = !(o.total > 0); sync.lastProgressAt = Date.now();
      setSyncProgress(0, sync.detail); updateSyncStage(); updateSyncLive();
    } else if (o.type === 'verify_progress') {
      sync.step = 'verify';
      sync.verify = { done: o.done || 0, total: o.total || 0, verified: o.verified || 0, errors: o.errors || 0, file: o.file };
      sync.phase = 'Проверяю, что все файлы дошли';
      sync.detail = `${o.verified || 0} подтверждено из ${o.total || 0}${o.errors ? ` · ошибок ${o.errors}` : ''} · ${syncShortPath(o.file)}`;
      sync.pct = o.total ? Math.round((o.done || 0) / o.total * 100) : 100;
      sync.indeterminate = false; sync.lastProgressAt = Date.now();
      setSyncProgress(sync.pct, sync.detail); updateSyncStage(); updateSyncLive();
    } else if (o.type === 'fileerror') {
      syncLog(`⚠ ${o.file}: ${o.error}`);
      sync.errors.push({ file: o.file || 'Файл', error: o.error || 'Ошибка' });
      sync.errors = sync.errors.slice(-50);
      renderSyncJourney();
    } else if (o.type === 'file_skipped') {
      syncLog(`↷ пропущен исчезнувший файл · ${o.file}`);
      sync.detail = `${syncShortPath(o.file)} · исчез после сканирования, передача продолжается`;
      sync.lastProgressAt = Date.now();
      updateSyncStage(); updateSyncLive();
    } else if (o.type === 'done') {
      const verb = o.direction === 'push' ? 'Отправлено на сервер' : 'Забрано с сервера';
      sync.pct = 100; sync.indeterminate = false;
      sync.phase = `${verb}: ${fileCount(o.transferred)}`;
      sync.detail = `${fmtB(o.bytes || 0)} · проверено ${o.verified ?? o.transferred ?? 0}${o.errors ? ` · ошибок ${o.errors}` : ''}${o.skipped ? ` · пропущено ${o.skipped}` : ''}`;
      sync.lastDone = new Date().toISOString(); localStorage.setItem('arra-sync-last', sync.lastDone);
      sync.step = o.errors ? 'error' : 'done'; sync.stepError = o.errors ? `${o.errors} ошибок` : '';
      sync.busy = false; sync.current = null; sync.speed = 0; sync.eta = null;
      sync.verify = null;
      sync.lastResult = {
        direction: o.direction || 'push', at: Date.now(),
        transferred: Number(o.transferred || 0), bytes: Number(o.bytes || 0),
        elapsed: Number(o.elapsed || syncElapsed()), errors: Number(o.errors || 0),
        verified: o.verified ?? o.transferred ?? 0, skipped: Number(o.skipped || 0),
        files: sync.transferLog.slice(),
      };
      syncLog(`${verb}: ${o.transferred || 0} файлов, ${fmtB(o.bytes || 0)}, ошибок ${o.errors || 0}`);
      setSyncProgress(100, sync.detail); updateSyncStage(); updateSyncLive();
      renderSyncViewBody();
      toast('Передача', `${verb}: ${fileCount(o.transferred)}${o.errors ? `, ошибок ${o.errors}` : ''}`, o.errors ? 'warn' : 'ok');
      setTimeout(() => window.arra.syncRun('status', null, null), 700);
    } else if (o.type === 'error') {
      syncLog('ОШИБКА: ' + (o.error || 'Неизвестная ошибка'));
      sync.busy = false; sync.indeterminate = false; sync.phase = 'Передача остановлена'; sync.detail = o.error || 'Неизвестная ошибка';
      sync.failedStep = ['scan', 'files', 'transfer', 'verify'].includes(sync.step) ? sync.step : 'scan';
      sync.step = 'error'; sync.stepError = sync.detail; sync.errors.push({ file: 'Передача', error: sync.detail });
      updateSyncStage(); updateSyncLive(); toast('Передача', o.error, 'warn'); renderSyncViewBody();
    } else if (o.type === 'stderr') {
      syncLog(o.msg || 'Ошибка Python'); sync.errors.push({ file: 'Движок', error: o.msg || 'Ошибка Python' });
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
  sync.remote[key] = { ...(sync.remote[key] || {}), name, type: event.type, pct: event.type === 'progress' ? Math.round((event.bytes || 0) / Math.max(1, event.totalBytes || 1) * 100) : (event.type === 'done' ? 100 : 0), event };
  if (event.type === 'progress') syncLog(`${name}: ${fmtB(event.speed || 0)}/с · ${event.done || 0}/${event.total || 0}`);
  if (event.type === 'done') toast(name, `Выгрузка завершена: ${event.transferred || 0} файлов`, event.errors ? 'warn' : 'ok', 7000);
  if (event.type === 'error') toast(name, event.error || 'Ошибка удалённой выгрузки', 'warn', 7000);
  renderRemoteDevices();
}
function updateSyncStage() {
  setSyncStatus(sync.phase);
  // во время передачи карточка состояния показывает фазу и полосу прогресса
  const progressBox = document.getElementById('sync-progress');
  if (progressBox) progressBox.hidden = !sync.busy;
  if (sync.busy) {
    const title = document.getElementById('sync-journey-title');
    const detailLine = document.getElementById('sync-journey-detail');
    if (title) title.textContent = sync.phase || 'Передаю…';
    if (detailLine) detailLine.textContent = sync.detail || '';
    const card = document.getElementById('sync-state');
    if (card) card.className = 'state-card busy';
  }
  const detail = document.getElementById('sync-detail'); if (detail) detail.textContent = sync.detail || '';
  const icon = document.getElementById('sync-stage-icon'); if (icon) icon.classList.toggle('busy', sync.busy);
  const track = document.getElementById('sync-track'); if (track) track.classList.toggle('indeterminate', !!sync.indeterminate);
  // Дата версии на сервере уже стоит в центре рельса — здесь показываем только
  // время идущей передачи, чтобы не дублировать.
  const tm = document.getElementById('sync-time');
  if (tm) { tm.textContent = sync.busy ? fmtDuration(syncElapsed()) : ''; tm.hidden = !sync.busy; }
  const cancel = document.getElementById('sync-cancel'); if (cancel) cancel.hidden = !sync.busy;
  const push = document.getElementById('sync-push-all'); if (push) push.disabled = sync.busy;
  const pull = document.getElementById('sync-pull-all'); if (pull) pull.disabled = sync.busy;
  const scanning = sync.busy && sync.step === 'scan';
  const speed = document.getElementById('sync-speed-value'); if (speed) speed.textContent = scanning ? fileCount(sync.scanLocalFiles + sync.scanRemoteFiles) : (sync.speed ? `${fmtB(sync.speed)}/с` : '—');
  const eta = document.getElementById('sync-eta-value'); if (eta) eta.textContent = scanning ? fmtDuration(syncElapsed()) : (sync.eta != null ? fmtDuration(sync.eta) : '—');
  const speedLabel = document.getElementById('sync-speed-label'); if (speedLabel) speedLabel.textContent = scanning ? 'Уже проверено' : 'Скорость';
  const etaLabel = document.getElementById('sync-eta-label'); if (etaLabel) etaLabel.textContent = scanning ? 'Идёт' : 'Осталось';
  const pct = document.getElementById('sync-pct-value'); if (pct) pct.textContent = sync.indeterminate ? 'Сверяю…' : `${sync.pct || 0}%`;
  const scanSummary = document.getElementById('sync-scan-summary');
  if (scanSummary) {
    scanSummary.hidden = !scanning;
    scanSummary.innerHTML = scanning ? `
      <div><span>Этот компьютер</span><b>${fmt(sync.scanLocalFiles)} файлов</b><small>${esc(sync.scanLocalScope || 'подключаю')}</small></div>
      <div><span>Сервер</span><b>${fmt(sync.scanRemoteFiles)} файлов</b><small>${esc(sync.scanRemoteScope || 'подключаю')}</small></div>` : '';
  }
  renderSyncJourney();
}
function updateSyncLiveRich() {
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
  sync.lastRequest = null; sync.step = 'scan'; sync.stepError = ''; sync.errors = [];
  sync.busy = true; sync.startedAt = Date.now();
  // Явно проговариваем, что это только сверка: раньше при входе в раздел
  // молча стартовал «какой-то процесс» и было непонятно, что он делает.
  sync.phase = 'Сверяю с сервером';
  sync.detail = 'Ничего не передаётся, только сравниваю';
  sync.pct = 0; sync.indeterminate = true;
  sync.lastProgressAt = Date.now(); sync.current = null; sync.speed = 0; sync.eta = null;
  sync.scanLocalFiles = 0; sync.scanLocalDirs = 0; sync.scanRemoteFiles = 0; sync.scanRemoteDirs = 0;
  sync.scanLocalScope = ''; sync.scanRemoteScope = '';
  sync.scanLocalScopes = {}; sync.scanRemoteScopes = {};
  sync.liveProjects = {}; sync.recentFiles = []; sync.blockedFiles = []; sync.verify = null;
  setSyncProgress(0, ''); updateSyncStage();
  syncLog('Проверяю изменения на устройстве и сервере…');
  window.arra.syncRun('status', null, null);
}
function runSyncOp(mode, only, automaticRetry = false) {
  if (sync.busy) { toast('Перенос', 'Идёт операция, подожди', 'info'); return; }
  if (!automaticRetry) sync.networkRetries = 0;
  sync.lastRequest = { mode, only: only || null };
  sync.step = 'scan'; sync.stepError = ''; sync.errors = [];
  sync.busy = true; sync.startedAt = Date.now(); sync.pct = 0; sync.indeterminate = true;
  sync.lastProgressAt = Date.now(); sync.current = null; sync.speed = 0; sync.eta = null;
  sync.scanLocalFiles = 0; sync.scanLocalDirs = 0; sync.scanRemoteFiles = 0; sync.scanRemoteDirs = 0;
  sync.scanLocalScope = ''; sync.scanRemoteScope = '';
  sync.scanLocalScopes = {}; sync.scanRemoteScopes = {};
  sync.liveProjects = {}; sync.recentFiles = []; sync.blockedFiles = []; sync.verify = null;
  setSyncProgress(0, ''); const lg = document.getElementById('sync-log'); if (lg) { lg.textContent = ''; lg.style.display = 'none'; }
  sync.phase = (mode === 'push' ? 'Готовлю отправку на сервер' : 'Готовлю получение с сервера') + (only ? ' · ' + only : '') + '…';
  sync.detail = 'Повторно проверяю файлы перед копированием'; updateSyncStage();
  syncLog(`${mode === 'push' ? 'Запрошена отправка' : 'Запрошено получение'}${only ? ': ' + only : ': все изменения'}`);
  window.arra.syncRun(mode, only || null, null);
  renderSyncViewBody();
}

async function refreshSyncBlockers() {
  if (sync.blockersBusy) return sync.blockers;
  sync.blockersBusy = true;
  renderBlockerPanel();
  try { sync.blockers = await window.arra.syncBlockers() || []; }
  catch (error) { reportError('sync.blockers.refresh', error); sync.blockers = []; }
  if (!sync.blockers.length) sync.closeResult = null;
  sync.blockersChecked = true;
  sync.blockersBusy = false;
  renderBlockerPanel();
  return sync.blockers;
}

function autoResolveSyncBlockers() {
  if (sync.autoClosingBlockers || !sync.blockedFiles.length) return;
  // Не завершаем сам Codex/ChatGPT: это оборвало бы текущую задачу и не является
  // безопасным способом освободить обычный проектный файл.
  const closable = sync.blockers.filter((item) => !/^(codex|chatgpt)$/i.test(String(item.name || '')));
  const pids = closable.map((item) => item.pid).filter(Boolean);
  if (!pids.length) return;
  sync.autoClosingBlockers = true;
  closeSyncSessions(pids).finally(() => { sync.autoClosingBlockers = false; });
}

function renderBlockerPanel() {
  const box = document.getElementById('sync-blocker-panel');
  if (!box) return;
  box.hidden = !sync.blockedFiles.length;
  if (!sync.blockedFiles.length) { box.innerHTML = ''; return; }
  const useful = sync.blockers.filter((item) => !/^(codex|chatgpt)$/i.test(String(item.name || '')));
  const grouped = [...useful.reduce((map, item) => {
    const key = `${item.type}:${String(item.name || '').toLowerCase()}`;
    const row = map.get(key) || { ...item, count: 0 };
    row.count += 1;
    if (!row.title && item.title) row.title = item.title;
    map.set(key, row);
    return map;
  }, new Map()).values()];
  const rows = grouped.slice(0, 4);
  const remaining = sync.closeResult?.remaining || [];
  const closeWarning = remaining.length ? `<div class="sync-close-warning">
    <b>Не закрылись: ${esc(remaining.map((item) => item.title || item.name || `PID ${item.pid}`).join(', '))}</b>
    <span>Можно закрыть принудительно, но несохранённые изменения пропадут.</span>
    <button id="sync-force-close" data-force-pids="${remaining.map((item) => item.pid).filter(Boolean).join(',')}">Закрыть принудительно</button>
  </div>` : '';
  box.innerHTML = `
    <div class="sync-blocker-title"><b>Освобождаю файлы</b><span>${sync.blockedFiles.length}</span></div>
    ${closeWarning}
    <div class="sync-blocked-files">${sync.blockedFiles.slice(0, 4).map((file) => `<span>${esc(syncShortPath(file.file || file.project))}</span>`).join('')}</div>
    ${rows.length ? `<div class="sync-blocked-apps">${rows.map((item) => `<span>${esc(item.name)}${item.count > 1 ? ` · ${item.count}` : ''}</span>`).join('')}</div>` : ''}
    <button class="btn sync-blocker-action" id="sync-close-and-retry" ${sync.blockersBusy ? 'disabled' : ''}>${sync.blockersBusy ? 'Закрываю…' : (rows.length ? 'Повторить автозакрытие' : 'Повторить')}</button>`;
  const continueButton = document.getElementById('sync-close-and-retry');
  if (continueButton) continueButton.onclick = () => {
    const pids = useful.map((item) => item.pid).filter(Boolean);
    if (pids.length) closeSyncSessions(pids);
    else if (sync.lastRequest) { sync.blockedFiles = []; runSyncOp(sync.lastRequest.mode, sync.lastRequest.only); }
  };
  const force = document.getElementById('sync-force-close');
  if (force) force.onclick = () => forceCloseSyncSessions(String(force.dataset.forcePids || '').split(',').map(Number).filter(Boolean));
}

async function finishBlockerClose(result, retryRequest, allowForce = true) {
  sync.blockersBusy = false;
  sync.closeResult = result;
  if (result?.remaining?.length) {
    sync.blockers = result.remaining.map((item) => ({ type: 'process', ...item }));
    sync.blockersChecked = true;
    const names = result.remaining.map((item) => item.title || item.name || `PID ${item.pid}`).join(', ');
    syncLog(`Не закрылись: ${names}`);
    if (allowForce) {
      syncLog(`Завершаю принудительно без дополнительного подтверждения: ${names}`);
      await forceCloseSyncSessions(result.remaining.map((item) => item.pid).filter(Boolean), retryRequest);
      return;
    }
    toast('Редактор не закрылся', names, 'warn', 8000);
    renderBlockerPanel();
    return;
  }
  sync.closeResult = null;
  if (retryRequest && !sync.busy) {
    sync.blockers = []; sync.blockersChecked = false;
    sync.blockedFiles = [];
    toast('Продолжаю', 'Повторяю передачу', 'ok', 2500);
    setTimeout(() => runSyncOp(retryRequest.mode, retryRequest.only, false), 350);
  } else {
    await refreshSyncBlockers();
    toast('Сессии закрыты', `${result?.closed || 0} процессов завершено`, 'ok', 3000);
  }
}

async function closeSyncSessions(pids) {
  if (!pids.length) return;
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

async function forceCloseSyncSessions(pids, retryOverride = null) {
  if (!pids.length) return;
  const retryRequest = retryOverride || (sync.blockedFiles.length && sync.lastRequest ? { ...sync.lastRequest } : null);
  sync.blockersBusy = true; renderBlockerPanel();
  try {
    const result = await window.arra.syncForceCloseBlockers(pids);
    if (!result?.ok && !result?.remaining?.length) {
      sync.blockersBusy = false; reportError('sync.blockers.force-close', new Error(result?.error || 'Не удалось завершить процессы'), { pids });
      toast('Сессии', result?.error || 'Не удалось завершить процессы', 'warn'); renderBlockerPanel(); return;
    }
    await finishBlockerClose(result, retryRequest, false);
  } catch (error) {
    sync.blockersBusy = false; reportError('sync.blockers.force-close', error, { pids });
    toast('Сессии', error.message || 'Не удалось завершить процессы', 'warn'); renderBlockerPanel();
  }
}

async function startRemoteTransfer(deviceId, mode) {
  const device = state.presence.devices.find((item) => item.id === deviceId);
  const title = mode === 'pull' ? 'Удалённое получение' : 'Удалённая выгрузка';
  if (!device?.online) { toast(title, 'Устройство сейчас не в сети', 'warn'); return; }
  const result = await window.arra.remoteSync(deviceId, mode);
  if (!result?.ok) { toast(title, result?.error || 'Команда не отправлена', 'warn'); return; }
  sync.remote[deviceId] = { name: device.name, type: 'starting', mode, pct: 0 };
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
  box.innerHTML = `<div class="sync-utility-head"><b>Другие устройства</b><span>удалённое управление переносом</span></div>${others.length ? others.map((device) => {
    const remote = sync.remote[device.id];
    const running = remote && !['done', 'error', 'closed'].includes(remote.type);
    return `<div class="sync-remote-row"><span class="dot ${device.online ? 'on' : ''}"></span><div><b>${esc(device.name || (device.role === 'laptop' ? 'Ноутбук' : 'ПК'))}</b><small>${running ? `${remote.mode === 'pull' ? 'получает с сервера' : 'отправляет на сервер'}${remote.pct ? ` · ${remote.pct}%` : '…'}` : (device.online ? 'в сети' : 'не в сети')}</small></div><span class="sync-remote-actions"><button data-remote-push="${esc(device.id)}" ${!device.online || running ? 'disabled' : ''}>На сервер</button><button data-remote-pull="${esc(device.id)}" ${!device.online || running ? 'disabled' : ''}>С сервера</button></span></div>`;
  }).join('') : '<div class="sync-utility-empty">Других устройств пока нет.</div>'}`;
  box.querySelectorAll('[data-remote-push]').forEach((button) => { button.onclick = () => startRemoteTransfer(button.dataset.remotePush, 'push'); });
  box.querySelectorAll('[data-remote-pull]').forEach((button) => { button.onclick = () => startRemoteTransfer(button.dataset.remotePull, 'pull'); });
}
function renderSyncViewBody() {
  if (document.querySelector('.sync-v3')) renderSyncV2Body();
  else renderSyncBody();
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
  document.getElementById('sync-safe').onclick = () => runSyncOp('sync', null);
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

function renderSyncJourney() {
  const box = document.getElementById('sync-journey');
  if (!box) return;
  const order = ['scan', 'files', 'transfer', 'verify'];
  const labels = ['Проверка', 'Файлы', 'Передача', 'Подтверждение'];
  const currentKey = sync.step === 'blocked' ? 'files' : (sync.step === 'error' ? sync.failedStep : sync.step);
  const activeIndex = sync.step === 'done' ? order.length : Math.max(0, order.indexOf(currentKey));
  box.innerHTML = order.map((key, index) => {
    let stateName = 'pending';
    let stateLabel = 'ждёт';
    if (sync.step === 'done' || index < activeIndex) { stateName = 'done'; stateLabel = 'готово'; }
    else if (sync.step === 'error' && index === activeIndex) { stateName = 'error'; stateLabel = 'ошибка'; }
    else if (sync.step === 'blocked' && key === 'files') { stateName = 'blocked'; stateLabel = 'нужно действие'; }
    else if (key === currentKey) { stateName = 'active'; stateLabel = 'идёт'; }
    return `<div class="sync-journey-step ${stateName}"><i>${stateName === 'done' ? '✓' : index + 1}</i><b>${labels[index]}</b><span>${stateLabel}</span></div>`;
  }).join('');
  const title = document.getElementById('sync-journey-title'); if (title) title.textContent = sync.phase || 'Готово';
  const detail = document.getElementById('sync-journey-detail');
  if (detail) { detail.textContent = sync.detail || ''; detail.hidden = !sync.detail; }
  const errors = document.getElementById('sync-errors-panel');
  if (errors) {
    errors.hidden = !sync.errors.length;
    const list = document.getElementById('sync-error-list');
    if (list) list.innerHTML = sync.errors.slice(-5).map((item) => `<div><b>${esc(item.file)}</b><span>${esc(item.error)}</span></div>`).join('');
    const count = document.getElementById('sync-error-count'); if (count) count.textContent = String(sync.errors.length);
  }
}

function updateSyncLive() {
  updateSyncLiveRich();
}

// ================= ПЕРЕДАЧА (как в веб-версии: статус, кнопки, проводник) =================

const SYNC_CONTAINERS = { Work: 'Работа', Tima: 'Личные', MAMA: 'Мама', Tools: 'Инструменты', root: 'Прочее в C:\\Claude' };
const syncOpenNodes = new Set(JSON.parse(localStorage.getItem('noda_pc_tree_open') || '["projects"]'));
const FOLDER_SVG = '<svg viewBox="0 0 24 24"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17z"/></svg>';
const FILE_SVG = '<svg viewBox="0 0 24 24"><path d="M7 4h7l4 4v12H7z"/><path d="M14 4v4h4"/></svg>';

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
    <div class="page-head">
      <h1>Передача</h1>
      <div class="grow"></div>
      <button class="btn ghost sm" id="sync-check">Проверить</button>
    </div>

    <div class="sync-v3">
      <div class="state-card" id="sync-state">
        <div class="state-row"><span class="state-glyph" id="sync-state-glyph">?</span>
          <div><b id="sync-journey-title">Ещё не сверял</b><p id="sync-journey-detail">Нажми «Проверить»</p></div>
          <time id="sync-time"></time>
        </div>
        <div class="sync-version-rail" id="sync-version-rail"></div>
        <div class="metrics" id="sync-metrics"></div>
        <div class="sync-progress" id="sync-progress" hidden>
          <div class="track" id="sync-track"><i id="sync-bar" style="width:0%"></i></div>
          <div class="sync-progress-line"><span id="sync-detail"></span><span id="sync-pct-value">0%</span></div>
          <div class="sync-scan-summary" id="sync-scan-summary" hidden></div>
          <div class="sync-progress-line dim"><span><span id="sync-speed-label">Скорость</span> <b id="sync-speed-value">—</b></span><span><span id="sync-eta-label">Осталось</span> <b id="sync-eta-value">—</b></span></div>
          <button class="sync-stop-link" id="sync-cancel" hidden>Прервать</button>
        </div>
      </div>

      <div id="sync-actions" class="sync-transfer-list"></div>

      <div class="sync-sessions" id="sync-sessions">
        <div class="sync-sessions-head">
          <b>Диалоги</b>
          <span id="sync-sessions-note"></span>
          <button class="sync-sessions-refresh" id="sync-sessions-refresh" title="Обновить список">↻</button>
        </div>
        <div class="sync-sessions-list" id="sync-sessions-list"><div class="sync-sessions-empty">Читаю список диалогов…</div></div>
      </div>

      <div id="sync-blocker-panel" class="sync-blocker-panel" hidden></div>
      <div id="sync-live" class="sync-live-compact" hidden></div>
      <div id="sync-errors-panel" class="sync-errors-panel" hidden>
        <div class="sync-errors-head"><b>Ошибки</b><span id="sync-error-count"></span></div>
        <div id="sync-error-list"></div>
        <button id="sync-open-logs">Открыть журнал</button>
      </div>

      <div id="sync-outcome" class="sync-outcome" hidden></div>
      <div class="tree" id="sync-tree"></div>
      <div id="sync-journey" hidden></div>
    </div>`;

  // Разметку раздела только что пересобрали: кэш дерева относится к прошлому
  // DOM, иначе проводник остаётся пустым при повторном входе.
  syncTreeMark = '';
  document.getElementById('sync-sessions-refresh').onclick = () => loadCodexSessions(true);
  document.getElementById('sync-open-logs').onclick = async () => {
    const result = await window.arra.openLogs();
    if (!result?.ok) { reportError('logs.open', new Error(result?.error || 'Не удалось открыть логи')); toast('Логи ошибок', result?.error || 'Не удалось открыть папку', 'warn'); }
  };
  document.getElementById('sync-cancel').onclick = async () => {
    await window.arra.syncCancel(); sync.busy = false; sync.indeterminate = false;
    sync.phase = 'Передача прервана'; sync.detail = 'Уже переданные файлы сохранены'; updateSyncStage(); renderSyncV2Body();
  };
  document.getElementById('sync-check').onclick = () => { toast('Передача', 'Сверяю с сервером…', 'info'); startSyncStatus(); };

  renderSyncV2Body(); renderBlockerPanel(); updateSyncStage(); updateSyncLive();
  void loadCodexSessions(Date.now() - sync.codexLoadedAt > 120000);
  if (!sync.info && !sync.busy) setTimeout(startSyncStatus, 120);
}

/* ---- Активные диалоги Codex и Claude ----
   Главное в переносе — не абстрактные «файлы», а живые диалоги. Показываем их
   списком: по каждому видно, что именно уехало в последнюю передачу. */
async function loadCodexSessions(force = false) {
  if (!force && sync.codexSessions.length) { renderCodexSessions(); return; }
  try {
    const rows = await window.arra.codexSessions();
    sync.codexSessions = Array.isArray(rows) ? rows : [];
    sync.codexLoadedAt = Date.now();
  } catch (error) { reportError('sync.codexSessions', error); sync.codexSessions = []; }
  renderCodexSessions();
}

/** Файлы последней передачи, относящиеся к конкретному диалогу. */
function sessionTransferFiles(session) {
  const id = String(session.id || '').toLowerCase();
  if (!id) return [];
  return (sync.lastResult?.files || []).filter((row) => String(row.file || '').toLowerCase().includes(id));
}

function renderCodexSessions() {
  const box = document.getElementById('sync-sessions-list');
  if (!box) return;
  const rows = sync.codexSessions;
  const note = document.getElementById('sync-sessions-note');
  if (note) note.textContent = rows.length ? `${rows.length}` : '';
  if (!rows.length) { box.innerHTML = '<div class="sync-sessions-empty">Активных диалогов не нашлось</div>'; return; }

  // Строка диалога: слева название, справа объём. Раскрывается по клику.
  const visible = sync.codexShowAll ? rows : rows.slice(0, 6);
  box.innerHTML = visible.map((session) => {
    const open = sync.codexOpen.has(session.id);
    const moved = sessionTransferFiles(session);
    const label = session.title && session.title !== 'Без названия'
      ? session.title
      : (session.project ? `Диалог в ${session.project}` : 'Диалог без названия');
    return `
      <div class="sync-session${open ? ' open' : ''}">
        <button class="sync-session-row" data-session="${esc(session.id)}">
          <img class="sync-session-logo" src="assets/merchants/${session.kind === 'claude' ? 'anthropic' : 'openai'}.png" alt="">
          <span class="sync-session-main"><b>${esc(label)}</b></span>
          ${moved.length ? `<span class="sync-session-moved">${moved[0].direction === 'pull' ? '↓' : '↑'} ${fmt(moved.length)}</span>` : ''}
          <span class="sync-session-size">${fmtB(session.size || 0)}</span>
          <span class="caret">›</span>
        </button>
        <div class="sync-session-body"><div>
          <div class="sync-session-file meta"><span>${esc(session.kind === 'claude' ? 'Claude' : 'Codex')}${session.project ? ` · ${esc(session.project)}` : ''}</span><small>${esc(syncAgo(session.updated))}</small></div>
          ${moved.length
            ? moved.slice(0, 8).map((row) => `<div class="sync-session-file"><i>${row.direction === 'pull' ? '↓' : '↑'}</i><span>${esc(syncShortPath(row.file))}</span><small>${fmtB(row.bytes || 0)}</small></div>`).join('')
              + (moved.length > 8 ? `<div class="sync-session-file more">…и ещё ${moved.length - 8}</div>` : '')
            : ''}
          ${session.cwd ? `<div class="sync-session-cwd">${esc(session.cwd.replace(/^\\\\\?\\/, ''))}</div>` : ''}
        </div></div>
      </div>`;
  }).join('') + (rows.length > visible.length
    ? `<button class="sync-sessions-more" id="sync-sessions-more">Показать все ${rows.length}</button>`
    : (sync.codexShowAll && rows.length > 6 ? '<button class="sync-sessions-more" id="sync-sessions-less">Свернуть</button>' : ''));

  box.querySelectorAll('[data-session]').forEach((button) => button.onclick = () => {
    const id = button.dataset.session;
    if (sync.codexOpen.has(id)) sync.codexOpen.delete(id); else sync.codexOpen.add(id);
    button.closest('.sync-session').classList.toggle('open');
  });
  const more = document.getElementById('sync-sessions-more');
  if (more) more.onclick = () => { sync.codexShowAll = true; renderCodexSessions(); };
  const less = document.getElementById('sync-sessions-less');
  if (less) less.onclick = () => { sync.codexShowAll = false; renderCodexSessions(); };
}

/** Строка в шапке: когда работа последний раз уезжала на сервер. */
function updateSyncLastLine() {
  const line = document.getElementById('sync-last');
  if (!line) return;
  const push = sync.info?.serverState?.lastPush;
  if (!push?.at) { line.textContent = sync.info ? 'На сервер ещё ничего не отправляли' : 'Состояние ещё не проверяли'; return; }
  const who = push.role === 'laptop' ? 'Ноутбук' : (push.device || 'Компьютер');
  const when = new Date(push.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  line.textContent = `На сервере — версия от ${when} (${who})`;
}

function syncAgo(value) {
  if (!value) return 'не было';
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return 'не было';
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
}

function syncDateTime(value) {
  if (!value) return 'данных пока нет';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'дата неизвестна';
  return date.toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(' г.', '');
}

function syncEventLine(event, emptyText) {
  if (!event?.at) return `<b>${esc(emptyText)}</b><small>После первой передачи здесь появится точная дата</small>`;
  const author = event.device || (event.role === 'laptop' ? 'Ноутбук' : 'Компьютер');
  const amount = event.files != null ? `${fileCount(event.files)} · ${fmtB(event.bytes || 0)}` : '';
  return `<b>${esc(syncDateTime(event.at))}</b><small>${esc(author)}${amount ? ` · ${esc(amount)}` : ''}</small>`;
}

function renderSyncV2Body() {
  const i = sync.info || {};
  const uploadBytes = sync.projects.reduce((n, p) => n + Number(p.uploadBytes || 0), 0);
  const downloadBytes = sync.projects.reduce((n, p) => n + Number(p.downloadBytes || 0), 0);
  const hasCheck = !!sync.info;
  const upload = Number(i.upload || 0);
  const download = Number(i.download || 0);

  // состояние — тем же языком, что в веб-версии
  // Кроме описания состояния даём прямую рекомендацию, что нажать: без неё
  // при изменениях с обеих сторон непонятно, с чего начинать.
  // Одна короткая строка вместо абзаца пояснений: числа и так видны в кнопках.
  const state = upload && download
    ? { kind: 'warn', mark: '⇄', title: 'Менялось с обеих сторон' }
    : upload ? { kind: 'local', mark: '↑', title: 'Актуальнее этот компьютер' }
      : download ? { kind: 'server', mark: '↓', title: 'Актуальнее сервер' }
        : hasCheck ? { kind: 'ok', mark: '✓', title: 'Версии совпадают' }
          : { kind: '', mark: '?', title: 'Ещё не сверял' };

  const card = document.getElementById('sync-state');
  if (card && !sync.busy) {
    card.className = `state-card ${state.kind}`;
    const glyph = document.getElementById('sync-state-glyph');
    const title = document.getElementById('sync-journey-title');
    const detail = document.getElementById('sync-journey-detail');
    if (glyph) glyph.textContent = state.mark;
    if (title) title.textContent = state.title;
    if (detail) { detail.textContent = ''; detail.hidden = true; }
    document.getElementById('sync-advice')?.remove();
  }

  // В центре рельса — дата версии, которая сейчас лежит на сервере. Это
  // единственная дата, которую действительно нужно видеть.
  const server = i.serverState || {};
  const rail = document.getElementById('sync-version-rail');
  if (rail) {
    const localFresh = upload > 0;
    const serverFresh = download > 0;
    const split = localFresh && serverFresh;
    const push = server.lastPush;
    const pushWhen = push?.at
      ? new Date(push.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).replace(' г.', '')
      : '';
    const pushWho = push?.at ? (push.role === 'laptop' ? 'Ноутбук' : (push.device || 'Компьютер')) : '';
    rail.innerHTML = `
      <div class="sync-version-node ${localFresh ? 'fresh' : ''} ${serverFresh && !localFresh ? 'older' : ''}">
        <i>${syncDeviceGlyph(sync.autoRole === 'laptop' ? 'laptop' : 'pc')}</i>
        <span><b>${esc(sync.deviceName || 'Это устройство')}</b><small>${fmt(i.localFiles || 0)} файлов</small></span>
      </div>
      <div class="sync-version-center ${split ? 'split' : localFresh ? 'to-server' : serverFresh ? 'to-local' : 'equal'}">
        <span class="sync-version-when">${pushWhen ? esc(pushWhen) : (hasCheck ? 'на сервер ещё не отправляли' : 'сверяю версии')}</span>
        ${pushWho ? '<small>версия на сервере</small>' : ''}
      </div>
      <div class="sync-version-node server ${serverFresh ? 'fresh' : ''} ${localFresh && !serverFresh ? 'older' : ''}">
        <i>${syncDeviceGlyph('server')}</i>
        <span><b>Сервер</b><small>${fmt(i.remoteFiles || 0)} файлов</small></span>
      </div>`;
  }
  const metrics = document.getElementById('sync-metrics');
  if (metrics) metrics.innerHTML = '';

  // Зелёным горит ровно одна кнопка — та, которую надо нажать сейчас. При
  // изменениях с обеих сторон первой всегда идёт отправка: так свои правки
  // не затираются серверными.
  const actions = document.getElementById('sync-actions');
  const pushClass = upload ? 'recommended' : 'inactive';
  const pullClass = download ? (upload ? 'ready' : 'recommended') : 'inactive';
  if (actions) actions.innerHTML = `
    <button class="sync-transfer-choice ${pushClass}" id="sync-push-all" ${hasCheck && upload ? '' : 'disabled'}>
      <i aria-hidden="true">↑</i>
      <span class="sync-choice-copy"><b>Отправить на сервер</b></span>
      ${hasCheck ? `<span class="sync-choice-total">${fileCount(upload)}<strong>${fmtB(uploadBytes)}</strong></span>` : ''}
    </button>
    <button class="sync-transfer-choice ${pullClass}" id="sync-pull-all" ${hasCheck && download ? '' : 'disabled'}>
      <i aria-hidden="true">↓</i>
      <span class="sync-choice-copy"><b>Забрать с сервера</b></span>
      ${hasCheck ? `<span class="sync-choice-total">${fileCount(download)}<strong>${fmtB(downloadBytes)}</strong></span>` : ''}
    </button>`;
  document.getElementById('sync-push-all').onclick = () => runSyncOp('push', null);
  document.getElementById('sync-pull-all').onclick = () => runSyncOp('pull', null);

  renderSyncOutcome();
  renderCodexSessions();
  renderSyncTree();
  renderBlockerPanel(); updateSyncStage(); updateSyncLive(); updateSyncLastLine();
}

/* ---- Итог передачи: аккуратный проводник «что уехало» ----
   Раньше итог показывался модалкой и пропадал вместе с ней. Теперь он живёт
   под кнопками: разделы → проекты → файлы, каждый блок раскрывается. */
const SYNC_SCOPE_TITLES = {
  projects: 'Проекты',
  claude: 'Память Claude',
  'codex-memory': 'Память Codex',
  'codex-sessions': 'Диалоги Codex',
  'codex-config': 'Настройки Codex',
  'codex-archive': 'Архив Codex',
};
const syncOutcomeOpen = new Set();

function renderSyncOutcome() {
  const box = document.getElementById('sync-outcome');
  if (!box) return;
  const result = sync.lastResult;
  if (!result) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;

  const pull = result.direction === 'pull';
  const groups = new Map();
  for (const row of result.files) {
    const scope = row.scope || (row.projectKey || '').split('/')[0] || 'projects';
    const scopeKey = SYNC_SCOPE_TITLES[scope] ? scope : 'projects';
    if (!groups.has(scopeKey)) groups.set(scopeKey, new Map());
    const projects = groups.get(scopeKey);
    const label = row.project || 'Прочее';
    const project = projects.get(label) || { label, files: 0, bytes: 0, rows: [] };
    project.files += 1;
    project.bytes += Number(row.bytes || 0);
    if (project.rows.length < 40) project.rows.push(row);
    projects.set(label, project);
  }

  const scopes = [...groups.entries()].map(([scope, projects]) => {
    const list = [...projects.values()].sort((a, b) => b.files - a.files);
    return {
      scope,
      title: SYNC_SCOPE_TITLES[scope] || 'Проекты',
      files: list.reduce((n, p) => n + p.files, 0),
      bytes: list.reduce((n, p) => n + p.bytes, 0),
      list,
    };
  }).sort((a, b) => b.files - a.files);

  box.innerHTML = `
    <div class="sync-outcome-head">
      <i class="${result.errors ? 'warn' : 'ok'}">${result.errors ? '!' : '✓'}</i>
      <div>
        <b>${pull ? 'Забрано с сервера' : 'Отправлено на сервер'}</b>
        <small>${fileCount(result.transferred)} · ${fmtB(result.bytes)} · ${fmtDuration(result.elapsed)}${result.errors ? ` · ошибок ${result.errors}` : ''}${result.skipped ? ` · пропущено ${result.skipped}` : ''}</small>
      </div>
      <time>${new Date(result.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time>
    </div>
    ${scopes.length ? `<div class="sync-outcome-scopes">${scopes.map((scope) => `
      <div class="sync-outcome-scope">
        <div class="sync-outcome-scope-head"><b>${esc(scope.title)}</b><span>${fileCount(scope.files)} · ${fmtB(scope.bytes)}</span></div>
        <div class="sync-outcome-projects">${scope.list.map((project) => {
          const id = `${scope.scope}|${project.label}`;
          const open = syncOutcomeOpen.has(id);
          return `
            <div class="sync-outcome-project${open ? ' open' : ''}">
              <button data-outcome="${esc(id)}">
                <span class="sync-outcome-dir ${pull ? 'down' : 'up'}">${pull ? '↓' : '↑'}</span>
                <span class="sync-outcome-name"><b>${esc(project.label)}</b><small>${fileCount(project.files)} · ${fmtB(project.bytes)}</small></span>
                <span class="caret">›</span>
              </button>
              <div class="sync-outcome-files"><div>
                ${project.rows.map((row) => `<div class="sync-outcome-file"><span>${esc(syncShortPath(row.file))}</span><small>${fmtB(row.bytes || 0)}</small></div>`).join('')}
                ${project.files > project.rows.length ? `<div class="sync-outcome-file more">…и ещё ${project.files - project.rows.length}</div>` : ''}
              </div></div>
            </div>`;
        }).join('')}</div>
      </div>`).join('')}</div>`
      : '<div class="sync-outcome-empty">Файлы не менялись — переносить было нечего</div>'}`;

  box.querySelectorAll('[data-outcome]').forEach((button) => button.onclick = () => {
    const id = button.dataset.outcome;
    if (syncOutcomeOpen.has(id)) syncOutcomeOpen.delete(id); else syncOutcomeOpen.add(id);
    button.closest('.sync-outcome-project').classList.toggle('open');
  });
}

/* ---------- проводник: разделы → контейнеры → проекты → папки ---------- */

function syncCounters({ upload = 0, download = 0, conflicts = 0, blocked = 0 }) {
  const parts = [];
  if (upload) parts.push(`<span class="tag up">↑ ${fmt(upload)}</span>`);
  if (download) parts.push(`<span class="tag down">↓ ${fmt(download)}</span>`);
  if (conflicts) parts.push(`<span class="tag warn">⇄ ${fmt(conflicts)}</span>`);
  if (blocked) parts.push(`<span class="tag warn">занято ${fmt(blocked)}</span>`);
  if (!parts.length) parts.push('<span class="tag mute">совпадает</span>');
  return `<span class="tags">${parts.join('')}</span>`;
}

let syncTreeMark = '';
function renderSyncTree(force = false) {
  const box = document.getElementById('sync-tree');
  if (!box) return;
  const projects = sync.projects || [];
  // список перестраиваем, только если состояние реально изменилось (иначе окно встаёт колом)
  const mark = `${projects.length}|${[...syncOpenNodes].join(',')}|${projects.map((p) => `${p.name}:${p.upload || 0}:${p.download || 0}:${p.localFiles || 0}`).join('|')}`;
  if (!force && mark === syncTreeMark) return;
  syncTreeMark = mark;
  const scopes = (sync.info?.scopes || []).filter((scope) => projects.some((p) => p.scope === scope.id) || scope.localFiles);
  if (!scopes.length) { box.innerHTML = ''; return; }

  box.innerHTML = scopes.map((scope) => {
    const rows = projects.filter((p) => p.scope === scope.id);
    const open = syncOpenNodes.has(scope.id);
    return `
      <div class="tree-scope tree-node${open ? ' open' : ''}">
        <button class="tree-row" data-toggle="${esc(scope.id)}">
          <span class="caret">›</span>
          <span class="folder-ic ${scope.id.startsWith('codex') || scope.id === 'claude' ? 'mem' : ''}">${FOLDER_SVG}</span>
          <span class="tree-main"><b>${esc(scope.label)}</b><small>${fmt(scope.localFiles || 0)} файлов здесь · ${fmt(scope.remoteFiles || 0)} на сервере</small></span>
          ${syncCounters(scope)}
        </button>
        <div class="tree-body"><div>${syncScopeChildren(scope, rows)}</div></div>
      </div>`;
  }).join('');

  box.querySelectorAll('[data-toggle]').forEach((button) => button.onclick = () => {
    const node = button.closest('.tree-node');
    const id = button.dataset.toggle;
    const open = node.classList.toggle('open');
    if (open) syncOpenNodes.add(id); else syncOpenNodes.delete(id);
    localStorage.setItem('noda_pc_tree_open', JSON.stringify([...syncOpenNodes]));
    renderSyncTree(true);
  });
}

function syncScopeChildren(scope, rows) {
  if (!rows.length) return '<div class="empty" style="padding:18px">Пусто</div>';
  if (scope.id !== 'projects') return rows.map((p) => syncProjectNode(p)).join('');
  const groups = new Map();
  for (const project of rows) {
    const parts = String(project.name || '').split('/');
    const key = parts.length > 1 ? parts[0] : 'root';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(project);
  }
  return [...groups.entries()].map(([key, items]) => {
    const id = `container:${key}`;
    const open = syncOpenNodes.has(id);
    const totals = items.reduce((acc, item) => ({
      upload: acc.upload + (item.upload || 0),
      download: acc.download + (item.download || 0),
      conflicts: acc.conflicts + (item.conflicts || 0),
      blocked: acc.blocked + (item.blocked || 0),
      files: acc.files + (item.localFiles || 0),
    }), { upload: 0, download: 0, conflicts: 0, blocked: 0, files: 0 });
    return `
      <div class="tree-node${open ? ' open' : ''}">
        <button class="tree-row" data-toggle="${esc(id)}">
          <span class="caret">›</span>
          <span class="folder-ic">${FOLDER_SVG}</span>
          <span class="tree-main"><b>${esc(SYNC_CONTAINERS[key] || key)}</b><small>${items.length} проектов · ${fmt(totals.files)} файлов</small></span>
          ${syncCounters(totals)}
        </button>
        <div class="tree-body"><div>${items.map((p) => syncProjectNode(p)).join('')}</div></div>
      </div>`;
  }).join('');
}

function syncProjectNode(project) {
  const id = `${project.scope}/${project.name}`;
  const open = syncOpenNodes.has(id);
  const folders = project.folders || [];
  const remote = project.remoteLatest ? new Date(project.remoteLatest * 1000).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  return `
    <div class="tree-node${open ? ' open' : ''}">
      <button class="tree-row" data-toggle="${esc(id)}">
        <span class="caret">${folders.length ? '›' : ''}</span>
        <span class="folder-ic">${FOLDER_SVG}</span>
        <span class="tree-main"><b>${esc(project.label)}</b><small>${fmt(project.localFiles || 0)} файлов${remote ? ` · на сервере ${remote}` : ' · на сервере нет'}</small></span>
        ${syncCounters(project)}
      </button>
      ${folders.length && open ? `<div class="tree-body"><div>${folders.slice(0, 40).map((folder) => `
        <div class="tree-row static">
          <span class="caret"></span>
          <span class="folder-ic file">${FILE_SVG}</span>
          <span class="tree-main"><b>${esc(folder.name || 'корень')}</b><small>${fmt(folder.files)} файлов · ${fmtB(folder.bytes)}</small></span>
          ${folder.blocked ? `<span class="tags"><span class="tag warn">занято ${fmt(folder.blocked)}</span></span>` : '<span class="tags"><span class="tag mute">готово</span></span>'}
        </div>`).join('')}${folders.length > 40 ? `<div class="tree-row static"><span></span><span></span><span class="tree-main"><small>…и ещё ${folders.length - 40} папок</small></span><span></span></div>` : ''}</div></div>` : ''}
    </div>`;
}

function syncDeviceGlyph(kind) {
  if (kind === 'laptop') return '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="11" rx="2"/><path d="M2.5 19h19M8 19l1-2h6l1 2"/></svg>';
  if (kind === 'server') return '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="7" rx="2"/><path d="M8 6.5h.01M8 17.5h.01M12 6.5h5M12 17.5h5"/></svg>';
  return '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8M12 16v5"/></svg>';
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
  const changed = state.presence.phone !== !!s.phoneOnline
    || state.presence.status?.deviceId !== s.deviceId
    || state.presence.status?.deviceProfile?.role !== s.deviceProfile?.role;
  state.presence.status = s;
  state.presence.phone = !!s.phoneOnline;
  if (changed && state.section && !document.querySelector('.sidebar.hidden')) renderNav();
});
window.arra.onFocusTerminal?.((payload) => { if (payload?.termId) activateAgentTerminal(payload.termId); });
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
