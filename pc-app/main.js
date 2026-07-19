const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage, shell, Notification, desktopCapturer, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { execFile, spawn, spawnSync } = require('child_process');
const WebSocket = require('ws');
const { initUpdater, checkNow: checkUpdatesNow } = require('./updater');

const BASE = 'https://aura.5.42.122.102.sslip.io';
const WS_URL = 'wss://aura.5.42.122.102.sslip.io/agent';
const CLIENT_WS_URL = 'wss://aura.5.42.122.102.sslip.io/client';

// Постоянный JSONL-журнал. Он нужен именно для случаев, когда окно уже закрылось
// или операция зависла: записи остаются на диске и не пропадают вместе с UI.
function logsDir() {
  try { return path.join(app.getPath('userData'), 'logs'); }
  catch { return path.join(os.tmpdir(), 'Noda', 'logs'); }
}
function logPath(date = new Date()) {
  return path.join(logsDir(), `noda-${date.toISOString().slice(0, 10)}.jsonl`);
}
function redactLogText(value) {
  return String(value ?? '')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/ig, '$1<redacted>')
    .replace(/([?&](?:token|jwt|password|secret|key)=)[^&\s]+/ig, '$1<redacted>')
    .replace(/((?:token|jwt|password|secret|api[_-]?key)\s*[:=]\s*)[^,;\s"']+/ig, '$1<redacted>');
}
function sanitizeLogValue(value, depth = 0) {
  if (depth > 5) return '[max-depth]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactLogText(value).slice(0, 12000);
  if (value instanceof Error) return { name: value.name, message: redactLogText(value.message), stack: redactLogText(value.stack || '') };
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitizeLogValue(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 200)) {
      out[key] = /token|jwt|password|secret|authorization|api[_-]?key/i.test(key)
        ? '<redacted>'
        : sanitizeLogValue(item, depth + 1);
    }
    return out;
  }
  return redactLogText(value);
}
function writeLog(level, source, payload = {}) {
  try {
    fs.mkdirSync(logsDir(), { recursive: true });
    const row = { at: new Date().toISOString(), level, source, pid: process.pid, payload: sanitizeLogValue(payload) };
    fs.appendFileSync(logPath(), JSON.stringify(row) + '\n', 'utf8');
  } catch (error) {
    try { console.error('[logger]', error); } catch {}
  }
}
function pruneLogs() {
  try {
    fs.mkdirSync(logsDir(), { recursive: true });
    const cutoff = Date.now() - 21 * 24 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(logsDir())) {
      if (!/^noda-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) continue;
      const full = path.join(logsDir(), name);
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    }
  } catch (error) { writeLog('warn', 'logger.prune', error); }
}

process.on('uncaughtException', (error) => {
  writeLog('fatal', 'main.uncaughtException', error);
  setTimeout(() => { try { app.exit(1); } catch { process.exit(1); } }, 50);
});
process.on('unhandledRejection', (error) => writeLog('error', 'main.unhandledRejection', error));

const SETTINGS_PATH = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH(), 'utf8')); } catch { return {}; }
}
function saveSettings() {
  try { fs.writeFileSync(SETTINGS_PATH(), JSON.stringify(settings, null, 2)); } catch {}
}

let settings = {};
let win = null;
let captureWin = null;
// Безопасная отправка в окно: если окно уже уничтожено (закрыли приложение, а WS ещё шлёт) —
// НЕ падаем с «Object has been destroyed», а молча пропускаем.
function winSend(channel, payload) {
  try {
    if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  } catch {}
}
let ws = null;
let reconnectTimer = null;
let online = false;
let manualClose = false;
let phoneOnline = false;
let agentDeviceId = null;
let phonePresenceTimer = null;
function markPhonePresence() {
  phoneOnline = true;
  clearTimeout(phonePresenceTimer);
  phonePresenceTimer = setTimeout(() => { phoneOnline = false; pushStatus(); }, 15000);
  pushStatus();
}

function defaultFolder() { return path.join(app.getPath('downloads'), 'Noda'); }
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
function localSyncInventory() {
  const root = codeRoot();
  const ignored = new Set(['node_modules', '.git', '.idea', '.vscode', 'dist', 'build', '.expo', '__pycache__']);
  const containers = new Set(['Work', 'Tima', 'MAMA', 'Tools']);
  const readDirs = (dir) => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !ignored.has(entry.name) && !entry.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    } catch { return []; }
  };
  const directFiles = (dir) => {
    try { return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile()).length; }
    catch { return 0; }
  };
  const projectMeta = (dir) => {
    const has = (name) => { try { return fs.existsSync(path.join(dir, name)); } catch { return false; } };
    const hasFileWith = (suffix) => { try { return fs.readdirSync(dir).some((name) => name.toLowerCase().endsWith(suffix)); } catch { return false; } };
    let kind = 'folder';
    if (has('package.json')) kind = 'javascript';
    else if (has('pyproject.toml') || has('requirements.txt')) kind = 'python';
    else if (has('Cargo.toml')) kind = 'rust';
    else if (has('go.mod')) kind = 'go';
    else if (hasFileWith('.sln') || hasFileWith('.csproj')) kind = 'dotnet';
    let updatedAt = 0;
    try { updatedAt = fs.statSync(dir).mtimeMs || 0; } catch {}
    return { kind, updatedAt, git: has('.git') };
  };
  const candidates = [];
  for (const entry of readDirs(root)) {
    const full = path.join(root, entry.name);
    if (containers.has(entry.name)) {
      for (const child of readDirs(full)) candidates.push({ key: `${entry.name}/${child.name}`, label: child.name, full: path.join(full, child.name), group: entry.name });
    } else {
      candidates.push({ key: entry.name, label: entry.name, full, group: '' });
    }
  }
  const projects = candidates.map((project) => {
    const folders = readDirs(project.full).slice(0, 18).map((folder) => {
      const full = path.join(project.full, folder.name);
      return { name: folder.name, inventoryFiles: directFiles(full), subfolders: readDirs(full).length, files: 0 };
    });
    return {
      name: project.key, label: project.label, group: project.group, scope: 'projects', scopeId: 'projects',
      path: project.full, ...projectMeta(project.full), inventoryFiles: directFiles(project.full), files: 0, folders,
    };
  });
  return {
    root,
    scopes: [{ id: 'projects', label: 'Проекты', inventoryFiles: projects.length, files: 0 }],
    projects,
    items: [],
    localOnly: true,
  };
}
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

// Определяем форм-фактор без доступа к экрану, камере или пользовательским данным.
// Наличие батареи — самый надёжный признак ноутбука; chassis используется как
// дополнительная подсказка. Результат лишь предлагается и может быть исправлен в UI.
let deviceProfileCache = null;
let deviceKeyCache = null;
function detectDeviceProfile() {
  if (deviceProfileCache) return deviceProfileCache;
  const fallback = {
    role: 'pc', confidence: 'low', reason: 'форм-фактор не определён',
    hostname: os.hostname(), manufacturer: '', model: '', hasBattery: false,
  };
  if (process.platform !== 'win32') return (deviceProfileCache = fallback);
  try {
    const script = [
      "$b = @(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue)",
      "$e = Get-CimInstance Win32_SystemEnclosure -ErrorAction SilentlyContinue | Select-Object -First 1",
      "$c = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue | Select-Object -First 1",
      "[pscustomobject]@{hasBattery=($b.Count -gt 0);chassis=@($e.ChassisTypes);manufacturer=$c.Manufacturer;model=$c.Model;systemType=$c.PCSystemType;systemTypeEx=$c.PCSystemTypeEx}|ConvertTo-Json -Compress",
    ].join('\n');
    const result = spawnSync('powershell.exe', psArgs(script), { encoding: 'utf8', windowsHide: true, timeout: 7000 });
    const data = JSON.parse(String(result.stdout || '').trim() || '{}');
    const chassis = (Array.isArray(data.chassis) ? data.chassis : [data.chassis]).map(Number).filter(Boolean);
    const laptopTypes = new Set([8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32]);
    const desktopTypes = new Set([3, 4, 5, 6, 7, 13, 15, 16, 24, 35, 36]);
    const chassisLaptop = chassis.some((n) => laptopTypes.has(n));
    const chassisDesktop = chassis.some((n) => desktopTypes.has(n));
    const hasBattery = !!data.hasBattery;
    const systemType = Number(data.systemTypeEx || data.systemType || 0);
    const systemLaptop = systemType === 2;
    const systemDesktop = systemType === 1 || systemType === 3;
    // Win32_Battery может видеть ИБП стационарного ПК как батарею. Системный
    // тип и тип корпуса поэтому имеют приоритет, а батарея — только запасной сигнал.
    const role = systemLaptop || chassisLaptop
      ? 'laptop'
      : (systemDesktop || chassisDesktop ? 'pc' : (hasBattery ? 'laptop' : 'pc'));
    deviceProfileCache = {
      role,
      confidence: systemLaptop || systemDesktop ? 'high' : (chassis.length ? 'high' : (hasBattery ? 'medium' : 'low')),
      reason: systemLaptop
        ? 'Windows определил мобильный компьютер'
        : (systemDesktop
          ? 'Windows определил стационарный компьютер'
          : (chassisLaptop
            ? 'тип корпуса соответствует ноутбуку'
            : (chassisDesktop ? 'тип корпуса соответствует стационарному ПК' : (hasBattery ? 'обнаружена встроенная батарея' : 'признаки ноутбука не найдены')))),
      hostname: os.hostname(),
      manufacturer: String(data.manufacturer || ''),
      model: String(data.model || ''),
      hasBattery,
      chassis,
      systemType,
    };
  } catch {
    deviceProfileCache = fallback;
  }
  return deviceProfileCache;
}

// MachineGuid остаётся тем же после обновлений Noda и различается у ноутбука и
// стационарного ПК. На сервер уходит только необратимый SHA-256, сам GUID не
// сохраняется и не попадает в логи.
function deviceKey() {
  if (deviceKeyCache) return deviceKeyCache;
  let source = '';
  if (process.platform === 'win32') {
    try {
      const result = spawnSync('reg.exe', [
        'query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid',
      ], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      const match = String(result.stdout || '').match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
      source = String(match?.[1] || '').trim();
    } catch {}
  }
  if (!source) {
    const profile = detectDeviceProfile();
    source = [os.hostname(), profile.manufacturer, profile.model, os.arch()].join('|');
  }
  deviceKeyCache = crypto.createHash('sha256').update(`noda-device-v1|${source}`).digest('hex');
  return deviceKeyCache;
}

function automaticDeviceName(profile = detectDeviceProfile()) {
  const prefix = profile.role === 'laptop' ? 'Ноутбук' : 'Компьютер';
  const host = String(profile.hostname || os.hostname() || '').trim();
  return host ? `${prefix} · ${host}` : prefix;
}

function resolvedDeviceName(requested, profile = detectDeviceProfile()) {
  const value = String(requested || settings.deviceName || '').trim();
  const legacyAutomatic = /^(?:(?:мой\s*)?(?:пк|компьютер)|ноутбук|pc)(?:\s*[·-]\s*.+)?$/i;
  if (!value || legacyAutomatic.test(value)) return automaticDeviceName(profile);
  return value.slice(0, 100);
}

async function registerCurrentDevice(jwt, requestedName) {
  const profile = detectDeviceProfile();
  const name = resolvedDeviceName(requestedName, profile);
  const dev = await httpJson('POST', '/pc/token', {
    name,
    deviceKey: deviceKey(),
    role: profile.role,
    hostname: profile.hostname || os.hostname(),
    platform: `${process.platform}-${process.arch}`,
    existingToken: settings.token || null,
  }, jwt);
  if (!dev?.pcToken?.token) throw new Error('Сервер не вернул токен устройства');
  const tokenChanged = settings.token && settings.token !== dev.pcToken.token;
  settings.token = dev.pcToken.token;
  settings.deviceId = dev.pcToken.id;
  settings.deviceName = dev.pcToken.name || name;
  saveSettings();
  writeLog('info', 'device.registered', {
    deviceId: settings.deviceId, role: profile.role, hostname: profile.hostname, tokenChanged: !!tokenChanged,
  });
  return dev.pcToken;
}

async function refreshCurrentDeviceRegistration(requestedName) {
  let jwt = await getJwt();
  if (!jwt) return null;
  try {
    return await registerCurrentDevice(jwt, requestedName);
  } catch (firstError) {
    if (!settings.login || !settings.password) throw firstError;
    settings.jwt = null;
    jwt = await getJwt();
    if (!jwt) throw firstError;
    return registerCurrentDevice(jwt, requestedName);
  }
}

// Запустить процесс и стримить вывод через send()
function runChild(reqId, command, cwd, send) {
  let child;
  try {
    // stdin = ignore: команды (в т.ч. claude -p) не зависают в ожидании ввода
    child = spawn('powershell.exe', psArgs(command), { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    writeLog('error', 'terminal.spawn', { reqId, cwd, error: e });
    send({ type: 'term_exit', reqId, code: -1, cwd: getTermCwd(), error: e.message });
    return;
  }
  procs.set(reqId, child);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => send({ type: 'term_out', reqId, chunk: d }));
  child.stderr.on('data', (d) => {
    writeLog('error', 'terminal.stderr', { reqId, cwd, message: String(d) });
    send({ type: 'term_out', reqId, chunk: d, err: true });
  });
  child.on('error', (e) => {
    writeLog('error', 'terminal.process', { reqId, cwd, error: e });
    send({ type: 'term_out', reqId, chunk: '\n[ошибка запуска] ' + e.message + '\n', err: true });
  });
  child.on('close', (code) => {
    procs.delete(reqId);
    if (code) writeLog('error', 'terminal.exit', { reqId, cwd, code });
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

// Предпросмотр файла на телефоне БЕЗ отправки: читаем картинку/PDF и шлём base64.
const PREVIEW_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.heic': 'image/heic', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};
function fsPreview(reqId, p, send) {
  const abs = resolveFsPath(p);
  if (!abs) { send({ type: 'err', reqId, message: 'Нет пути' }); return; }
  try {
    const st = fs.statSync(abs);
    const ext = path.extname(abs).toLowerCase();
    const mime = PREVIEW_MIME[ext] || 'application/octet-stream';
    if (st.size > 18 * 1024 * 1024) { send({ type: 'err', reqId, message: 'Файл большой (>18 МБ) — лучше скачать' }); return; }
    const data = fs.readFileSync(abs).toString('base64');
    send({ type: 'fs_preview', reqId, path: abs, mime, name: path.basename(abs), data });
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

// Заархивировать папку (встроенный Compress-Archive, без сторонних установок) и отправить в приложение
async function fsZip(reqId, p, send) {
  const abs = resolveFsPath(p);
  if (!abs) { send({ type: 'err', reqId, message: 'Нет пути' }); return; }
  let dir;
  try {
    if (!fs.statSync(abs).isDirectory()) { send({ type: 'err', reqId, message: 'Это не папка' }); return; }
    const name = path.basename(abs) + '.zip';
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arrazip-'));
    const tmp = path.join(dir, name);
    await new Promise((resolve, reject) => {
      const ps = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-NonInteractive', '-Command',
        `Compress-Archive -Path "${abs.replace(/"/g, '""')}" -DestinationPath "${tmp.replace(/"/g, '""')}" -Force`],
        { windowsHide: true });
      let err = '';
      ps.stderr.on('data', (d) => (err += d));
      ps.on('error', reject);
      ps.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || ('код ' + code)))));
    });
    const size = fs.statSync(tmp).size;
    if (size > 200 * 1024 * 1024) { send({ type: 'err', reqId, message: 'Архив больше 200 МБ' }); return; }
    const jwt = await getJwt();
    if (!jwt) { send({ type: 'err', reqId, message: 'Нет авторизации ПК' }); return; }
    await uploadFileToBackend(tmp, jwt);
    send({ type: 'fs_zip', reqId, ok: true, name });
  } catch (e) {
    send({ type: 'err', reqId, message: 'Архивация: ' + e.message });
  } finally {
    try { if (dir) fs.rmSync(dir, { recursive: true, force: true }); } catch {}
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
try { pty = require('node-pty'); } catch (e) { writeLog('error', 'pty.module', e); console.error('node-pty недоступен:', e.message); }
const ptys = new Map(); // termId -> { proc, cwd, local, buf }

// Отправить сообщение телефону (если подключён)
function wsSend(o) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch {} }

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
    writeLog('error', 'pty.spawn', { termId, cwd: wantCwd, error: e });
    if (local) winSend('pty-data', '\r\n[не удалось открыть терминал: ' + e.message + ']\r\n');
    return false;
  }
  s = { proc, cwd: wantCwd, local: !!local, buf: '', owner: local ? 'pc' : 'phone' };
  ptys.set(termId, s);
  // ОБЩАЯ сессия: вывод идёт И в окно ПК, И на телефон одновременно. Так можно начать
  // работу в приложении на ПК и продолжить ту же сессию с телефона (и наоборот).
  proc.onData((d) => {
    s.buf += d;
    if (s.buf.length > 120000) s.buf = s.buf.slice(-100000); // буфер прокрутки для подключения
    winSend('pty-data', { termId, data: d });
    wsSend({ to: 'client', type: 'pty_out', termId, data: d });
  });
  proc.onExit(() => {
    if (s.exitNotified || ptys.get(termId) !== s) return;
    s.exitNotified = true;
    ptys.delete(termId);
    winSend('pty-data', { termId, data: '\r\n[сессия завершена]\r\n' });
    winSend('pty-exit', { termId });
    wsSend({ to: 'client', type: 'pty_exit', termId });
  });
  // сообщаем телефону, что появилась новая сессия (чтобы он мог показать её в списке)
  wsSend({ to: 'client', type: 'pty_opened', termId, cwd: wantCwd });
  return true;
}
// Размер PTY держит ВЛАДЕЛЕЦ (кто создал сессию): ПК-терминал — под ПК, телефонный — под телефон.
// Чужие ресайзы игнорируем, поэтому подключение второго устройства НЕ ломает размер у первого.
function ptyWrite(termId, d) {
  const s = ptys.get(termId || 'local'); if (!s || !s.proc) return;
  try { s.proc.write(d); } catch {}
}
function ptyResize(termId, cols, rows, side) {
  const s = ptys.get(termId || 'local'); if (!s || !s.proc || !cols || !rows) return;
  if (side && s.owner && side !== s.owner) return; // не владелец — не меняем размер
  try { s.proc.resize(cols, rows); } catch {}
}
// Текущий размер сессии — чтобы подключившийся зритель подстроил свой xterm под него
function ptySize(termId) { const s = ptys.get(termId); return s && s.proc ? { cols: s.proc.cols, rows: s.proc.rows } : null; }
function killPty(termId) {
  const s = ptys.get(termId);
  if (!s) return false;
  s.exitNotified = true;
  if (ptys.get(termId) === s) ptys.delete(termId);
  winSend('pty-data', { termId, data: '\r\n[сессия завершена]\r\n' });
  winSend('pty-exit', { termId });
  wsSend({ to: 'client', type: 'pty_exit', termId });
  if (s.proc) { try { s.proc.kill(); } catch (error) { writeLog('error', 'pty.kill', { termId, pid: s.proc.pid, error }); } }
  return true;
}
function restartPty(termId, cols, rows, cwd, local) {
  const s = ptys.get(termId);
  const keepCwd = (cwd && fs.existsSync(cwd)) ? cwd : (s ? s.cwd : null);
  if (s) {
    s.exitNotified = true;
    if (s.proc) { try { s.proc.kill(); } catch {} }
    if (ptys.get(termId) === s) ptys.delete(termId);
  }
  return startPty(termId, cols, rows, keepCwd, local || (s && s.local));
}

// Единый диспетчер релей-команд (msg от телефона ИЛИ от локального терминала ПК)
// ---- Удалённый экран (трансляция + управление мышью) ----
let screenTimer = null;
let captureFallbackTimer = null;
let captureWindowReady = false;
let captureWindowConfig = null;
let pendingCaptureSignals = [];
let rtcCaptureConnected = false;
// A persistent Chromium capture stream is substantially faster than requesting
// a brand-new desktopCapturer thumbnail for every frame. Keep the latter only as
// a compatibility fallback for machines where desktop media capture is blocked.
let screenCfg = { displayId: null, quality: 76, fps: 30, width: 2560, rtc: true };
let screenBusy = false;
let lastCaptureMs = 0;
let captureEngine = 'electron';
let captureFailures = 0;
let captureFrames = 0;
let captureDropped = 0;
let captureBytes = 0;
let captureStartedAt = 0;
let captureLogAt = 0;
let screenEmit = null;
let screenViewer = 'client';

function emitScreenMessage(message) {
  try {
    if (screenEmit) screenEmit(message);
    else if (ws?.readyState === 1) ws.send(JSON.stringify({ to: 'client', ...message }));
  } catch (error) {
    writeLog('error', 'remote.capture.send', { viewer: screenViewer, type: message?.type, error });
  }
}

function screenSocketBackedUp() {
  return !ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 450000;
}

function listScreens() {
  const prim = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: String(d.id),
    label: d.label || ('Монитор ' + (i + 1)),
    primary: d.id === prim,
    width: d.size.width,
    height: d.size.height,
  }));
}
function curDisplay() {
  return screen.getAllDisplays().find((d) => String(d.id) === String(screenCfg.displayId)) || screen.getPrimaryDisplay();
}

function ensureCaptureWindow() {
  if (captureWin && !captureWin.isDestroyed()) return captureWin;
  captureWindowReady = false;
  captureWin = new BrowserWindow({
    show: false,
    width: 32,
    height: 32,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'capture-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Noda is elevated so Windows permits remote input into elevated apps.
      // Chromium's renderer sandbox exits with code 18 in that integrity
      // context on affected Windows builds, so isolation stays at the context
      // boundary while the OS sandbox is disabled for this local window.
      sandbox: false,
      backgroundThrottling: false,
      partition: 'noda-capture',
    },
  });
  // The supported Electron path for system audio is getDisplayMedia with a
  // display-media handler. Isolating the capture session keeps these elevated
  // media permissions away from the visible application window.
  try {
    const captureSession = captureWin.webContents.session;
    captureSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'media' || permission === 'display-capture' || permission === 'audioCapture');
    });
    captureSession.setDisplayMediaRequestHandler((_request, callback) => {
      desktopCapturer.getSources({
        types: ['screen'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false,
      }).then((sources) => {
        const selected = sources.find((source) => source.id === captureWindowConfig?.sourceId)
          || sources.find((source) => String(source.display_id) === String(captureWindowConfig?.displayId))
          || sources[0];
        if (!selected) { callback({}); return; }
        callback({ video: selected, audio: 'loopback' });
      }).catch((error) => {
        writeLog('error', 'remote.capture.display-media', error);
        callback({});
      });
    }, { useSystemPicker: false });
  } catch (error) {
    writeLog('warn', 'remote.capture.display-media-handler', error);
  }
  captureWin.loadFile(path.join(__dirname, 'renderer', 'capture.html')).catch((error) => {
    writeLog('error', 'remote.capture.stream-load', error);
  });
  captureWin.on('closed', () => {
    captureWin = null;
    captureWindowReady = false;
    rtcCaptureConnected = false;
  });
  return captureWin;
}

function sendCaptureWindow(channel, payload) {
  try {
    if (!captureWin || captureWin.isDestroyed() || !captureWindowReady) return false;
    captureWin.webContents.send(channel, payload);
    return true;
  } catch (error) {
    writeLog('error', 'remote.capture.stream-send', { channel, error });
    return false;
  }
}

async function prepareStreamCapture() {
  const disp = curDisplay();
  const captureWindow = ensureCaptureWindow();
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 0, height: 0 },
    fetchWindowIcons: false,
  });
  const source = sources.find((item) => String(item.display_id) === String(disp.id)) || sources[0];
  if (!source) throw new Error('Windows не вернула источник экрана');
  const width = Math.min(Math.max(640, Number(screenCfg.width) || 1920), disp.size.width);
  captureWindowConfig = {
    sourceId: source.id,
    displayId: String(disp.id),
    width,
    height: Math.max(360, Math.round(width * disp.size.height / Math.max(1, disp.size.width))),
    fps: Math.max(8, Math.min(60, Number(screenCfg.fps) || 30)),
    quality: Math.max(20, Math.min(85, Number(screenCfg.quality) || 72)),
  };
  if (captureWindowReady) sendCaptureWindow('remote-capture-start', captureWindowConfig);
  else if (captureWindow.isDestroyed()) throw new Error('Процесс потокового захвата остановился');
}

function startLegacyCapture(reason) {
  if (!screenEmit && (!ws || ws.readyState !== WebSocket.OPEN)) return;
  if (captureFallbackTimer) { clearTimeout(captureFallbackTimer); captureFallbackTimer = null; }
  if (screenTimer) clearTimeout(screenTimer);
  captureEngine = 'electron';
  writeLog('warn', 'remote.capture.fallback', { reason });
  screenTimer = setTimeout(scheduleCapture, 0);
}
function nativeImageIsBlack(image) {
  try {
    if (!image || image.isEmpty()) return true;
    const size = image.getSize();
    const bitmap = image.toBitmap();
    if (!bitmap?.length || !size.width || !size.height) return true;
    let brightest = 0;
    let total = 0;
    let samples = 0;
    const xs = 12;
    const ys = 8;
    for (let yi = 0; yi < ys; yi += 1) {
      const y = Math.min(size.height - 1, Math.round((yi + 0.5) * size.height / ys));
      for (let xi = 0; xi < xs; xi += 1) {
        const x = Math.min(size.width - 1, Math.round((xi + 0.5) * size.width / xs));
        const offset = (y * size.width + x) * 4;
        const value = Math.max(bitmap[offset] || 0, bitmap[offset + 1] || 0, bitmap[offset + 2] || 0);
        brightest = Math.max(brightest, value);
        total += value;
        samples += 1;
      }
    }
    return brightest < 18 && total / Math.max(1, samples) < 7;
  } catch (error) {
    writeLog('warn', 'remote.capture.black-check', error);
    return true;
  }
}

const CAPTURE_PS = `
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $src = $null; $dst = $null; $g1 = $null; $g2 = $null; $ms = $null
  try {
    $a = $line.Split(' ')
    if ($a[0] -ne 'C' -or $a.Length -lt 9) { continue }
    $rid = $a[1]
    $x = [int]$a[2]; $y = [int]$a[3]; $sw = [int]$a[4]; $sh = [int]$a[5]
    $ow = [int]$a[6]; $oh = [int]$a[7]; $quality = [long]$a[8]
    $src = New-Object System.Drawing.Bitmap($sw, $sh, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g1 = [System.Drawing.Graphics]::FromImage($src)
    $g1.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size($sw, $sh)), [System.Drawing.CopyPixelOperation]::SourceCopy)
    $dst = New-Object System.Drawing.Bitmap($ow, $oh, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g2 = [System.Drawing.Graphics]::FromImage($dst)
    $g2.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
    $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::Bilinear
    $g2.DrawImage($src, 0, 0, $ow, $oh)
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
    $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, $quality)
    $ms = New-Object System.IO.MemoryStream
    $dst.Save($ms, $codec, $params)
    [Console]::Out.WriteLine('F ' + $rid + ' ' + $ow + ' ' + $oh + ' ' + [Convert]::ToBase64String($ms.ToArray()))
    [Console]::Out.Flush()
  } catch {
    $msg = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_.Exception.Message))
    [Console]::Out.WriteLine('E ' + $rid + ' ' + $msg)
    [Console]::Out.Flush()
  } finally {
    if ($g2) { $g2.Dispose() }; if ($g1) { $g1.Dispose() }
    if ($dst) { $dst.Dispose() }; if ($src) { $src.Dispose() }; if ($ms) { $ms.Dispose() }
  }
}
`;
let capturePs = null;
let capturePath = null;
let captureStdout = '';
let capturePending = null;
let captureRequestId = 0;
function rejectCapturePending(error) {
  if (!capturePending) return;
  clearTimeout(capturePending.timer);
  const pending = capturePending;
  capturePending = null;
  pending.reject(error instanceof Error ? error : new Error(String(error || 'Захват экрана остановлен')));
}
function handleCaptureOutput(chunk) {
  captureStdout += String(chunk || '');
  let newline;
  while ((newline = captureStdout.indexOf('\n')) >= 0) {
    const line = captureStdout.slice(0, newline).trim();
    captureStdout = captureStdout.slice(newline + 1);
    if (!line || !capturePending) continue;
    const parts = line.split(' ');
    if (parts[1] !== capturePending.id) continue;
    clearTimeout(capturePending.timer);
    const pending = capturePending;
    capturePending = null;
    if (parts[0] === 'F' && parts[4]) pending.resolve({ data: parts[4], w: Number(parts[2]), h: Number(parts[3]) });
    else {
      let message = 'Системный захват экрана завершился ошибкой';
      try { message = Buffer.from(parts[2] || '', 'base64').toString('utf8') || message; } catch {}
      pending.reject(new Error(message));
    }
  }
}
function ensureCapturePs() {
  if (capturePs) return true;
  try {
    if (!capturePath) {
      capturePath = path.join(os.tmpdir(), 'noda_capture.ps1');
      fs.writeFileSync(capturePath, CAPTURE_PS, 'utf8');
    }
    capturePs = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', capturePath], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    capturePs.stdout.setEncoding('utf8');
    capturePs.stdout.on('data', handleCaptureOutput);
    capturePs.stderr.on('data', (data) => writeLog('warn', 'remote.capture.windows-stderr', String(data || '').trim()));
    capturePs.on('error', (error) => { writeLog('error', 'remote.capture.windows-process', error); capturePs = null; rejectCapturePending(error); });
    capturePs.on('exit', (code) => { capturePs = null; rejectCapturePending(new Error(`Системный захват остановлен (${code ?? '?'})`)); });
    writeLog('info', 'remote.capture.windows-start', { script: capturePath });
    return true;
  } catch (error) {
    writeLog('error', 'remote.capture.windows-start', error);
    capturePs = null;
    return false;
  }
}
function captureWindowsFrame(display, w, h) {
  return new Promise((resolve, reject) => {
    if (capturePending) return reject(new Error('Предыдущий системный кадр ещё не готов'));
    if (!ensureCapturePs() || !capturePs?.stdin?.writable) return reject(new Error('Системный захват недоступен'));
    const id = String(++captureRequestId);
    const bounds = display.bounds;
    const timer = setTimeout(() => {
      if (capturePending?.id === id) capturePending = null;
      reject(new Error('Системный захват не вернул кадр за 4 секунды'));
    }, 4000);
    capturePending = { id, resolve, reject, timer };
    try {
      capturePs.stdin.write(`C ${id} ${Math.round(bounds.x)} ${Math.round(bounds.y)} ${Math.max(1, Math.round(bounds.width))} ${Math.max(1, Math.round(bounds.height))} ${w} ${h} ${Math.max(25, Math.min(85, Number(screenCfg.quality) || 55))}\n`);
    } catch (error) {
      clearTimeout(timer); capturePending = null; reject(error);
    }
  });
}
function sendScreenHealth(extra = {}) {
  emitScreenMessage({
    type: 'screen_health', engine: captureEngine, frames: captureFrames,
    failures: captureFailures, lastFrameAt: lastCaptureMs, ...extra,
  });
}
async function captureFrame() {
  // Не копим очередь: если предыдущий кадр ещё захватывается или сокет занят — пропускаем тик.
  if (screenBusy || screenSocketBackedUp()) { captureDropped += 1; return; }
  const frameStartedAt = Date.now();
  screenBusy = true;
  try {
    const disp = curDisplay();
    const w = Math.min(screenCfg.width, disp.size.width);
    const h = Math.round((w * disp.size.height) / disp.size.width);
    let frame = null;
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: w, height: h }, fetchWindowIcons: false });
      const src = sources.find((source) => String(source.display_id) === String(disp.id)) || sources[0];
      if (src?.thumbnail && !nativeImageIsBlack(src.thumbnail)) {
        frame = { data: src.thumbnail.toJPEG(screenCfg.quality).toString('base64'), w, h };
        captureEngine = 'electron';
      } else {
        captureFailures += 1;
        if (captureFailures <= 3 || Date.now() - captureLogAt > 10000) {
          captureLogAt = Date.now();
          writeLog('warn', 'remote.capture.black-frame', { displayId: disp.id, sources: sources.length, failures: captureFailures });
        }
      }
    } catch (error) {
      captureFailures += 1;
      writeLog('error', 'remote.capture.electron', { displayId: disp.id, error });
    }
    if (!frame && process.platform === 'win32') {
      frame = await captureWindowsFrame(disp, w, h);
      captureEngine = 'windows';
    }
    if (frame?.data && ws?.readyState === 1) {
      emitScreenMessage({
        type: 'screen_frame', data: frame.data, w: frame.w, h: frame.h, engine: captureEngine,
        capturedAt: Date.now(), captureMs: Date.now() - frameStartedAt, frameSeq: captureFrames + 1,
      });
      lastCaptureMs = Date.now();
      captureFrames += 1;
      captureBytes += Math.round(frame.data.length * 0.75);
      if (captureFrames === 1 || Date.now() - captureLogAt > 10000) {
        captureLogAt = Date.now();
        const elapsed = Math.max(1, Date.now() - captureStartedAt);
        writeLog('info', 'remote.capture.frame', {
          displayId: disp.id, engine: captureEngine, bytes: Math.round(frame.data.length * 0.75),
          frames: captureFrames, dropped: captureDropped, actualFps: Math.round(captureFrames * 10000 / elapsed) / 10,
          captureMs: Date.now() - frameStartedAt,
        });
        sendScreenHealth({ actualFps: Math.round(captureFrames * 10000 / elapsed) / 10, dropped: captureDropped });
      }
    }
  } catch (error) {
    captureFailures += 1;
    writeLog('error', 'remote.capture.frame', { engine: captureEngine, error });
    sendScreenHealth({ error: error.message });
  } finally { screenBusy = false; }
}
function scheduleCapture() {
  // Адаптивный цикл: запускаем следующий захват сразу после предыдущего, но не чаще fps.
  if (!screenTimer) return;
  const startedAt = Date.now();
  const frameInterval = Math.max(40, Math.round(1000 / (screenCfg.fps || 12)));
  captureFrame().finally(() => {
    const delay = Math.max(0, frameInterval - (Date.now() - startedAt));
    if (screenTimer) screenTimer = setTimeout(scheduleCapture, delay);
  });
}
function startScreen(cfg, emit = null, viewer = 'client') {
  stopScreen();
  screenEmit = typeof emit === 'function' ? emit : null;
  screenViewer = viewer || 'client';
  screenCfg = { ...screenCfg, ...(cfg || {}) };
  if (!screenCfg.displayId) screenCfg.displayId = String(screen.getPrimaryDisplay().id);
  captureFailures = 0; captureFrames = 0; captureDropped = 0; captureBytes = 0;
  captureStartedAt = Date.now(); lastCaptureMs = 0; captureEngine = 'stream';
  rtcCaptureConnected = false;
  writeLog('info', 'remote.capture.start', { ...screenCfg, displayId: screenCfg.displayId, viewer: screenViewer });
  sendScreenHealth({ starting: true });
  prepareStreamCapture().catch((error) => {
    captureFailures += 1;
    writeLog('error', 'remote.capture.stream-start', { displayId: screenCfg.displayId, error });
    startLegacyCapture(error.message);
  });
  captureFallbackTimer = setTimeout(() => {
    if (!lastCaptureMs) startLegacyCapture('Потоковый захват не вернул первый кадр за 2,5 секунды');
  }, 2500);
}
// Мгновенная смена монитора без перезапуска потока — следующий кадр уже с нового экрана.
function switchScreen(displayId) {
  if (displayId) screenCfg.displayId = String(displayId);
  if (screenEmit || screenTimer || captureWindowConfig) {
    prepareStreamCapture().catch((error) => startLegacyCapture(error.message));
  } else startScreen({});
}
function stopScreen() {
  if (screenTimer) { clearTimeout(screenTimer); screenTimer = null; }
  if (captureFallbackTimer) { clearTimeout(captureFallbackTimer); captureFallbackTimer = null; }
  sendCaptureWindow('remote-capture-stop');
  captureWindowConfig = null;
  pendingCaptureSignals = [];
  rtcCaptureConnected = false;
  const elapsed = Math.max(1, Date.now() - (captureStartedAt || Date.now()));
  writeLog('info', 'remote.capture.stop', {
    frames: captureFrames, failures: captureFailures, dropped: captureDropped,
    actualFps: Math.round(captureFrames * 10000 / elapsed) / 10,
    avgKB: captureFrames ? Math.round(captureBytes / captureFrames / 1024) : 0,
    engine: captureEngine, viewer: screenViewer,
  });
  screenEmit = null;
  screenViewer = 'client';
}

// Инъекция мыши/клавиатуры через постоянный PowerShell со своим циклом чтения stdin.
// ВАЖНО: раньше процесс запускался как `powershell -Command -`, который БУФЕРИЗИРУЕТ весь
// stdin и выполняет его только после закрытия (EOF). Приложение держит stdin открытым всё
// время → ни одна команда мыши/клавиатуры не выполнялась («ничего не нажимается»). Теперь —
// отдельный скрипт с циклом [Console]::In.ReadLine(): каждая строка-команда выполняется сразу.
// SendInput работает с абсолютными координатами всего виртуального рабочего стола.
// В отличие от SetCursorPos он возвращает факт принятия события и позволяет явно показать
// зрителю, когда Windows блокирует ввод из-за разного уровня прав (UIPI).
const INJECT_PS = `
$ProgressPreference='SilentlyContinue'
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class WinIO {
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint mapType);
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion U; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
  }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT {
    public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo; }
  public static uint Mouse(int x, int y, uint flags, int data) {
    int vx = GetSystemMetrics(76), vy = GetSystemMetrics(77);
    int vw = Math.Max(1, GetSystemMetrics(78)), vh = Math.Max(1, GetSystemMetrics(79));
    int ax = (int)Math.Round((x - vx) * 65535.0 / Math.Max(1, vw - 1));
    int ay = (int)Math.Round((y - vy) * 65535.0 / Math.Max(1, vh - 1));
    INPUT input = new INPUT(); input.type = 0;
    input.U.mi.dx = ax; input.U.mi.dy = ay;
    input.U.mi.mouseData = unchecked((uint)data);
    input.U.mi.dwFlags = flags | 0x0001 | 0x4000 | 0x8000;
    return SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
  }
  public static uint SendUnicode(string text) {
    uint sent = 0;
    foreach (char ch in text) {
      INPUT down = new INPUT(); down.type = 1; down.U.ki.wScan = ch; down.U.ki.dwFlags = 0x0004;
      INPUT up = down; up.U.ki.dwFlags = 0x0004 | 0x0002;
      INPUT[] inputs = new INPUT[] { down, up };
      sent += SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }
    return sent;
  }
  private static INPUT KeyInput(ushort vk, uint flags) {
    INPUT input = new INPUT(); input.type = 1;
    input.U.ki.wScan = (ushort)MapVirtualKey(vk, 0);
    input.U.ki.dwFlags = flags | 0x0008;
    return input;
  }
  public static uint Key(ushort vk, bool ctrl, bool alt, bool shift) {
    List<INPUT> inputs = new List<INPUT>();
    if (ctrl) inputs.Add(KeyInput(0x11, 0));
    if (alt) inputs.Add(KeyInput(0x12, 0));
    if (shift) inputs.Add(KeyInput(0x10, 0));
    uint extended = (vk == 0x21 || vk == 0x22 || vk == 0x23 || vk == 0x24 || vk == 0x25 || vk == 0x26 || vk == 0x27 || vk == 0x28 || vk == 0x2D || vk == 0x2E) ? 0x0001u : 0u;
    inputs.Add(KeyInput(vk, extended));
    inputs.Add(KeyInput(vk, extended | 0x0002));
    if (shift) inputs.Add(KeyInput(0x10, 0x0002));
    if (alt) inputs.Add(KeyInput(0x12, 0x0002));
    if (ctrl) inputs.Add(KeyInput(0x11, 0x0002));
    return SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
$LD=0x02;$LU=0x04;$RD=0x08;$RU=0x10;$WH=0x0800
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  if ($line -eq '') { continue }
  $seq = '0'; $sent = 0
  try {
    $sp = $line.IndexOf(' ')
    if ($sp -lt 0) { $cmd = $line; $rest = '' } else { $cmd = $line.Substring(0, $sp); $rest = $line.Substring($sp + 1) }
    switch ($cmd) {
      'M' { $a=$rest.Split(' ');$seq=$a[0];$sent=[WinIO]::Mouse([int]$a[1],[int]$a[2],0,0) }
      'C' { $a=$rest.Split(' ');$seq=$a[0];$down=if($a[3]-eq 'right'){$RD}else{$LD};$up=if($a[3]-eq 'right'){$RU}else{$LU};$sent=[WinIO]::Mouse([int]$a[1],[int]$a[2],$down,0)+[WinIO]::Mouse([int]$a[1],[int]$a[2],$up,0) }
      'B' { $a=$rest.Split(' ');$seq=$a[0];$sent=[WinIO]::Mouse([int]$a[1],[int]$a[2],$LD,0)+[WinIO]::Mouse([int]$a[1],[int]$a[2],$LU,0);Start-Sleep -Milliseconds 60;$sent+=[WinIO]::Mouse([int]$a[1],[int]$a[2],$LD,0)+[WinIO]::Mouse([int]$a[1],[int]$a[2],$LU,0) }
      'D' { $a=$rest.Split(' ');$seq=$a[0];$sent=[WinIO]::Mouse([int]$a[1],[int]$a[2],$LD,0) }
      'U' { $a=$rest.Split(' ');$seq=$a[0];$sent=[WinIO]::Mouse([int]$a[1],[int]$a[2],$LU,0) }
      'S' { $a=$rest.Split(' ');$seq=$a[0];$sent=[WinIO]::Mouse([int]$a[1],[int]$a[2],$WH,[int]$a[3]) }
      'K' { $a=$rest.Split(' ');$seq=$a[0];$sent=[WinIO]::Key([uint16]$a[1],([int]$a[2]-eq 1),([int]$a[3]-eq 1),([int]$a[4]-eq 1)) }
      'P' { $a=$rest.Split(' ');$seq=$a[0];$txt=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($a[1]));$sent=[WinIO]::SendUnicode($txt) }
    }
    [Console]::Out.WriteLine('ACK ' + $seq + ' ' + $sent); [Console]::Out.Flush()
  } catch {
    $msg=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_.Exception.Message))
    [Console]::Out.WriteLine('ERR ' + $seq + ' ' + $msg); [Console]::Out.Flush()
  }
}
`;

let mousePs = null;
let injectPath = null;
let mouseOutput = '';
let mouseSequence = 0;
const mousePending = new Map();

function answerScreenInput(send, payload) {
  try { send?.({ type: 'screen_input_ack', ...payload }); } catch {}
}

function failMousePending(error) {
  for (const [seq, pending] of mousePending) {
    clearTimeout(pending.timer);
    answerScreenInput(pending.send, {
      seq,
      action: pending.action,
      ok: false,
      error,
    });
  }
  mousePending.clear();
}

function handleMouseOutput(chunk) {
  mouseOutput += String(chunk || '');
  const lines = mouseOutput.split(/\r?\n/);
  mouseOutput = lines.pop() || '';
  for (const line of lines) {
    const match = line.match(/^(ACK|ERR)\s+(\S+)\s*(.*)$/);
    if (!match) continue;
    const [, kind, seq, value] = match;
    const pending = mousePending.get(seq);
    if (!pending) continue;
    mousePending.delete(seq);
    clearTimeout(pending.timer);
    if (kind === 'ERR') {
      let error = 'Не удалось выполнить удалённый ввод';
      try { error = Buffer.from(value, 'base64').toString('utf8') || error; } catch {}
      writeLog('error', 'remote.input.command', { seq, action: pending.action, error });
      answerScreenInput(pending.send, { seq, action: pending.action, ok: false, error });
      continue;
    }
    const sent = Number(value) || 0;
    const ok = sent > 0;
    const error = ok ? '' : 'Windows заблокировала управление. Noda на удалённом ПК нужно запустить от администратора.';
    if (!ok) writeLog('error', 'remote.input.blocked', { seq, action: pending.action, sent });
    answerScreenInput(pending.send, { seq, action: pending.action, ok, sent, error });
  }
}

function ensureMousePs() {
  if (mousePs && !mousePs.killed && mousePs.stdin?.writable) return true;
  try {
    if (!injectPath) {
      injectPath = path.join(os.tmpdir(), 'arra_inject.ps1');
      fs.writeFileSync(injectPath, INJECT_PS, 'utf8');
    }
    const proc = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', injectPath], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    mousePs = proc;
    mouseOutput = '';
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', handleMouseOutput);
    proc.stderr.on('data', (data) => {
      const error = String(data || '').trim();
      if (error) writeLog('error', 'remote.input.stderr', { error });
    });
    proc.on('error', (error) => {
      writeLog('error', 'remote.input.worker-error', error);
      if (mousePs === proc) mousePs = null;
      failMousePending('Служба удалённого управления не запустилась');
    });
    proc.on('exit', (code, signal) => {
      if (mousePs === proc) mousePs = null;
      if (mousePending.size) {
        writeLog('error', 'remote.input.worker-exit', { code, signal });
        failMousePending('Служба удалённого управления остановилась');
      }
    });
    return true;
  } catch (error) {
    mousePs = null;
    writeLog('error', 'remote.input.worker-start', error);
    return false;
  }
}

function psCmd(line, seq, send, action) {
  if (!ensureMousePs()) {
    answerScreenInput(send, { seq, action, ok: false, error: 'Служба удалённого управления не запустилась' });
    return;
  }
  const timer = setTimeout(() => {
    if (!mousePending.delete(seq)) return;
    writeLog('error', 'remote.input.timeout', { seq, action });
    answerScreenInput(send, { seq, action, ok: false, error: 'Удалённый компьютер не подтвердил управление' });
  }, 5000);
  mousePending.set(seq, { send, action, timer });
  try {
    mousePs.stdin.write(line + '\n');
  } catch (error) {
    clearTimeout(timer);
    mousePending.delete(seq);
    writeLog('error', 'remote.input.write', { seq, action, error });
    answerScreenInput(send, { seq, action, ok: false, error: 'Не удалось отправить команду управления' });
  }
}

function screenInput(msg, send) {
  const disp = curDisplay();
  const b = disp.bounds;
  const x = Math.round(b.x + Math.max(0, Math.min(1, msg.nx || 0)) * b.width);
  const y = Math.round(b.y + Math.max(0, Math.min(1, msg.ny || 0)) * b.height);
  const seq = String(msg.seq || ++mouseSequence).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48) || String(++mouseSequence);
  const command = (line) => psCmd(line, seq, send, msg.action || 'unknown');
  switch (msg.action) {
    case 'move': command(`M ${seq} ${x} ${y}`); break;
    case 'click': command(`C ${seq} ${x} ${y} ${msg.button === 'right' ? 'right' : 'left'}`); break;
    case 'dbl': command(`B ${seq} ${x} ${y}`); break;
    case 'down': command(`D ${seq} ${x} ${y}`); break;
    case 'up': command(`U ${seq} ${x} ${y}`); break;
    case 'scroll': command(`S ${seq} ${x} ${y} ${Math.round(msg.dy || 0)}`); break;
    case 'key': {
      const map = { enter: 0x0D, backspace: 0x08, esc: 0x1B, tab: 0x09, up: 0x26, down: 0x28, left: 0x25, right: 0x27, delete: 0x2E, home: 0x24, end: 0x23, space: 0x20 };
      const codeMap = { Semicolon: 0xBA, Equal: 0xBB, Comma: 0xBC, Minus: 0xBD, Period: 0xBE, Slash: 0xBF, Backquote: 0xC0, BracketLeft: 0xDB, Backslash: 0xDC, BracketRight: 0xDD, Quote: 0xDE };
      let vk = msg.key && map[msg.key] ? map[msg.key] : null;
      if (vk == null && /^Key[A-Z]$/.test(String(msg.code || ''))) vk = String(msg.code).charCodeAt(3);
      if (vk == null && /^Digit[0-9]$/.test(String(msg.code || ''))) vk = String(msg.code).charCodeAt(5);
      if (vk == null && msg.code && codeMap[msg.code]) vk = codeMap[msg.code];
      if (vk == null && msg.key && String(msg.key).length === 1 && (msg.ctrl || msg.alt || msg.shift)) {
        const key = String(msg.key).toUpperCase();
        if (/^[A-Z0-9]$/.test(key)) vk = key.charCodeAt(0);
      }
      if (vk != null) {
        command(`K ${seq} ${vk} ${msg.ctrl ? 1 : 0} ${msg.alt ? 1 : 0} ${msg.shift ? 1 : 0}`);
      } else if (msg.text) {
        const encoded = Buffer.from(String(msg.text).replace(/[\r\n]+/g, ''), 'utf8').toString('base64');
        if (encoded) command(`P ${seq} ${encoded}`);
      }
      break;
    }
    default:
      answerScreenInput(send, { seq, action: msg.action || 'unknown', ok: false, error: 'Неизвестная команда управления' });
      break;
  }
}

function handleRelay(msg, send) {
  switch (msg.type) {
    case 'phone_presence':
      markPhonePresence();
      break;
    case 'workspace_projects':
      Promise.resolve(localSyncInventory()).then((inventory) => send({
        type: 'workspace_projects',
        reqId: msg.reqId,
        deviceId: agentDeviceId || settings.deviceId || null,
        deviceName: settings.deviceName || os.hostname(),
        inventory,
      })).catch((error) => send({
        type: 'workspace_projects', reqId: msg.reqId, error: error.message || 'Не удалось прочитать проекты',
      }));
      break;
    case 'workspace_models':
      localModelsSnapshot().then((result) => send({
        type: 'workspace_models', reqId: msg.reqId, deviceId: agentDeviceId || settings.deviceId || null, ...result,
      }));
      break;
    case 'workspace_chat':
      localChatCompletion({ model: msg.model, messages: msg.messages, project: msg.project }).then((result) => send({
        type: 'workspace_chat', reqId: msg.reqId, deviceId: agentDeviceId || settings.deviceId || null, ...result,
      }));
      break;
    case 'sync_remote_push':
      startRemoteSync('push', msg, send, 'Отправка запущена').catch((error) => {
        writeLog('error', 'sync.remote-push', { reqId: msg.reqId, error });
        send({ type: 'sync_remote_event', reqId: msg.reqId, event: { type: 'error', error: error.message } });
      });
      break;
    case 'sync_remote_pull':
      startRemoteSync('pull', msg, send, 'Получение запущено').catch((error) => {
        writeLog('error', 'sync.remote-pull', { reqId: msg.reqId, error });
        send({ type: 'sync_remote_event', reqId: msg.reqId, event: { type: 'error', error: error.message } });
      });
      break;
    case 'sync_remote_status':
      startRemoteSync('status', msg, send, 'Сканирование запущено').catch((error) => {
        writeLog('error', 'sync.remote-status', { reqId: msg.reqId, error });
        send({ type: 'sync_remote_event', reqId: msg.reqId, event: { type: 'error', error: error.message } });
      });
      break;
    case 'sync_remote_snapshot':
      send({ type: 'sync_remote_state', reqId: msg.reqId, state: syncStateSnapshot() });
      break;
    case 'sync_remote_blockers':
      listPotentialBlockers().then((items) => send({ type: 'sync_remote_blockers', reqId: msg.reqId, items }));
      break;
    case 'sync_remote_close_blockers':
      closePotentialBlockers(msg.pids).then((result) => send({
        type: 'sync_remote_blockers_result', reqId: msg.reqId, action: 'close', result,
      })).catch((error) => {
        writeLog('error', 'sync.blockers.remote-close', { reqId: msg.reqId, error });
        send({ type: 'sync_remote_blockers_result', reqId: msg.reqId, action: 'close', result: { ok: false, error: error.message } });
      });
      break;
    case 'sync_remote_force_close_blockers':
      forceClosePotentialBlockers(msg.pids).then((result) => send({
        type: 'sync_remote_blockers_result', reqId: msg.reqId, action: 'force', result,
      })).catch((error) => {
        writeLog('error', 'sync.blockers.remote-force', { reqId: msg.reqId, error });
        send({ type: 'sync_remote_blockers_result', reqId: msg.reqId, action: 'force', result: { ok: false, error: error.message } });
      });
      break;
    case 'sync_remote_ack':
      winSend('remote-sync-event', msg);
      break;
    case 'sync_remote_event':
    case 'sync_remote_blockers':
    case 'sync_remote_state':
    case 'sync_remote_blockers_result':
      winSend('remote-sync-event', msg);
      break;
    case 'screens':
    case 'screen_frame':
    case 'screen_health':
    case 'screen_input_ack':
    case 'pc_offline':
      winSend('remote-screen-event', msg);
      break;
    case 'screen_rtc_signal':
      if (msg.role === 'host') winSend('remote-screen-event', msg);
      else sendCaptureRtcSignal(msg.signal || {});
      break;
    case 'screen_rtc_state':
      winSend('remote-screen-event', msg);
      break;
    case 'hello':
      send({ type: 'cwd', cwd: getTermCwd(), root: codeRoot() });
      break;
    case 'screen_list':
      send({ type: 'screens', screens: listScreens() });
      break;
    case 'screen_start':
      startScreen(
        { displayId: msg.displayId, fps: msg.fps, quality: msg.quality, width: msg.width, rtc: !!msg.rtc },
        send,
        msg.sourceDeviceId || (msg.clientKind === 'desktop' ? 'desktop' : 'client'),
      );
      send({ type: 'screens', screens: listScreens() });
      break;
    case 'screen_switch':
      switchScreen(msg.displayId);
      break;
    case 'screen_cfg':
      // Подстройка качества/частоты на лету (напр. при зуме — резче, в обзоре — быстрее)
      if (msg.fps) screenCfg.fps = Math.max(8, Math.min(60, msg.fps));
      if (msg.quality) screenCfg.quality = Math.max(20, Math.min(80, msg.quality));
      if (msg.width) screenCfg.width = Math.max(640, Math.min(3840, msg.width));
      break;
    case 'screen_stop':
      stopScreen();
      break;
    case 'screen_input':
      screenInput(msg, send);
      break;
    case 'pty_start':
      startPty(msg.termId || '1', msg.cols, msg.rows, msg.cwd, false);
      break;
    case 'pty_input':
      ptyWrite(msg.termId || '1', msg.data, 'phone');
      break;
    case 'pty_resize':
      ptyResize(msg.termId || '1', msg.cols, msg.rows, 'phone');
      break;
    case 'pty_kill':
      killPty(msg.termId || '1');
      break;
    case 'pty_list':
      // список всех активных сессий ПК — чтобы телефон мог подключиться к уже открытой
      send({ type: 'pty_list', terms: [...ptys.entries()].map(([id, s]) => ({ termId: id, cwd: s.cwd })) });
      break;
    case 'pty_attach': {
      // подключиться к существующей сессии: отдаём накопленный буфер (текущее содержимое экрана)
      const s = ptys.get(msg.termId);
      if (s) {
        const sz = ptySize(msg.termId);
        if (sz) send({ type: 'pty_size', termId: msg.termId, cols: sz.cols, rows: sz.rows }); // зритель подстроит свой xterm
        send({ type: 'pty_out', termId: msg.termId, data: s.buf || '' });
      } else startPty(msg.termId, msg.cols, msg.rows, msg.cwd, false);
      break;
    }
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
    case 'fs_preview':
      fsPreview(msg.reqId, msg.path, send);
      break;
    case 'fs_write':
      fsWrite(msg.reqId, msg.path, msg.content, send);
      break;
    case 'fs_zip':
      fsZip(msg.reqId, msg.path, send);
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

function sendCaptureRtcSignal(signal) {
  if (sendCaptureWindow('remote-capture-rtc-signal', signal)) return true;
  pendingCaptureSignals.push(signal);
  if (pendingCaptureSignals.length > 100) pendingCaptureSignals = pendingCaptureSignals.slice(-100);
  ensureCaptureWindow();
  return false;
}

function localAiBase() {
  const raw = String(settings.localAiUrl || 'http://127.0.0.1:11434').trim().replace(/\/$/, '');
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    return parsed.toString().replace(/\/$/, '');
  } catch { return 'http://127.0.0.1:11434'; }
}

function localAiJson(method, urlPath, body, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const url = new URL(localAiBase() + urlPath);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': data.length } : {}),
      },
      timeout,
    }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { buf += chunk; if (buf.length > 8 * 1024 * 1024) req.destroy(new Error('Ответ локальной модели слишком большой')); });
      res.on('end', () => {
        try {
          const parsed = buf ? JSON.parse(buf) : {};
          if ((res.statusCode || 500) >= 400) {
            const error = new Error(parsed.error || parsed.message || `Локальный AI HTTP ${res.statusCode}`);
            error.statusCode = res.statusCode;
            reject(error);
          }
          else resolve(parsed);
        } catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Локальная модель не ответила')));
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
    winSend('file-received', rec);
    // сообщаем телефону путь сохранённого файла — чтобы вставить его в терминал
    try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ to: 'client', type: 'file_saved', name: rec.name, path: dest })); } catch {}
    if (Notification.isSupported()) {
      new Notification({ title: 'Noda · файл получен', body: `${rec.name} — в буфере (${what})` }).show();
    }
  } catch (e) {
    writeLog('error', 'files.receive', { fileId: file?.id, name: file?.original_name, error: e });
    winSend('file-error', { message: e.message });
  }
}

// ---- WebSocket ----
function pushStatus() {
  winSend('status', {
    online,
    phoneOnline,
    deviceId: agentDeviceId || settings.deviceId || null,
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
      if (msg.type === 'connected') {
        agentDeviceId = msg.deviceId || agentDeviceId;
        if (msg.deviceId) { settings.deviceId = msg.deviceId; saveSettings(); }
        pushStatus();
        return;
      }
      if (msg.type === 'presence') {
        phoneOnline = !!msg.phoneOnline;
        pushStatus();
        return;
      }
      if (msg.type === 'new_file' && msg.file) { handleNewFile(msg.file); return; }
      // Релей-команды с телефона (терминал/файлы/Claude)
      if (msg.to === 'pc') {
        if (!msg.sourceDeviceId && msg.clientKind !== 'desktop') markPhonePresence();
        const send = (o) => {
          try {
            ws.send(JSON.stringify(msg.sourceDeviceId
              ? { to: 'agent', deviceId: msg.sourceDeviceId, ...o }
              : { to: 'client', ...o }));
          } catch {}
        };
        handleRelay(msg, send);
      }
    } catch (error) { writeLog('error', 'websocket.message', error); }
  });
  ws.on('close', () => {
    online = false;
    phoneOnline = false;
    stopScreen();
    pushStatus();
    if (!manualClose) reconnectTimer = setTimeout(connectWS, 3000);
  });
  ws.on('error', (error) => { writeLog('error', 'websocket.agent', error); /* close последует */ });
}

// ---- Окно ----
let rendererRecoveryAttempts = 0;
let rendererRecoveryWindowStartedAt = 0;
let rendererHealthyTimer = null;
let rendererHeartbeatAt = 0;
let rendererWatchdogTimer = null;

function recoverRenderer(details) {
  if (!win || win.isDestroyed() || manualClose || details?.reason === 'clean-exit') return;
  const now = Date.now();
  if (!rendererRecoveryWindowStartedAt || now - rendererRecoveryWindowStartedAt > 60000) {
    rendererRecoveryWindowStartedAt = now;
    rendererRecoveryAttempts = 0;
  }
  rendererRecoveryAttempts += 1;
  if (rendererRecoveryAttempts > 3) {
    writeLog('fatal', 'renderer.recovery-exhausted', { details, attempts: rendererRecoveryAttempts });
    return;
  }
  const delay = Math.min(1200, 250 * rendererRecoveryAttempts);
  rendererHeartbeatAt = Date.now();
  writeLog('warn', 'renderer.recovery-scheduled', { details, attempt: rendererRecoveryAttempts, delay });
  setTimeout(() => {
    if (!win || win.isDestroyed() || manualClose) return;
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
      .then(() => writeLog('info', 'renderer.recovered', { attempt: rendererRecoveryAttempts }))
      .catch((error) => writeLog('fatal', 'renderer.recovery-failed', { attempt: rendererRecoveryAttempts, error }));
  }, delay);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 720,
    minHeight: 560,
    frame: false,
    backgroundColor: '#171717',
    title: 'Noda',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.webContents.on('did-fail-load', (_e, code, description, validatedURL, isMainFrame) => {
    writeLog('error', 'renderer.did-fail-load', { code, description, validatedURL, isMainFrame });
    console.error('[renderer load]', code, description);
    if (isMainFrame) recoverRenderer({ reason: 'did-fail-load', code, description, validatedURL });
  });
  win.webContents.on('console-message', (_e, ...args) => {
    const d = args.length === 1 && typeof args[0] === 'object' ? args[0] : { level: args[0], message: args[1], lineNumber: args[2], sourceId: args[3] };
    if ((d.level || 0) >= 2) {
      writeLog((d.level || 0) >= 3 ? 'error' : 'warn', 'renderer.console', d);
      console.error(`[renderer:${d.lineNumber || 0}] ${d.message || ''}`, d.sourceId || '');
    }
  });
  win.webContents.on('preload-error', (_e, preloadPath, error) => {
    writeLog('error', 'renderer.preload', { preloadPath, error });
    console.error('[preload]', preloadPath, error);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    writeLog('fatal', 'renderer.process-gone', details);
    recoverRenderer(details);
  });
  win.on('unresponsive', () => {
    writeLog('error', 'window.unresponsive', {});
    recoverRenderer({ reason: 'unresponsive' });
  });
  win.on('closed', () => {
    stopScreen();
    try { if (captureWin && !captureWin.isDestroyed()) captureWin.destroy(); } catch {}
    captureWin = null;
    captureWindowReady = false;
    clearInterval(rendererWatchdogTimer);
    rendererWatchdogTimer = null;
  });
  win.webContents.on('did-finish-load', () => {
    rendererHeartbeatAt = Date.now();
    clearTimeout(rendererHealthyTimer);
    rendererHealthyTimer = setTimeout(() => {
      rendererRecoveryAttempts = 0;
      rendererRecoveryWindowStartedAt = 0;
    }, 30000);
  });
  clearInterval(rendererWatchdogTimer);
  rendererWatchdogTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized() || win.webContents.isLoading()) return;
    if (Date.now() - rendererHeartbeatAt <= 20000) return;
    writeLog('error', 'renderer.heartbeat-timeout', { lastHeartbeatAt: rendererHeartbeatAt });
    recoverRenderer({ reason: 'heartbeat-timeout', lastHeartbeatAt: rendererHeartbeatAt });
  }, 5000);
  rendererWatchdogTimer.unref?.();
  win.webContents.once('did-finish-load', () => {
    win.webContents.executeJavaScript(`({ title: document.title, body: document.body && document.body.innerText.slice(0,120), hasArra: !!window.arra })`)
      .then((state) => console.log('[renderer ready]', state)).catch((e) => { writeLog('error', 'renderer.inspect', e); console.error('[renderer inspect]', e); });
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    pushStatus();
    // Занимаем рабочую область экрана ЯВНО (не win.maximize() — фреймлес-окно при maximize
    // уезжает на пару пикселей под панель задач и срезает низ терминала).
    try { const disp = screen.getDisplayMatching(win.getBounds()); win.setBounds(disp.workArea); } catch { win.maximize(); }
    win.show();
  });
}

// Noda управляет в том числе приложениями, запущенными от администратора. Windows UIPI
// разрешает ввод только в процессы с тем же или более низким уровнем целостности, поэтому
// упакованный Noda.exe получает requireAdministrator в after-pack.cjs.
function whoamiElevated(cb) {
  if (process.platform !== 'win32') return cb(false);
  try {
    execFile('whoami', ['/groups'], { windowsHide: true }, (err, out) => {
      if (err || !out) return cb(false);
      cb(/S-1-16-12288/.test(out)); // High Mandatory Level = elevated
    });
  } catch { cb(false); }
}
function processElevation() {
  return new Promise((resolve) => whoamiElevated((elevated) => resolve(!!elevated)));
}

// Явный AppUserModelID — чтобы Windows показывал иконку Arra в панели задач (а не дефолт Electron)
// AppUserModelID намеренно сохраняем прежним: Windows обновит установленную Arra на Noda без второго дубля.
try { app.setAppUserModelId('com.arratima.arra.desktop'); } catch {}

app.whenReady().then(async () => {
  pruneLogs();
  const elevated = await processElevation();
  writeLog('info', 'app.start', { version: app.getVersion(), packaged: app.isPackaged, platform: process.platform, arch: process.arch, elevated });
  settings = loadSettings();
  // Разрешаем микрофон (голосовой ввод помощника); остальное — по умолчанию запрещаем
  try {
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
      cb(permission === 'media' || permission === 'audioCapture' || permission === 'microphone');
    });
  } catch {}
  createWindow();
  if (settings.token) {
    // Старые установки регистрировались новым токеном после каждой потери
    // settings.json. Теперь при каждом старте подтверждаем постоянный ID машины.
    try {
      await refreshCurrentDeviceRegistration(settings.deviceName);
    } catch (error) { writeLog('warn', 'device.refresh', error); }
    connectWS();
  }
  // Автообновление (только в упакованном приложении). Не блокирует старт.
  try { initUpdater(() => win, winSend, writeLog); } catch (error) { writeLog('error', 'updater.init', error); }
});

// Ручная проверка обновления из UI.
ipcMain.handle('update-check', async () => {
  try {
    writeLog('info', 'updater.manual-check', {});
    return await checkUpdatesNow();
  }
  catch (error) { writeLog('error', 'updater.manual-check', error); return { ok: false, error: error.message }; }
});
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.on('renderer-heartbeat', (_event, payload = {}) => {
  rendererHeartbeatAt = Date.now();
  if (payload.healthy === false) {
    writeLog('error', 'renderer.unhealthy-dom', payload);
    recoverRenderer({ reason: 'unhealthy-dom', payload });
  }
});
ipcMain.handle('app-log', (_e, { level = 'info', source = 'renderer', payload = {} } = {}) => {
  writeLog(String(level).slice(0, 16), String(source).slice(0, 120), payload);
  return { ok: true };
});
ipcMain.handle('open-logs', async () => {
  try {
    fs.mkdirSync(logsDir(), { recursive: true });
    const error = await shell.openPath(logsDir());
    if (error) { writeLog('error', 'logs.open', { error }); return { ok: false, error }; }
    return { ok: true, path: logsDir() };
  } catch (error) { writeLog('error', 'logs.open', error); return { ok: false, error: error.message }; }
});
ipcMain.handle('log-path', () => ({ dir: logsDir(), file: logPath() }));

app.on('window-all-closed', () => { manualClose = true; try { ws?.close(); } catch {} app.quit(); });

// ---- IPC ----
ipcMain.handle('get-status', () => ({
  online,
  phoneOnline,
  deviceId: agentDeviceId || settings.deviceId || null,
  paired: !!settings.token,
  hasAuth: !!(settings.jwt || (settings.login && settings.password)),
  deviceName: settings.deviceName || '',
  login: settings.login || '',
  folder: currentFolder(),
  mode: currentMode(),
  deviceProfile: detectDeviceProfile(),
  sync: syncStateSnapshot(),
}));

ipcMain.handle('login', async (_e, { login, password, deviceName }) => {
  try {
    const auth = await httpJson('POST', '/auth/login', { login, password });
    if (!auth.token) throw new Error('Неверный логин или пароль');
    settings.jwt = auth.token;
    settings.login = login;
    settings.password = password;
    await registerCurrentDevice(auth.token, deviceName);
    if (!settings.folder) settings.folder = defaultFolder();
    if (!settings.mode) settings.mode = 'path';
    saveSettings();
    manualClose = false;
    connectWS();
    return { ok: true };
  } catch (e) {
    writeLog('error', 'auth.login', e);
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
    writeLog('error', 'api.request', { method: method || 'GET', path, error: e });
    return { ok: false, error: e.message };
  }
});
// Голос помощника: аудио с микрофона → /ai/transcribe → текст
ipcMain.handle('transcribe', async (_e, { base64, mime }) => {
  try {
    const jwt = await getJwt();
    if (!jwt) return { ok: false, error: 'Нет авторизации ПК' };
    const buffer = Buffer.from(base64, 'base64');
    const ext = (mime || '').includes('ogg') ? 'ogg' : (mime || '').includes('mp4') ? 'mp4' : 'webm';
    const boundary = '----arra' + Date.now().toString(16);
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="voice.${ext}"\r\n` +
      `Content-Type: ${mime || 'audio/webm'}\r\n\r\n`, 'utf8');
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const payload = Buffer.concat([head, buffer, tail]);
    const text = await new Promise((resolve, reject) => {
      const u = new URL(BASE + '/ai/transcribe');
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
        res.on('end', () => {
          if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode));
          try { resolve(JSON.parse(buf).text || ''); } catch { reject(new Error('Плохой ответ сервера')); }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    return { ok: true, text };
  } catch (e) { writeLog('error', 'voice.transcribe', e); return { ok: false, error: e.message }; }
});

ipcMain.handle('open-folder', () => shell.openPath(currentFolder()));
ipcMain.handle('open-path', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('open-file', (_e, p) => shell.openPath(p)); // открыть файл/папку дефолтным приложением
ipcMain.handle('fs-delete', async (_e, p) => {
  try { await fs.promises.rm(p, { recursive: true, force: true }); return { ok: true }; }
  catch (e) { writeLog('error', 'files.delete', { path: p, error: e }); return { ok: false, error: e.message }; }
});
ipcMain.handle('copy-path', (_e, p) => { clipboard.writeText(p); return true; });
ipcMain.handle('clip-read', () => clipboard.readText());
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

// ---- Перенос (синхронизация рабочих файлов с сервером) ----
// Тонкая обёртка над проверенным движком C:\Claude\_sync (Python/SFTP).
// arra_sync.py отдаёт по строке JSON на событие — стримим их в рендерер.
// Runtime поставляется вместе с Noda: на втором устройстве не требуется вручную
// копировать C:\Claude\_sync. ARRA_SYNC_DIR оставлен только для отладки.
const SYNC_DIR = process.env.ARRA_SYNC_DIR || (app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'sync')
  : path.join(__dirname, 'sync'));
let syncProc = null;
let syncPreparing = false;
let syncRuntime = {
  busy: false,
  mode: null,
  startedAt: null,
  updatedAt: null,
  lastEvent: null,
};

function syncStateSnapshot() {
  return {
    ...syncRuntime,
    busy: !!(syncRuntime.busy || syncPreparing),
    pid: syncProc?.pid || null,
  };
}

function rememberSyncEvent(mode, event) {
  const now = new Date().toISOString();
  const terminal = ['status', 'done', 'error', 'blocked', 'closed'].includes(event?.type);
  const keepPrevious = event?.type === 'closed'
    && ['status', 'done', 'error', 'blocked'].includes(syncRuntime.lastEvent?.type);
  syncRuntime = {
    ...syncRuntime,
    mode: mode || syncRuntime.mode,
    busy: !terminal,
    updatedAt: now,
    lastEvent: keepPrevious ? syncRuntime.lastEvent : event,
  };
}

function broadcastSyncMessage(message) {
  try {
    if (ws?.readyState === 1) ws.send(JSON.stringify({ to: 'client', ...message }));
  } catch (error) {
    writeLog('error', 'sync.broadcast', error);
  }
}

function broadcastSyncState() {
  broadcastSyncMessage({ type: 'sync_remote_state', state: syncStateSnapshot() });
}

async function startRemoteSync(mode, msg, send, message) {
  if (syncProc || syncPreparing) {
    send({ type: 'sync_remote_state', reqId: msg.reqId, state: syncStateSnapshot() });
    return false;
  }
  const directEmit = msg.sourceDeviceId
    ? (event) => send({ type: 'sync_remote_event', reqId: msg.reqId, event, state: syncStateSnapshot() })
    : null;
  send({ type: 'sync_remote_ack', reqId: msg.reqId, message, state: syncStateSnapshot() });
  const started = await runManagedSync(mode, null, null, directEmit);
  if (!started) send({ type: 'sync_remote_state', reqId: msg.reqId, state: syncStateSnapshot() });
  return started;
}

function readEnvFile(file) {
  try {
    const values = {};
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      values[match[1]] = value;
    }
    return values;
  } catch { return {}; }
}
function readLegacySyncConnection(root) {
  try {
    const file = path.join(root, '_sync', 'sync_common.py');
    const source = fs.readFileSync(file, 'utf8');
    const value = (name) => {
      const match = source.match(new RegExp(`^\\s*${name}\\s*=\\s*["']([^"']+)["']`, 'm'));
      return match ? match[1] : '';
    };
    const password = value('PASSWORD');
    if (!password) return null;
    return {
      host: value('SERVER') || '186.246.2.140',
      user: value('USER') || 'tima',
      password,
      source: file,
    };
  } catch { return null; }
}
function syncConnectionEnv() {
  const direct = {
    host: process.env.NODA_SYNC_HOST || '',
    user: process.env.NODA_SYNC_USER || '',
    password: process.env.NODA_SYNC_PASSWORD || '',
    source: 'process-env',
  };
  if (direct.password) return direct;
  const root = codeRoot();
  const candidates = [
    path.join(root, 'Tima', '07_Appstore', '.env'),
    path.join(root, 'Tima', '07_Appstore', 'server', '.env'),
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', 'server', '.env'),
  ];
  for (const file of [...new Set(candidates)]) {
    const values = readEnvFile(file);
    const password = values.NODA_SYNC_PASSWORD || '';
    if (password) return {
      host: values.NODA_SYNC_HOST || '',
      user: values.NODA_SYNC_USER || '',
      password,
      source: file,
    };
  }
  return readLegacySyncConnection(codeRoot()) || direct;
}
function emitSyncEvent(mode, only, event, remoteEmit = null) {
  rememberSyncEvent(mode, event);
  if (event?.error || event?.type === 'error' || event?.type === 'stderr' || event?.type === 'fileerror') writeLog('error', `sync.${event.type || 'event'}`, { mode, only, event });
  else if (event?.type === 'retry' || event?.type === 'blocked') writeLog('warn', `sync.${event.type}`, { mode, only, event });
  else if (event?.type === 'done') writeLog(event.errors ? 'warn' : 'info', 'sync.done', { mode, only, event });
  else if (event?.type === 'phase') writeLog('info', 'sync.phase', { mode, only, event });
  winSend('sync-event', event);
  if (remoteEmit) {
    try { remoteEmit(event); }
    catch (error) { writeLog('error', 'sync.remote-emit', { mode, only, eventType: event?.type, error }); }
  }
  broadcastSyncMessage({ type: 'sync_remote_event', event, state: syncStateSnapshot() });
}

async function runManagedSync(mode, only, role, remoteEmit = null, retryAttempt = 0) {
  if (syncProc || syncPreparing) {
    writeLog('warn', 'sync.already-running', { mode, only, preparing: syncPreparing });
    return false;
  }
  syncPreparing = true;
  syncRuntime = {
    busy: true,
    mode,
    startedAt: retryAttempt > 0 && syncRuntime.startedAt
      ? syncRuntime.startedAt
      : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastEvent: { type: 'phase', msg: mode === 'status' ? 'Запускаю сканирование…' : 'Проверяю и закрываю редакторы…' },
  };
  broadcastSyncState();
  const emit = (event) => emitSyncEvent(mode, only, event, remoteEmit);
  try {
    if (mode !== 'status') {
      const blockers = await listPotentialBlockers();
      const pids = blockers.map((item) => item.pid).filter(Boolean);
      writeLog('info', 'sync.autoclose.found', { mode, retryAttempt, blockers });
      if (pids.length) {
        emit({
          type: 'phase',
          stage: 'closing-editors',
          msg: `Закрываю редакторы и терминалы · ${pids.length}`,
          detail: blockers.map((item) => item.title || item.name).filter(Boolean).slice(0, 6).join(' · '),
        });
        const graceful = await closePotentialBlockers(pids);
        if (graceful.remaining?.length) {
          emit({
            type: 'phase',
            stage: 'forcing-editors',
            msg: `Завершаю оставшиеся процессы · ${graceful.remaining.length}`,
            detail: graceful.remaining.map((item) => item.title || item.name).filter(Boolean).slice(0, 6).join(' · '),
          });
          await forceClosePotentialBlockers(graceful.remaining.map((item) => item.pid));
        }
      }
      const remaining = await listPotentialBlockers();
      if (remaining.length) {
        writeLog('error', 'sync.autoclose.remaining', { mode, retryAttempt, remaining });
        emit({ type: 'phase', stage: 'remaining-editors', msg: `Проверяю передачу: осталось процессов · ${remaining.length}` });
      } else {
        emit({
          type: 'phase',
          stage: 'editors-closed',
          msg: blockers.length ? 'Редакторы закрыты · запускаю передачу' : 'Файлы свободны · запускаю передачу',
          detail: blockers.length ? `Закрыто процессов: ${blockers.length}` : '',
        });
      }
    }
    const started = runSyncProc(mode, only, role, remoteEmit, retryAttempt);
    if (!started) emit({ type: 'error', error: 'Не удалось запустить синхронизацию. Подробности записаны в журнал Noda.' });
    return started;
  } catch (error) {
    emit({ type: 'error', error: error.message || 'Не удалось подготовить синхронизацию' });
    return false;
  } finally {
    syncPreparing = false;
    broadcastSyncState();
  }
}

function runSyncProc(mode, only, role, remoteEmit = null, retryAttempt = 0) {
  const emit = (event) => emitSyncEvent(mode, only, event, remoteEmit);
  if (syncProc) {
    writeLog('warn', 'sync.already-running', { mode, only });
    return false;
  }
  const operationStartedAt = retryAttempt > 0 && syncRuntime.startedAt
    ? syncRuntime.startedAt
    : new Date().toISOString();
  syncRuntime = {
    busy: true,
    mode,
    startedAt: operationStartedAt,
    updatedAt: new Date().toISOString(),
    lastEvent: { type: 'phase', msg: mode === 'status' ? 'Запускаю сканирование…' : 'Готовлю передачу…' },
  };
  broadcastSyncState();
  const script = path.join(SYNC_DIR, 'arra_sync.py');
  if (!fs.existsSync(script)) {
    writeLog('error', 'sync.module-missing', { script, mode, only });
    emit({ type: 'error', error: 'В установке Noda отсутствует модуль передачи: ' + script + '. Переустанови приложение.' });
    return false;
  }
  const args = [script, mode];
  if (only) args.push('--only', only);
  const syncConnection = syncConnectionEnv();
  if (!syncConnection.password) {
    emit({ type: 'error', error: 'На этом устройстве не найдены локальные реквизиты переноса. Проверь файл .env проекта Noda.' });
    return false;
  }
  writeLog('info', 'sync.credentials', { source: syncConnection.source, hostConfigured: !!syncConnection.host, userConfigured: !!syncConnection.user });
  const tryExe = (exe, fallback) => {
    const env = {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      ARRA_PROJECTS_DIR: codeRoot(),
      NODA_DEVICE_NAME: settings.deviceName || os.hostname(),
      NODA_DEVICE_ROLE: role || detectDeviceProfile().role,
      NODA_SYNC_HOST: syncConnection.host || '186.246.2.140',
      NODA_SYNC_USER: syncConnection.user || 'tima',
      NODA_SYNC_PASSWORD: syncConnection.password,
    };
    let p;
    try { p = spawn(exe, args, { cwd: SYNC_DIR, windowsHide: true, env }); }
    catch (e) { if (fallback) return tryExe(fallback, null); writeLog('error', 'sync.spawn', { exe, mode, only, error: e }); emit({ type: 'error', error: 'Не удалось запустить Python: ' + e.message }); return; }
    syncProc = p;
    writeLog('info', 'sync.start', { mode, only, role: env.NODA_DEVICE_ROLE, root: env.ARRA_PROJECTS_DIR, executable: exe, childPid: p.pid });
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line) {
          try { emit(JSON.parse(line)); }
          catch (error) { writeLog('error', 'sync.output-json', { mode, only, line, error }); }
        }
      }
    });
    p.stderr.on('data', (d) => emit({ type: 'stderr', msg: d.toString('utf8').slice(0, 300) }));
    p.on('close', (code, signal) => {
      writeLog(code ? 'error' : 'info', 'sync.closed', { mode, only, code, signal });
      const blocked = syncRuntime.lastEvent?.type === 'blocked';
      syncProc = null;
      if (!code && blocked && mode !== 'status' && retryAttempt < 2) {
        const nextAttempt = retryAttempt + 1;
        emit({ type: 'phase', stage: 'automatic-retry', msg: `Файл был занят · повторяю автоматически (${nextAttempt}/2)` });
        writeLog('warn', 'sync.autoretry', { mode, only, retryAttempt: nextAttempt });
        setTimeout(() => {
          runManagedSync(mode, only, role, remoteEmit, nextAttempt).catch((error) => {
            emit({ type: 'error', error: error.message || 'Автоматический повтор не запустился' });
          });
        }, 900);
        return;
      }
      if (code && syncRuntime.lastEvent?.type !== 'error') {
        emit({ type: 'error', error: `Процесс синхронизации завершился с кодом ${code}. Подробности записаны в журнал Noda.` });
      } else {
        emit({ type: 'closed', code });
      }
    });
    p.on('error', (e) => {
      syncProc = null;
      if (e.code === 'ENOENT' && fallback) { tryExe(fallback, null); return; }
      emit({ type: 'error', error: 'Python не запустился: ' + e.message + '. Проверь установку Python 3 и перезапусти проверку.' });
    });
    return true;
  };
  return tryExe('python', 'py');
}
ipcMain.handle('sync-run', (_e, { mode, only, role } = {}) => runManagedSync(mode || 'status', only || null, role || null));
ipcMain.handle('sync-local-inventory', () => localSyncInventory());
ipcMain.handle('workspace-settings', () => ({
  codeRoot: codeRoot(),
  downloadFolder: currentFolder(),
  localAiUrl: localAiBase(),
  deviceName: settings.deviceName || os.hostname(),
  deviceRole: settings.deviceProfile?.role || '',
}));
ipcMain.handle('project-environment', (_event, projectPath) => {
  const requested = path.resolve(String(projectPath || ''));
  const root = path.resolve(codeRoot());
  const relative = path.relative(root, requested);
  if (!projectPath || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false, error: 'Проект находится вне рабочей папки' };
  }
  try {
    if (!fs.statSync(requested).isDirectory()) throw new Error('Папка проекта не найдена');
    const runGit = (args, timeout = 6000) => {
      const result = spawnSync('git', args, { cwd: requested, encoding: 'utf8', windowsHide: true, timeout });
      if (result.error) throw result.error;
      return { stdout: String(result.stdout || '').trim(), stderr: String(result.stderr || '').trim(), status: result.status };
    };
    const inside = runGit(['rev-parse', '--is-inside-work-tree']);
    if (inside.status !== 0 || inside.stdout !== 'true') return { ok: true, git: false, path: requested };
    const branchResult = runGit(['branch', '--show-current']);
    const statusResult = runGit(['status', '--porcelain=v1']);
    const diffResult = runGit(['diff', 'HEAD', '--numstat']);
    const remoteResult = runGit(['remote', '-v']);
    const files = statusResult.stdout ? statusResult.stdout.split(/\r?\n/).filter(Boolean) : [];
    let additions = 0;
    let deletions = 0;
    for (const line of diffResult.stdout.split(/\r?\n/)) {
      const [added, deleted] = line.split(/\s+/);
      if (/^\d+$/.test(added)) additions += Number(added);
      if (/^\d+$/.test(deleted)) deletions += Number(deleted);
    }
    let ahead = 0;
    let behind = 0;
    try {
      const upstream = runGit(['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
      const [behindValue, aheadValue] = upstream.stdout.split(/\s+/).map(Number);
      behind = Number.isFinite(behindValue) ? behindValue : 0;
      ahead = Number.isFinite(aheadValue) ? aheadValue : 0;
    } catch {}
    return {
      ok: true,
      git: true,
      path: requested,
      branch: branchResult.stdout || 'HEAD',
      changes: files.length,
      additions,
      deletions,
      ahead,
      behind,
      remote: remoteResult.stdout.split(/\r?\n/).find((line) => /\(fetch\)$/.test(line)) || '',
      files: files.slice(0, 12).map((line) => ({ status: line.slice(0, 2).trim() || 'M', path: line.slice(3).trim() })),
    };
  } catch (error) {
    writeLog('warn', 'workspace.project-environment', { projectPath: requested, error });
    return { ok: false, error: error.message || 'Не удалось прочитать состояние проекта' };
  }
});
ipcMain.handle('set-local-ai-url', (_event, value) => {
  try {
    const parsed = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Нужен адрес http:// или https://');
    settings.localAiUrl = parsed.toString().replace(/\/$/, '');
    saveSettings();
    return { ok: true, url: settings.localAiUrl };
  } catch (error) { return { ok: false, error: error.message || 'Неверный адрес' }; }
});
async function localModelsSnapshot() {
  try {
    const response = await localAiJson('GET', '/api/tags', null, 3500);
    const models = (response.models || []).map((model) => ({
      name: String(model.name || model.model || ''),
      size: Number(model.size) || 0,
      modifiedAt: model.modified_at || null,
      family: model.details?.family || '',
      parameterSize: model.details?.parameter_size || '',
    })).filter((model) => model.name);
    return { ok: true, provider: 'ollama', url: localAiBase(), models };
  } catch (ollamaError) {
    try {
      const response = await localAiJson('GET', '/v1/models', null, 3500);
      const models = (response.data || []).map((model) => ({
        name: String(model.id || ''),
        size: 0,
        modifiedAt: null,
        family: String(model.owned_by || 'OpenAI-compatible'),
        parameterSize: '',
      })).filter((model) => model.name);
      return { ok: true, provider: 'openai', url: localAiBase(), models };
    } catch (openAiError) {
      writeLog('warn', 'local-ai.models', { url: localAiBase(), ollamaError, openAiError });
      return { ok: false, url: localAiBase(), models: [], error: openAiError.message || ollamaError.message || 'Локальный AI не запущен' };
    }
  }
}

function localProjectSnapshot(project) {
  const requested = path.resolve(String(project?.path || ''));
  if (!project?.path || !fs.existsSync(requested)) return '';
  const root = path.resolve(codeRoot());
  const relative = path.relative(root, requested);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return '';
  try {
    if (!fs.statSync(requested).isDirectory()) return '';
    const ignored = new Set(['node_modules', '.git', 'dist', 'build', '.expo', '.next', '__pycache__']);
    const tree = [];
    for (const entry of fs.readdirSync(requested, { withFileTypes: true }).filter((item) => !ignored.has(item.name)).slice(0, 80)) {
      tree.push(entry.isDirectory() ? `${entry.name}/` : entry.name);
      if (entry.isDirectory()) {
        try {
          for (const child of fs.readdirSync(path.join(requested, entry.name), { withFileTypes: true }).filter((item) => !ignored.has(item.name)).slice(0, 18)) {
            tree.push(`  ${entry.name}/${child.name}${child.isDirectory() ? '/' : ''}`);
          }
        } catch {}
      }
    }
    const documents = [];
    for (const name of ['README.md', 'README.MD', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'AGENTS.md']) {
      const file = path.join(requested, name);
      try {
        if (fs.existsSync(file) && fs.statSync(file).size <= 120000) {
          documents.push(`--- ${name} ---\n${fs.readFileSync(file, 'utf8').slice(0, name.toLowerCase().startsWith('readme') ? 18000 : 9000)}`);
        }
      } catch {}
    }
    let git = '';
    try {
      const result = spawnSync('git', ['status', '--short', '--branch'], { cwd: requested, encoding: 'utf8', windowsHide: true, timeout: 5000 });
      git = String(result.stdout || '').trim().slice(0, 8000);
    } catch {}
    return [
      `Локальный снимок проекта «${String(project?.name || path.basename(requested)).slice(0, 100)}» на этом компьютере.`,
      `Путь: ${requested}`,
      tree.length ? `Структура (до двух уровней):\n${tree.join('\n')}` : '',
      git ? `Git status:\n${git}` : '',
      ...documents,
      'Снимок только для понимания контекста. Если для ответа нужен другой файл, попроси пользователя открыть его или перейти в терминал проекта.',
    ].filter(Boolean).join('\n\n').slice(0, 48000);
  } catch (error) {
    writeLog('warn', 'local-ai.project-context', { path: requested, error });
    return '';
  }
}

async function localChatCompletion({ model, messages, project } = {}) {
  try {
    const modelName = String(model || '').trim();
    if (!modelName) throw new Error('Выбери локальную модель');
    const safeMessages = (Array.isArray(messages) ? messages : []).slice(-40).map((message) => ({
      role: ['system', 'assistant'].includes(message?.role) ? message.role : 'user',
      content: String(message?.content || '').slice(0, 50000),
    })).filter((message) => message.content.trim());
    if (!safeMessages.length) throw new Error('Сообщение пустое');
    const projectContext = localProjectSnapshot(project);
    if (projectContext) safeMessages.unshift({ role: 'system', content: projectContext });
    let response;
    try {
      response = await localAiJson('POST', '/api/chat', {
        model: modelName,
        messages: safeMessages,
        stream: false,
        options: { temperature: 0.25 },
      }, 180000);
    } catch (ollamaError) {
      if (![404, 405].includes(Number(ollamaError.statusCode))) throw ollamaError;
      response = await localAiJson('POST', '/v1/chat/completions', {
        model: modelName,
        messages: safeMessages,
        stream: false,
        temperature: 0.25,
      }, 180000);
    }
    const content = String(response.message?.content || response.choices?.[0]?.message?.content || response.response || '').trim();
    if (!content) throw new Error('Локальная модель вернула пустой ответ');
    return { ok: true, message: { role: 'assistant', content }, model: modelName };
  } catch (error) {
    writeLog('error', 'local-ai.chat', { model, error });
    return { ok: false, error: error.message || 'Локальная модель недоступна' };
  }
}

ipcMain.handle('local-models', () => localModelsSnapshot());
ipcMain.handle('local-chat', (_event, payload = {}) => localChatCompletion(payload));
ipcMain.handle('sync-pause', () => {
  if (!syncProc?.stdin?.writable) return { ok: false, error: 'Передача сейчас не выполняется' };
  writeLog('info', 'sync.pause', { childPid: syncProc.pid });
  syncProc.stdin.write('pause\n');
  return { ok: true };
});
ipcMain.handle('sync-resume', () => {
  if (!syncProc?.stdin?.writable) return { ok: false, error: 'Передача сейчас не выполняется' };
  writeLog('info', 'sync.resume', { childPid: syncProc.pid });
  syncProc.stdin.write('resume\n');
  return { ok: true };
});
ipcMain.handle('sync-cancel', () => {
  if (syncProc) {
    writeLog('warn', 'sync.cancel', { childPid: syncProc.pid });
    try { syncProc.kill(); } catch (error) { writeLog('error', 'sync.cancel', error); }
    syncProc = null;
  }
  return true;
});

function listPotentialBlockers() {
  const terminalItems = [...ptys.entries()].map(([id, value]) => ({
    type: 'terminal', name: `Терминал ${id}`, title: value.cwd || '', pid: value.proc?.pid || null,
  }));
  if (process.platform !== 'win32') return Promise.resolve(terminalItems);
  const names = "'Code','Cursor','Claude','ChatGPT','WINWORD','EXCEL','POWERPNT','Acrobat','AcroRd32','devenv','notepad++','Obsidian'";
  const command = `$names=@(${names}); Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and (($names -contains $_.ProcessName) -or $_.ProcessName -like 'codex*') } | Select-Object ProcessName,Id,MainWindowTitle | ConvertTo-Json -Compress`;
  return new Promise((resolve) => {
    execFile('powershell.exe', psArgs(command), { encoding: 'utf8', windowsHide: true, timeout: 8000 }, (error, stdout) => {
      if (error) writeLog('error', 'sync.blockers.list', error);
      let rows = [];
      try { const parsed = JSON.parse(String(stdout || '').trim() || '[]'); rows = Array.isArray(parsed) ? parsed : [parsed]; } catch {}
      resolve([...terminalItems, ...rows.filter(Boolean).map((row) => {
        const rawName = row.ProcessName || 'Процесс';
        return {
          type: 'process', name: /^(chatgpt|codex)/i.test(rawName) ? 'Codex' : rawName,
          title: row.MainWindowTitle || '', pid: row.Id || null,
        };
      })]);
    });
  });
}

function normalizeProcessPids(pids) {
  return [...new Set((Array.isArray(pids) ? pids : []).map(Number).filter((pid) => pid > 0 && pid !== process.pid))];
}
function inspectProcesses(pids) {
  const safePids = normalizeProcessPids(pids);
  if (!safePids.length || process.platform !== 'win32') return Promise.resolve([]);
  const command = `$ids=@(${safePids.join(',')}); Get-Process -ErrorAction SilentlyContinue | Where-Object { $ids -contains $_.Id } | Select-Object ProcessName,Id,MainWindowTitle,Responding | ConvertTo-Json -Compress`;
  return new Promise((resolve) => {
    execFile('powershell.exe', psArgs(command), { encoding: 'utf8', windowsHide: true, timeout: 8000 }, (error, stdout) => {
      if (error && !/Cannot find a process|Не удается найти процесс/i.test(String(error.message || ''))) {
        writeLog('error', 'sync.blockers.inspect', { pids: safePids, error });
      }
      let rows = [];
      try { const parsed = JSON.parse(String(stdout || '').trim() || '[]'); rows = Array.isArray(parsed) ? parsed : [parsed]; }
      catch (parseError) { writeLog('error', 'sync.blockers.inspect-json', { pids: safePids, error: parseError, stdout }); }
      resolve(rows.filter(Boolean).map((row) => ({
        pid: Number(row.Id), name: String(row.ProcessName || 'Процесс'),
        title: String(row.MainWindowTitle || ''), responding: row.Responding !== false,
      })));
    });
  });
}
async function waitForProcessExit(pids, timeoutMs) {
  const started = Date.now();
  let remaining = await inspectProcesses(pids);
  while (remaining.length && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 650));
    remaining = await inspectProcesses(pids);
  }
  return remaining;
}

async function closePotentialBlockers(pids = []) {
  const safePids = normalizeProcessPids(pids);
  if (!safePids.length) return { ok: true, requested: 0, closed: 0, remaining: [] };
  if (process.platform !== 'win32') return { ok: false, error: 'Закрытие сессий поддерживается только в Windows' };
  writeLog('info', 'sync.blockers.close-request', { pids: safePids });
  const before = await inspectProcesses(safePids);

  // node-pty не создаёт обычное окно Windows: закрываем его через собственный API,
  // иначе CloseMainWindow всегда возвращает false и терминал навечно остаётся в списке.
  const terminalPids = new Set();
  for (const [termId, value] of [...ptys.entries()]) {
    const pid = Number(value.proc?.pid);
    if (safePids.includes(pid)) {
      terminalPids.add(pid);
      killPty(termId);
    }
  }

  const processPids = safePids.filter((pid) => !terminalPids.has(pid));
  let closeError = null;
  if (processPids.length) {
    const command = [
      `$ids=@(${processPids.join(',')})`,
      '$items=Get-Process -ErrorAction SilentlyContinue | Where-Object { $ids -contains $_.Id }',
      'foreach($p in $items){',
      '  if($p.MainWindowHandle -ne 0){ [void]$p.CloseMainWindow() }',
      '  else { Stop-Process -Id $p.Id -ErrorAction SilentlyContinue }',
      '}',
    ].join('; ');
    closeError = await new Promise((resolve) => {
      execFile('powershell.exe', psArgs(command), { encoding: 'utf8', windowsHide: true, timeout: 12000 }, (error) => resolve(error || null));
    });
  }

  const remaining = await waitForProcessExit(safePids, 15000);
  if (closeError && !remaining.some((item) => processPids.includes(item.pid))) closeError = null;
  if (closeError) writeLog('error', 'sync.blockers.close-command', { pids: processPids, error: closeError });
  const remainingPids = new Set(remaining.map((item) => item.pid));
  const closed = before.filter((item) => !remainingPids.has(item.pid));
  const result = { ok: !closeError, requested: safePids.length, closed: closed.length, closedItems: closed, remaining, needsForce: remaining.length > 0 };
  if (closeError) result.error = closeError.message;
  writeLog(remaining.length ? 'warn' : 'info', 'sync.blockers.close-result', result);
  return result;
}

async function forceClosePotentialBlockers(pids = []) {
  const safePids = normalizeProcessPids(pids);
  if (!safePids.length) return { ok: true, requested: 0, closed: 0, remaining: [] };
  if (process.platform !== 'win32') return { ok: false, error: 'Принудительное закрытие поддерживается только в Windows' };
  writeLog('warn', 'sync.blockers.force-request', { pids: safePids });
  const before = await inspectProcesses(safePids);
  const terminalPids = new Set();
  for (const [termId, value] of [...ptys.entries()]) {
    const pid = Number(value.proc?.pid);
    if (safePids.includes(pid)) {
      terminalPids.add(pid);
      killPty(termId);
    }
  }
  const processPids = safePids.filter((pid) => !terminalPids.has(pid));
  let forceError = null;
  if (processPids.length) {
    const command = `$ids=@(${processPids.join(',')}); Get-Process -ErrorAction SilentlyContinue | Where-Object { $ids -contains $_.Id } | Stop-Process -Force -ErrorAction SilentlyContinue`;
    forceError = await new Promise((resolve) => {
      execFile('powershell.exe', psArgs(command), { encoding: 'utf8', windowsHide: true, timeout: 12000 }, (error) => resolve(error || null));
    });
  }
  const remaining = await waitForProcessExit(safePids, 6000);
  if (forceError && !remaining.some((item) => processPids.includes(item.pid))) forceError = null;
  if (forceError) writeLog('error', 'sync.blockers.force-command', { pids: processPids, error: forceError });
  const remainingPids = new Set(remaining.map((item) => item.pid));
  const closed = before.filter((item) => !remainingPids.has(item.pid));
  const result = { ok: !forceError && !remaining.length, requested: safePids.length, closed: closed.length, closedItems: closed, remaining };
  if (forceError) result.error = forceError.message;
  else if (remaining.length) result.error = 'Некоторые процессы не завершились даже принудительно';
  writeLog(result.ok ? 'info' : 'error', 'sync.blockers.force-result', result);
  return result;
}

ipcMain.handle('sync-blockers', () => listPotentialBlockers());
ipcMain.handle('sync-close-blockers', (_e, pids = []) => closePotentialBlockers(pids));
ipcMain.handle('sync-force-close-blockers', (_e, pids = []) => forceClosePotentialBlockers(pids));
ipcMain.handle('remote-sync', async (_e, { deviceId, mode = 'push' } = {}) => {
  if (!deviceId) return { ok: false, error: 'Устройство не выбрано' };
  const jwt = await getJwt();
  if (!jwt) return { ok: false, error: 'Нет авторизации' };
  const reqId = `sync-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  try {
    const remoteWs = new WebSocket(`${CLIENT_WS_URL}?token=${encodeURIComponent(jwt)}`);
    const timeout = setTimeout(() => { try { remoteWs.close(); } catch {} }, 30 * 60 * 1000);
    remoteWs.on('open', () => remoteWs.send(JSON.stringify({
      to: 'pc', deviceId, clientKind: 'desktop',
      type: mode === 'status' ? 'sync_remote_status' : (mode === 'pull' ? 'sync_remote_pull' : 'sync_remote_push'), reqId,
    })));
    remoteWs.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.reqId !== reqId) return;
      winSend('remote-sync-event', message);
      const eventType = message.event?.type;
      if (message.type === 'pc_offline' || eventType === 'done' || eventType === 'error' || eventType === 'closed') {
        clearTimeout(timeout);
        try { remoteWs.close(); } catch {}
      }
    });
    remoteWs.on('error', (error) => {
      writeLog('error', 'sync.remote-websocket', { deviceId, reqId, error });
      winSend('remote-sync-event', { type: 'sync_remote_event', reqId, event: { type: 'error', error: error.message || 'Нет связи' } });
    });
    return { ok: true, reqId };
  } catch (error) {
    writeLog('error', 'sync.remote-start', { deviceId, reqId, error });
    return { ok: false, error: error.message || 'Команда не отправлена' };
  }
});

// Полный удалённый экран между двумя Noda. Команды идут по уже авторизованному
// agent-сокету: ноутбук → сервер → выбранный ПК; кадры возвращаются тем же путём.
ipcMain.handle('remote-screen-send', (_e, { deviceId, message } = {}) => {
  if (!deviceId) return { ok: false, error: 'Устройство не выбрано' };
  if (!ws || ws.readyState !== WebSocket.OPEN) return { ok: false, error: 'Нет связи с сервером' };
  try {
    ws.send(JSON.stringify({
      to: 'agent', deviceId, clientKind: 'desktop', ...(message || {}),
    }));
    return { ok: true };
  } catch (error) {
    writeLog('error', 'remote-screen.send', { deviceId, type: message?.type, error });
    return { ok: false, error: error.message || 'Команда не отправлена' };
  }
});

ipcMain.on('remote-capture-ready', (event) => {
  if (!captureWin || captureWin.isDestroyed() || event.sender !== captureWin.webContents) return;
  captureWindowReady = true;
  if (captureWindowConfig) sendCaptureWindow('remote-capture-start', captureWindowConfig);
  const queuedSignals = pendingCaptureSignals;
  pendingCaptureSignals = [];
  for (const signal of queuedSignals) sendCaptureWindow('remote-capture-rtc-signal', signal);
});

ipcMain.on('remote-capture-rtc-signal', (event, signal = {}) => {
  if (!captureWin || captureWin.isDestroyed() || event.sender !== captureWin.webContents) return;
  emitScreenMessage({ type: 'screen_rtc_signal', role: 'host', signal });
});

ipcMain.on('remote-capture-rtc-state', (event, payload = {}) => {
  if (!captureWin || captureWin.isDestroyed() || event.sender !== captureWin.webContents) return;
  const state = String(payload.state || '');
  rtcCaptureConnected = state === 'connected'
    || (rtcCaptureConnected && !['failed', 'closed', 'disconnected'].includes(state));
  if (state === 'connected') {
    captureEngine = 'webrtc';
    if (screenTimer) { clearTimeout(screenTimer); screenTimer = null; }
    if (captureFallbackTimer) { clearTimeout(captureFallbackTimer); captureFallbackTimer = null; }
  }
  writeLog(state === 'failed' ? 'error' : 'info', 'remote.capture.rtc-state', payload);
  emitScreenMessage({ type: 'screen_rtc_state', role: 'host', ...payload });
  sendScreenHealth({ rtcState: state, audio: !!payload.audio });
});

ipcMain.on('remote-capture-input', (event, payload = {}) => {
  if (!captureWin || captureWin.isDestroyed() || event.sender !== captureWin.webContents) return;
  screenInput(payload, (ack) => sendCaptureWindow('remote-capture-input-ack', ack));
});

ipcMain.on('remote-capture-frame', (event, payload = {}) => {
  if (!captureWin || captureWin.isDestroyed() || event.sender !== captureWin.webContents) return;
  if (!captureWindowConfig || !screenEmit || !payload.data) return;
  if (screenSocketBackedUp()) { captureDropped += 1; return; }
  try {
    const buffer = Buffer.from(payload.data);
    if (!buffer.length || buffer.length > 8 * 1024 * 1024) return;
    if (screenTimer) { clearTimeout(screenTimer); screenTimer = null; }
    if (captureFallbackTimer) { clearTimeout(captureFallbackTimer); captureFallbackTimer = null; }
    captureEngine = 'stream';
    captureFrames += 1;
    captureBytes += buffer.length;
    lastCaptureMs = Date.now();
    emitScreenMessage({
      type: 'screen_frame',
      data: buffer.toString('base64'),
      w: Number(payload.w) || captureWindowConfig.width,
      h: Number(payload.h) || captureWindowConfig.height,
      engine: captureEngine,
      capturedAt: Number(payload.capturedAt) || Date.now(),
      captureMs: Number(payload.captureMs) || 0,
      frameSeq: captureFrames,
    });
    if (captureFrames === 1 || Date.now() - captureLogAt > 5000) {
      captureLogAt = Date.now();
      const elapsed = Math.max(1, Date.now() - captureStartedAt);
      const actualFps = Math.round(captureFrames * 10000 / elapsed) / 10;
      writeLog('info', 'remote.capture.frame', {
        displayId: captureWindowConfig.displayId, engine: captureEngine, bytes: buffer.length,
        frames: captureFrames, dropped: captureDropped, actualFps, captureMs: Number(payload.captureMs) || 0,
        socketBuffered: ws?.bufferedAmount || 0,
      });
      sendScreenHealth({ actualFps, dropped: captureDropped, avgKB: Math.round(captureBytes / captureFrames / 1024) });
    }
  } catch (error) {
    captureFailures += 1;
    writeLog('error', 'remote.capture.stream-frame', error);
  }
});

ipcMain.on('remote-capture-error', (event, payload = {}) => {
  if (!captureWin || captureWin.isDestroyed() || event.sender !== captureWin.webContents) return;
  captureFailures += 1;
  const message = String(payload.message || 'Потоковый захват экрана завершился ошибкой');
  writeLog('error', 'remote.capture.stream', { message, stack: payload.stack || '' });
  startLegacyCapture(message);
});

// ---- Терминал/код: локальное использование самим ПК-приложением ----
ipcMain.on('term', (_e, msg) => {
  if (!msg || typeof msg !== 'object') return;
  handleRelay(msg, (o) => winSend('term-event', o));
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
ipcMain.on('pty-input', (_e, { d, termId } = {}) => ptyWrite(termId || 'L1', d, 'pc'));
ipcMain.on('pty-resize', (_e, { cols, rows, termId } = {}) => ptyResize(termId || 'L1', cols, rows, 'pc'));
ipcMain.on('pty-restart', (_e, { cols, rows, termId } = {}) => restartPty(termId || 'L1', cols, rows, null, true));
ipcMain.on('pty-kill', (_e, { termId } = {}) => killPty(termId || 'L1'));

ipcMain.on('win-min', () => win?.minimize());
ipcMain.handle('win-max', () => {
  if (!win || win.isDestroyed()) return { ok: false };
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return { ok: true, maximized: win.isMaximized() };
});
ipcMain.on('win-close', () => { manualClose = true; try { ws?.close(); } catch {} app.quit(); });
