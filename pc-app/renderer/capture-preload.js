const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nodaCapture', {
  ready: () => ipcRenderer.send('remote-capture-ready'),
  frame: (payload) => ipcRenderer.send('remote-capture-frame', payload),
  error: (payload) => ipcRenderer.send('remote-capture-error', payload),
  signal: (payload) => ipcRenderer.send('remote-capture-rtc-signal', payload),
  rtcState: (payload) => ipcRenderer.send('remote-capture-rtc-state', payload),
  input: (payload) => ipcRenderer.send('remote-capture-input', payload),
  onStart: (callback) => ipcRenderer.on('remote-capture-start', (_event, config) => callback(config)),
  onStop: (callback) => ipcRenderer.on('remote-capture-stop', () => callback()),
  onRtcSignal: (callback) => ipcRenderer.on('remote-capture-rtc-signal', (_event, payload) => callback(payload)),
  onInputAck: (callback) => ipcRenderer.on('remote-capture-input-ack', (_event, payload) => callback(payload)),
});
