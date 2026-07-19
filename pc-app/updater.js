// Автообновление Noda через electron-updater (совместимый канал GitHub Releases arra123/arra-app).
// Скачивает новую версию в фоне и предлагает перезапуститься — без ручной перекачки.
const { app } = require('electron');

let started = false;
let manualInstallRequested = false;
let downloadedVersion = '';
let lastState = { state: 'idle' };

function initUpdater(getWin, winSend, writeLog = () => {}) {
  // В деве нет установленного NSIS-приложения, поэтому обновлять нечего.
  if (!app.isPackaged) {
    initUpdater._error = 'Обновление доступно только в установленной версии Noda';
    return;
  }
  if (started) return;
  started = true;

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    initUpdater._error = 'Служба обновления не загрузилась';
    writeLog('error', 'updater.module', e);
    return; // модуль не установлен — тихо выходим
  }

  autoUpdater.autoDownload = true;             // качаем сразу, как нашли
  autoUpdater.autoInstallOnAppQuit = true;     // если не перезапустили — поставится при выходе
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.allowPrerelease = false;

  const send = (state, payload) => {
    lastState = { state, ...(payload || {}) };
    if (state === 'error') writeLog('error', 'updater.event', payload || {});
    else if (state !== 'progress') writeLog('info', `updater.${state}`, payload || {});
    try { winSend('update-event', { state, ...(payload || {}) }); } catch {}
  };

  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', (info) => send('available', { version: info && info.version }));
  autoUpdater.on('update-not-available', (info) => {
    manualInstallRequested = false;
    send('none', { version: info?.version || app.getVersion() });
  });
  autoUpdater.on('error', (err) => {
    manualInstallRequested = false;
    send('error', { message: String(err && err.message || err), code: err?.code || '' });
  });
  autoUpdater.on('download-progress', (p) => send('progress', {
    percent: Math.round(p.percent || 0),
    transferred: Number(p.transferred || 0),
    total: Number(p.total || 0),
    bytesPerSecond: Number(p.bytesPerSecond || 0),
  }));

  autoUpdater.on('update-downloaded', (info) => {
    const version = info && info.version;
    downloadedVersion = version || '';
    send('ready', { version });
    // Ручная кнопка — это одно действие до конца: после проверки, загрузки и
    // проверки SHA512 приложение само перезапускается в установщик NSIS.
    if (manualInstallRequested) {
      manualInstallRequested = false;
      send('installing', { version });
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 900);
    }
  });

  const check = async (manual = false) => {
    if (manual) manualInstallRequested = true;
    if (manual && downloadedVersion) {
      send('installing', { version: downloadedVersion });
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 500);
      return { ok: true, state: 'installing', version: downloadedVersion };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, state: lastState.state, version: result?.updateInfo?.version || '' };
    } catch (error) {
      manualInstallRequested = false;
      const message = String(error?.message || error);
      send('error', { message, code: error?.code || '' });
      return { ok: false, state: 'error', error: message };
    }
  };

  // Проверяем через 8 c после старта (не тормозим запуск), потом раз в 3 часа.
  const startupTimer = setTimeout(() => check(false), 8000);
  const periodicTimer = setInterval(() => check(false), 3 * 60 * 60 * 1000);
  startupTimer.unref?.();
  periodicTimer.unref?.();

  // Ручная проверка из UI.
  initUpdater._check = () => check(true);
  initUpdater._instance = autoUpdater;
}

// Ручной запуск проверки (из IPC).
async function checkNow() {
  if (typeof initUpdater._check === 'function') return initUpdater._check();
  return { ok: false, state: 'unavailable', error: initUpdater._error || 'Модуль обновления ещё не готов' };
}

module.exports = { initUpdater, checkNow };
