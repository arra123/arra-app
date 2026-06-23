const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execFile, spawn } = require('child_process');
const WebSocket = require('ws');

const BASE = 'https://aura.5.42.122.102.sslip.io';
const WS_URL = 'wss://aura.5.42.122.102.sslip.io/agent';

const SETTINGS_PATH = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH(), 'utf8')); } catch { return {}; }
}
function saveSettings() {
  try { fs.writeFileSync(SETTINGS_PATH(), JSON.stringify(settings, null, 2)); } catch {}
}

let settings = {};
let win = null;
let ws = null;
let reconnectTimer = null;
let online = false;
let manualClose = false;

function defaultFolder() { return path.join(app.getPath('downloads'), 'Arra'); }
function currentFolder() { return settings.folder || defaultFolder(); }
function currentMode() { return settings.mode || 'path'; }

// ---- Терминал / код ----
function defaultCodeRoot() {
  for (const p of ['C:\\Claude', 'C:\\Projects', app.getPath('home')]) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return app.getPath('home');
}
function codeRoot() { return settings.codeRoot || defaultCodeRoot(); }
let termCwd = null; // текущая папка сессии терминала
function getTermCwd() {
  if (!termCwd || !fs.existsSync(termCwd)) termCwd = codeRoot();
  return termCwd;
}

const procs = new Map(); // reqId -> ChildProcess (запущенные команды/Claude)

// Разрешаем любой путь на ПК (это личный компьютер пользователя).
// Пустой путь → null (значит «показать диски»). Относительный → от codeRoot.
function resolveFsPath(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? path.resolve(p) : path.resolve(codeRoot(), p);
}
function listDrives() {
  const drives = [];
  for (let i = 67; i <= 90; i++) { // C..Z
    const d = String.fromCharCode(i) + ':\\';
    try { if (fs.existsSync(d)) drives.push({ name: String.fromCharCode(i) + ':', dir: true, size: 0, path: d }); } catch {}
  }
  return drives;
}

// PowerShell-обёртка: UTF-8 вывод + сама команда
function psArgs(command) {
  const pre = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; ";
  return ['-NoProfile', '-NoLogo', '-NonInteractive', '-Command', pre + command];
}

// Запустить процесс и стримить вывод через send()
function runChild(reqId, command, cwd, send) {
  let child;
  try {
    // stdin = ignore: команды (в т.ч. claude -p) не зависают в ожидании ввода
    child = spawn('powershell.exe', psArgs(command), { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    send({ type: 'term_exit', reqId, code: -1, cwd: getTermCwd(), error: e.message });
    return;
  }
  procs.set(reqId, child);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => send({ type: 'term_out', reqId, chunk: d }));
  child.stderr.on('data', (d) => send({ type: 'term_out', reqId, chunk: d, err: true }));
  child.on('error', (e) => send({ type: 'term_out', reqId, chunk: '\n[ошибка запуска] ' + e.message + '\n', err: true }));
  child.on('close', (code) => {
    procs.delete(reqId);
    send({ type: 'term_exit', reqId, code: code == null ? -1 : code, cwd: getTermCwd() });
  });
}

// Обработать команду терминала (с поддержкой cd / clear)
function execTerminal(reqId, cmdline, send) {
  const cmd = (cmdline || '').trim();
  if (!cmd) { send({ type: 'term_exit', reqId, code: 0, cwd: getTermCwd() }); return; }

  // clear / cls
  if (/^(clear|cls)$/i.test(cmd)) {
    send({ type: 'term_clear', reqId });
    send({ type: 'term_exit', reqId, code: 0, cwd: getTermCwd() });
    return;
  }

  // cd — меняем папку сессии без запуска процесса
  const cdm = cmd.match(/^cd(?:\s+(.+))?$/i);
  if (cdm) {
    const arg = (cdm[1] || '').trim().replace(/^["']|["']$/g, '');
    let target;
    if (!arg || arg === '~') target = codeRoot();
    else target = path.resolve(getTermCwd(), arg);
    try {
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
        termCwd = target;
        send({ type: 'term_exit', reqId, code: 0, cwd: getTermCwd() });
      } else {
        send({ type: 'term_out', reqId, chunk: 'Папка не найдена: ' + target + '\n', err: true });
        send({ type: 'term_exit', reqId, code: 1, cwd: getTermCwd() });
      }
    } catch (e) {
      send({ type: 'term_out', reqId, chunk: e.message + '\n', err: true });
      send({ type: 'term_exit', reqId, code: 1, cwd: getTermCwd() });
    }
    return;
  }

  runChild(reqId, cmd, getTermCwd(), send);
}

// Задача для Claude Code (claude -p), prompt через временный файл (надёжное экранирование)
function execClaude(reqId, prompt, skip, send) {
  const text = (prompt || '').trim();
  if (!text) { send({ type: 'term_exit', reqId, code: 0, cwd: getTermCwd() }); return; }
  let tmp;
  try {
    tmp = path.join(os.tmpdir(), `arra_claude_${reqId}.txt`);
    fs.writeFileSync(tmp, text, 'utf8');
  } catch (e) {
    send({ type: 'term_out', reqId, chunk: 'Не удалось подготовить задачу: ' + e.message + '\n', err: true });
    send({ type: 'term_exit', reqId, code: -1, cwd: getTermCwd() });
    return;
  }
  const flags = skip ? ' --dangerously-skip-permissions' : '';
  const command =
    `$p = Get-Content -Raw -LiteralPath '${tmp.replace(/'/g, "''")}'; claude -p $p${flags}; Remove-Item -LiteralPath '${tmp.replace(/'/g, "''")}' -ErrorAction SilentlyContinue`;
  send({ type: 'term_out', reqId, chunk: `$ claude -p «${text.slice(0, 120)}${text.length > 120 ? '…' : ''}»${skip ? ' (без подтверждений)' : ''}\n` });
  runChild(reqId, command, getTermCwd(), send);
}

function cancelProc(reqId) {
  const child = reqId ? procs.get(reqId) : null;
  if (child) { try { child.kill(); } catch {} return true; }
  // без reqId — убить все
  if (!reqId) { for (const c of procs.values()) { try { c.kill(); } catch {} } procs.clear(); return true; }
  return false;
}

// ---- Файлы кода (в пределах codeRoot) ----
const TEXT_EXT = new Set(['.txt','.md','.js','.jsx','.ts','.tsx','.json','.css','.scss','.html','.xml','.yml','.yaml','.py','.java','.c','.cpp','.h','.cs','.go','.rs','.rb','.php','.sh','.bat','.ps1','.env','.gitignore','.sql','.toml','.ini','.conf','.log','.mjs','.cjs','.vue','.svelte']);

function fsList(reqId, p, send) {
  const abs = resolveFsPath(p);
  if (!abs) { // корень → список дисков
    send({ type: 'fs_list', reqId, path: '', root: codeRoot(), drives: true, entries: listDrives() });
    return;
  }
  try {
    const items = fs.readdirSync(abs, { withFileTypes: true });
    const entries = items
      .map((d) => {
        let size = 0;
        try { if (d.isFile()) size = fs.statSync(path.join(abs, d.name)).size; } catch {}
        return { name: d.name, dir: d.isDirectory(), size, path: path.join(abs, d.name) };
      })
      .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    send({ type: 'fs_list', reqId, path: abs, root: codeRoot(), parent: path.dirname(abs), entries });
  } catch (e) {
    send({ type: 'err', reqId, message: e.message });
  }
}

function fsRead(reqId, p, send) {
  const abs = resolveFsPath(p);
  if (!abs) { send({ type: 'err', reqId, message: 'Нет пути' }); return; }
  try {
    const st = fs.statSync(abs);
    if (st.size > 512 * 1024) { send({ type: 'err', reqId, message: 'Файл большой (>512 КБ) — скачай его' }); return; }
    const ext = path.extname(abs).toLowerCase();
    const editable = TEXT_EXT.has(ext) || st.size < 64 * 1024;
    const content = fs.readFileSync(abs, 'utf8');
    send({ type: 'fs_read', reqId, path: abs, content, editable });
  } catch (e) {
    send({ type: 'err', reqId, message: e.message });
  }
}

function fsWrite(reqId, p, content, send) {
  const abs = resolveFsPath(p);
  if (!abs) { send({ type: 'err', reqId, message: 'Нет пути' }); return; }
  try {
    fs.writeFileSync(abs, content != null ? String(content) : '', 'utf8');
    send({ type: 'fs_write', reqId, path: abs, ok: true });
  } catch (e) {
    send({ type: 'err', reqId, message: e.message });
  }
}

// Скачать файл с ПК В ПРИЛОЖЕНИЕ: грузим его на бэкенд /files (под JWT), он появится во вкладке «Файлы».
async function fsDownload(reqId, p, send) {
  const abs = resolveFsPath(p);
  if (!abs) { send({ type: 'err', reqId, message: 'Нет пути' }); return; }
  try {
    const st = fs.statSync(abs);
    if (st.size > 50 * 1024 * 1024) { send({ type: 'err', reqId, message: 'Файл больше 50 МБ' }); return; }
    const jwt = await getJwt();
    if (!jwt) { send({ type: 'err', reqId, message: 'Нет авторизации ПК' }); return; }
    await uploadFileToBackend(abs, jwt);
    send({ type: 'fs_download', reqId, path: abs, ok: true, name: path.basename(abs) });
  } catch (e) {
    send({ type: 'err', reqId, message: e.message });
  }
}

// multipart-загрузка файла на бэкенд (без сторонних либ)
function uploadFileToBackend(absPath, jwt) {
  return new Promise((resolve, reject) => {
    const boundary = '----arra' + Date.now().toString(16);
    const name = path.basename(absPath);
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`, 'utf8');
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const body = fs.readFileSync(absPath);
    const payload = Buffer.concat([head, body, tail]);
    const u = new URL(BASE + '/files');
    const req = https.request(u, {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': payload.length,
        Authorization: 'Bearer ' + jwt,
      },
    }, (res) => {
      let buf = '';
      res.on('data', (d) => (buf += d));
      res.on('end', () => { res.statusCode >= 400 ? reject(new Error('HTTP ' + res.statusCode)) : resolve(); });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ---- Настоящий терминал (PTY) через node-pty ----
// Несколько независимых сессий: ключ termId. 'local' — терминал самого ПК-приложения,
// '1'/'2'/'3'… — терминалы, открытые с телефона. У каждой свой процесс и папка.
let pty = null;
try { pty = require('node-pty'); } catch (e) { console.error('node-pty недоступен:', e.message); }
const ptys = new Map(); // termId -> { proc, cwd, local }

function startPty(termId, cols, rows, cwd, local) {
  if (!pty) return false;
  termId = termId || (local ? 'local' : '1');
  let s = ptys.get(termId);
  const wantCwd = (cwd && fs.existsSync(cwd)) ? cwd : (s ? s.cwd : codeRoot());
  if (s && s.proc) {
    // сессия уже есть — если просят другую папку, перезапускаем в ней
    if (cwd && wantCwd !== s.cwd) return restartPty(termId, cols, rows, wantCwd, local);
    return true;
  }
  let proc;
  try {
    proc = pty.spawn('powershell.exe', [], {
      name: 'xterm-256color',
      cols: cols || 100,
      rows: rows || 30,
      cwd: wantCwd,
      env: process.env,
    });
  } catch (e) {
    if (local) win?.webContents.send('pty-data', '\r\n[не удалось открыть терминал: ' + e.message + ']\r\n');
    return false;
  }
  s = { proc, cwd: wantCwd, local: !!local };
  ptys.set(termId, s);
  proc.onData((d) => {
    if (s.local) win?.webContents.send('pty-data', { termId, data: d });
    else { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ to: 'client', type: 'pty_out', termId, data: d })); } catch {} }
    // Claude Code (и др. TUI) звонит терминальным «беллом» (\x07) когда закончил/ждёт ввода.
    // Шлём телефону сигнал — там покажем уведомление «Claude закончил».
    if (!s.local && d.indexOf('\x07') >= 0) {
      try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ to: 'client', type: 'claude_done', termId })); } catch {}
    }
  });
  proc.onExit(() => {
    ptys.delete(termId);
    if (s.local) win?.webContents.send('pty-data', { termId, data: '\r\n[сессия завершена]\r\n' });
    else { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ to: 'client', type: 'pty_exit', termId })); } catch {} }
  });
  return true;
}
function ptyWrite(termId, d) { const s = ptys.get(termId || 'local'); if (s && s.proc) { try { s.proc.write(d); } catch {} } }
function ptyResize(termId, cols, rows) { const s = ptys.get(termId || 'local'); if (s && s.proc && cols && rows) { try { s.proc.resize(cols, rows); } catch {} } }
function killPty(termId) { const s = ptys.get(termId); if (s && s.proc) { try { s.proc.kill(); } catch {} } ptys.delete(termId); }
function restartPty(termId, cols, rows, cwd, local) {
  const s = ptys.get(termId);
  const keepCwd = (cwd && fs.existsSync(cwd)) ? cwd : (s ? s.cwd : null);
  if (s && s.proc) { try { s.proc.kill(); } catch {} }
  ptys.delete(termId);
  return startPty(termId, cols, rows, keepCwd, local || (s && s.local));
}

// Единый диспетчер релей-команд (msg от телефона ИЛИ от локального терминала ПК)
function handleRelay(msg, send) {
  switch (msg.type) {
    case 'hello':
      send({ type: 'cwd', cwd: getTermCwd(), root: codeRoot() });
      break;
    case 'pty_start':
      startPty(msg.termId || '1', msg.cols, msg.rows, msg.cwd, false);
      break;
    case 'pty_input':
      ptyWrite(msg.termId || '1', msg.data);
      break;
    case 'pty_resize':
      ptyResize(msg.termId || '1', msg.cols, msg.rows);
      break;
    case 'pty_kill':
      killPty(msg.termId || '1');
      break;
    case 'run':
      execTerminal(msg.reqId, msg.cmd, send);
      break;
    case 'claude':
      execClaude(msg.reqId, msg.prompt, !!msg.skip, send);
      break;
    case 'cancel':
      cancelProc(msg.reqId);
      break;
    case 'fs_list':
      fsList(msg.reqId, msg.path, send);
      break;
    case 'fs_read':
      fsRead(msg.reqId, msg.path, send);
      break;
    case 'fs_write':
      fsWrite(msg.reqId, msg.path, msg.content, send);
      break;
    case 'fs_download':
      fsDownload(msg.reqId, msg.path, send);
      break;
    default:
      break;
  }
}

// ---- HTTP ----
function httpJson(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const u = new URL(BASE + urlPath);
    const req = https.request(
      u,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': data.length } : {}),
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (d) => (buf += d));
        res.on('end', () => {
          try {
            const j = buf ? JSON.parse(buf) : {};
            if (res.statusCode >= 400) reject(new Error(j.error || j.message || 'HTTP ' + res.statusCode));
            else resolve(j);
          } catch (e) { reject(e); }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function downloadFile(fileId, dest, pcToken) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${BASE}/files/${fileId}/download?token=${pcToken}`);
    https
      .get(u, (res) => {
        if (res.statusCode >= 400) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return; }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve(dest)));
        out.on('error', reject);
      })
      .on('error', reject);
  });
}

function uniqueDest(folder, name) {
  fs.mkdirSync(folder, { recursive: true });
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let dest = path.join(folder, name);
  let i = 1;
  while (fs.existsSync(dest)) { dest = path.join(folder, `${base} (${i})${ext}`); i++; }
  return dest;
}

// ---- Буфер обмена ----
function copyToClipboard(dest, mime) {
  const mode = currentMode();
  if (mode === 'path') {
    clipboard.writeText(dest);
    return 'путь';
  }
  // mode === 'file'
  if ((mime || '').startsWith('image')) {
    const img = nativeImage.createFromPath(dest);
    if (!img.isEmpty()) { clipboard.writeImage(img); return 'картинка'; }
  }
  // не-картинка: кладём сам файл через PowerShell (CF_HDROP) — вставится в проводник/чат
  execFile('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', `Set-Clipboard -LiteralPath "${dest}"`], () => {});
  return 'файл';
}

async function handleNewFile(file) {
  try {
    const dest = uniqueDest(currentFolder(), file.original_name || `file_${file.id}`);
    await downloadFile(file.id, dest, settings.token);
    const what = copyToClipboard(dest, file.mime);
    // помечаем доставленным
    httpJson('POST', `/files/${file.id}/delivered?token=${settings.token}`, {}).catch(() => {});
    const rec = {
      id: file.id,
      name: path.basename(dest),
      path: dest,
      mime: file.mime || '',
      copied: what,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    };
    // сохраняем историю на диск
    settings.history = [rec, ...(settings.history || [])].slice(0, 60);
    saveSettings();
    win?.webContents.send('file-received', rec);
    // сообщаем телефону путь сохранённого файла — чтобы вставить его в терминал
    try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ to: 'client', type: 'file_saved', name: rec.name, path: dest })); } catch {}
    if (Notification.isSupported()) {
      new Notification({ title: 'Arra · файл получен', body: `${rec.name} — в буфере (${what})` }).show();
    }
  } catch (e) {
    win?.webContents.send('file-error', { message: e.message });
  }
}

// ---- WebSocket ----
function pushStatus() {
  win?.webContents.send('status', {
    online,
    paired: !!settings.token,
    deviceName: settings.deviceName || '',
    login: settings.login || '',
    folder: currentFolder(),
    mode: currentMode(),
  });
}

function connectWS() {
  clearTimeout(reconnectTimer);
  if (!settings.token) return;
  try { ws?.close(); } catch {}
  ws = new WebSocket(`${WS_URL}?token=${settings.token}`);
  ws.on('open', () => { online = true; pushStatus(); });
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'new_file' && msg.file) { handleNewFile(msg.file); return; }
      // Релей-команды с телефона (терминал/файлы/Claude)
      if (msg.to === 'pc') {
        const send = (o) => { try { ws.send(JSON.stringify({ to: 'client', ...o })); } catch {} };
        handleRelay(msg, send);
      }
    } catch {}
  });
  ws.on('close', () => {
    online = false;
    pushStatus();
    if (!manualClose) reconnectTimer = setTimeout(connectWS, 3000);
  });
  ws.on('error', () => { /* close последует */ });
}

// ---- Окно ----
function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 720,
    minHeight: 560,
    frame: false,
    backgroundColor: '#08090A',
    title: 'Arra',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { pushStatus(); win.show(); });
}

app.whenReady().then(() => {
  settings = loadSettings();
  createWindow();
  if (settings.token) connectWS();
});

app.on('window-all-closed', () => { manualClose = true; try { ws?.close(); } catch {} app.quit(); });

// ---- IPC ----
ipcMain.handle('get-status', () => ({
  online,
  paired: !!settings.token,
  hasAuth: !!(settings.jwt || (settings.login && settings.password)),
  deviceName: settings.deviceName || '',
  login: settings.login || '',
  folder: currentFolder(),
  mode: currentMode(),
}));

ipcMain.handle('login', async (_e, { login, password, deviceName }) => {
  try {
    const auth = await httpJson('POST', '/auth/login', { login, password });
    if (!auth.token) throw new Error('Неверный логин или пароль');
    settings.jwt = auth.token;
    settings.login = login;
    settings.password = password;
    // Переиспользуем токен этого ПК, если он уже есть — иначе плодятся дубли «Мой ПК»
    if (!settings.token) {
      const dev = await httpJson('POST', '/pc/token', { name: deviceName || 'Мой ПК' }, auth.token);
      settings.token = dev.pcToken.token;
      settings.deviceId = dev.pcToken.id;
      settings.deviceName = dev.pcToken.name;
    } else if (deviceName) {
      settings.deviceName = deviceName;
    }
    if (!settings.folder) settings.folder = defaultFolder();
    if (!settings.mode) settings.mode = 'path';
    saveSettings();
    manualClose = false;
    connectWS();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('choose-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: currentFolder() });
  if (r.canceled || !r.filePaths[0]) return currentFolder();
  settings.folder = r.filePaths[0];
  saveSettings();
  pushStatus();
  return settings.folder;
});

ipcMain.handle('set-mode', (_e, mode) => { settings.mode = mode === 'file' ? 'file' : 'path'; saveSettings(); return settings.mode; });
ipcMain.handle('get-history', () => settings.history || []);

// Получить/обновить JWT (вход), если нужно
async function getJwt() {
  if (settings.jwt) return settings.jwt;
  if (settings.login && settings.password) {
    const a = await httpJson('POST', '/auth/login', { login: settings.login, password: settings.password });
    settings.jwt = a.token;
    saveSettings();
    return settings.jwt;
  }
  return null;
}

// Универсальный авторизованный запрос к бэкенду (финансы/заметки/помощник) — под JWT, с авто-перевходом
ipcMain.handle('api', async (_e, { method, path, body }) => {
  try {
    let jwt = await getJwt();
    try {
      const data = await httpJson(method || 'GET', path, body, jwt);
      return { ok: true, data };
    } catch (err) {
      // токен протух/не тот — обновляем и повторяем один раз
      settings.jwt = null;
      jwt = await getJwt();
      if (!jwt) throw err;
      const data = await httpJson(method || 'GET', path, body, jwt);
      return { ok: true, data };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('open-folder', () => shell.openPath(currentFolder()));
ipcMain.handle('open-path', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('copy-path', (_e, p) => { clipboard.writeText(p); return true; });
ipcMain.handle('recopy', (_e, f) => copyToClipboard(f.path, f.mime));
ipcMain.handle('logout', () => {
  manualClose = true;
  try { ws?.close(); } catch {}
  delete settings.token; delete settings.deviceId; delete settings.jwt; delete settings.password;
  saveSettings();
  online = false;
  pushStatus();
  return { ok: true };
});

// ---- Терминал/код: локальное использование самим ПК-приложением ----
ipcMain.on('term', (_e, msg) => {
  if (!msg || typeof msg !== 'object') return;
  handleRelay(msg, (o) => win?.webContents.send('term-event', o));
});

ipcMain.handle('get-code-root', () => codeRoot());
ipcMain.handle('choose-code-root', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: codeRoot() });
  if (r.canceled || !r.filePaths[0]) return codeRoot();
  settings.codeRoot = r.filePaths[0];
  termCwd = settings.codeRoot;
  saveSettings();
  return settings.codeRoot;
});

// PTY для локальных терминалов ПК-приложения (termId = 'L1','L2'… ; есть выбор папки cwd)
ipcMain.handle('pty-start', (_e, { cols, rows, termId, cwd } = {}) => startPty(termId || 'L1', cols, rows, cwd || null, true));
ipcMain.on('pty-input', (_e, { d, termId } = {}) => ptyWrite(termId || 'L1', d));
ipcMain.on('pty-resize', (_e, { cols, rows, termId } = {}) => ptyResize(termId || 'L1', cols, rows));
ipcMain.on('pty-restart', (_e, { cols, rows, termId } = {}) => restartPty(termId || 'L1', cols, rows, null, true));
ipcMain.on('pty-kill', (_e, { termId } = {}) => killPty(termId || 'L1'));

ipcMain.on('win-min', () => win?.minimize());
ipcMain.on('win-close', () => { manualClose = true; try { ws?.close(); } catch {} app.quit(); });
