// Автообновление Noda через electron-updater (совместимый канал GitHub Releases arra123/arra-app).
// Скачивает новую версию в фоне и предлагает перезапуститься — без ручной перекачки.
const { app, dialog } = require('electron');

let started = false;

function initUpdater(getWin, winSend, writeLog = () => {}) {
  // В деве (не упакованное приложение) апдейтер не работает и мешает — пропускаем.
  if (!app.isPackaged) return;
  if (started) return;
  started = true;

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    writeLog('error', 'updater.module', e);
    return; // модуль не установлен — тихо выходим
  }

  autoUpdater.autoDownload = true;             // качаем сразу, как нашли
  autoUpdater.autoInstallOnAppQuit = true;     // если не перезапустили — поставится при выходе
  autoUpdater.allowPrerelease = false;

  const send = (state, payload) => {
    if (state === 'error') writeLog('error', 'updater.event', payload || {});
    else if (state !== 'progress') writeLog('info', `updater.${state}`, payload || {});
    try { winSend('update-event', { state, ...(payload || {}) }); } catch {}
  };

  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', (info) => send('available', { version: info && info.version }));
  autoUpdater.on('update-not-available', () => send('none'));
  autoUpdater.on('error', (err) => send('error', { message: String(err && err.message || err) }));
  autoUpdater.on('download-progress', (p) => send('progress', { percent: Math.round(p.percent || 0) }));

  autoUpdater.on('update-downloaded', (info) => {
    const version = info && info.version;
    send('ready', { version });
    const win = typeof getWin === 'function' ? getWin() : null;
    const opts = {
      type: 'info',
      buttons: ['Перезапустить и обновить', 'Позже'],
      defaultId: 0,
      cancelId: 1,
      title: 'Обновление Noda',
      message: 'Готова новая версия' + (version ? ' ' + version : ''),
      detail: 'Обновление уже скачано. Перезапустить сейчас, чтобы установить? Иначе поставится при следующем закрытии.',
      noLink: true,
    };
    const handle = (result) => {
      const idx = result && typeof result === 'object' ? result.response : result;
      if (idx === 0) { setImmediate(() => autoUpdater.quitAndInstall()); }
    };
    if (win && !win.isDestroyed()) dialog.showMessageBox(win, opts).then(handle);
    else dialog.showMessageBox(opts).then(handle);
  });

  const check = () => { autoUpdater.checkForUpdates().catch((e) => send('error', { message: String(e && e.message || e) })); };

  // Проверяем через 8 c после старта (не тормозим запуск), потом раз в 3 часа.
  setTimeout(check, 8000);
  setInterval(check, 3 * 60 * 60 * 1000);

  // Ручная проверка из UI.
  initUpdater._check = check;
  initUpdater._instance = autoUpdater;
}

// Ручной запуск проверки (из IPC).
function checkNow() {
  if (typeof initUpdater._check === 'function') initUpdater._check();
}

module.exports = { initUpdater, checkNow };
