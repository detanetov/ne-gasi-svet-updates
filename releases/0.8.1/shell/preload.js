const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  isApp: true,
  lanHost: () => ipcRenderer.invoke('lan-host'),
  lanJoin: (host) => ipcRenderer.invoke('lan-join', host),
  lanSend: (line) => ipcRenderer.send('lan-send', line),
  lanStop: () => ipcRenderer.send('lan-stop'),
  onLanMsg: (cb) => ipcRenderer.on('lan-msg', (_e, line) => cb(line)),
  onLanClosed: (cb) => ipcRenderer.on('lan-closed', () => cb()),
  quit: () => ipcRenderer.send('quit'),
  fullscreen: (v) => ipcRenderer.send('fullscreen', v),
  getFlags: () => ipcRenderer.invoke('flags-get'),
  setFlags: (f) => ipcRenderer.invoke('flags-set', f),
  openUrl: (u) => ipcRenderer.send('open-url', u),
  readStore: (k) => ipcRenderer.sendSync('store-read', k),
  writeStore: (k, text) => ipcRenderer.send('store-write', k, text)
});
