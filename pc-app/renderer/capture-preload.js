const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nodaCapture', {
  ready: () => ipcRenderer.send('remote-capture-ready'),
  frame: (payload) => ipcRenderer.send('remote-capture-frame', payload),
  error: (payload) => ipcRenderer.send('remote-capture-error', payload),
  onStart: (callback) => ipcRenderer.on('remote-capture-start', (_event, config) => callback(config)),
  onStop: (callback) => ipcRenderer.on('remote-capture-stop', () => callback()),
});
