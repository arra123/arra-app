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

  // Фоновая проверка каждые 15 минут остаётся полностью тихой — её отчёты («проверяю»,
  // «уже последняя», ошибка сети) не должны всплывать тостами поверх работы.
  // В UI уходят только результаты ручной проверки и то, что касается всех:
  // найденная версия, прогресс загрузки и готовность к установке.
  let manual = false;
  const QUIET = new Set(['checking', 'none', 'error']);

  const send = (state, payload) => {
    if (state === 'error') writeLog('error', 'updater.event', payload || {});
    else if (state !== 'progress') writeLog('info', `updater.${state}`, payload || {});
    if (QUIET.has(state) && !manual) return;
    try { winSend('update-event', { state, ...(payload || {}) }); } catch {}
  };

  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', (info) => send('available', { version: info && info.version }));
  autoUpdater.on('update-not-available', () => { send('none'); manual = false; });
  autoUpdater.on('error', (err) => { send('error', { message: String(err && err.message || err) }); manual = false; });
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

  // Ошибку отдаём одним путём — через событие 'error'. Иначе один сбой сети
  // приходил дважды: и из промиса, и из обработчика, и тостов было два.
  const check = () => { autoUpdater.checkForUpdates().catch(() => {}); };

  // Проверяем через 8 c после старта (не тормозим запуск), потом каждые 15 минут.
  setTimeout(check, 8000);
  setInterval(check, 15 * 60 * 1000);

  // Ручная проверка из UI — только она вправе отчитываться тостами.
  initUpdater._check = () => { manual = true; check(); };
  initUpdater._instance = autoUpdater;
}

// Ручной запуск проверки (из IPC).
function checkNow() {
  if (typeof initUpdater._check === 'function') initUpdater._check();
}

module.exports = { initUpdater, checkNow };
