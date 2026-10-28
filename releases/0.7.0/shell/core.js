// Ядро оболочки «Ночного эфира»: окно, протокол app://, сеть по IP, флаги запуска.
// Лежит в папке игры и обновляется вместе с ней, поэтому саму программу перекачивать не нужно.
const { app, BrowserWindow, protocol, net: enet, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');
const { pathToFileURL } = require('url');

exports.version = 2;
let win = null, splash = null, gameRoot = '', ctx = {};
const LAN_PORT = 27315;
const flagsFile = () => path.join(app.getPath('userData'), 'flags.json');
const readFlags = () => { try { return JSON.parse(fs.readFileSync(flagsFile(), 'utf8')); } catch (e) { return {}; } };

exports.start = (c) => {
  ctx = c; gameRoot = c.gameRoot; splash = c.splash;
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(gameRoot, p));
    if (!file.startsWith(gameRoot)) return new Response('no', { status: 403 });
    return enet.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on('window-all-closed', () => { lanStop(); app.quit(); });
};

function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540, show: false,
    backgroundColor: '#000000', title: 'Ночной эфир', autoHideMenuBar: true,
    icon: path.join(gameRoot, 'icon.png'),
    webPreferences: { preload: fs.existsSync(path.join(gameRoot, 'shell', 'preload.js')) ? path.join(gameRoot, 'shell', 'preload.js') : path.join(ctx.shellDir, 'preload.js'), contextIsolation: true, backgroundThrottling: false }
  });
  win.loadURL('app://game/index.html' + (process.env.NGS_TEST ? '?q=low&norender=1' : ''));
  win.once('ready-to-show', () => { win.show(); if (splash && !splash.isDestroyed()) splash.close(); });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.type === 'keyDown' && input.key === 'F12' && input.control) win.webContents.toggleDevTools();
  });
}

// ---------- Игра по локальной сети / IP ----------
let server = null, sockets = [], client = null;
function send(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }
function attachLines(sock, onLine) {
  let buf = ''; sock.setEncoding('utf8'); sock.setNoDelay(true);
  sock.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) onLine(line); } });
}
function lanStop() {
  try { if (client) client.destroy(); } catch (e) {} client = null;
  for (const s of sockets) { try { s.destroy(); } catch (e) {} } sockets = [];
  try { if (server) server.close(); } catch (e) {} server = null;
}
function localIPs() { const out = []; for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address); return out; }

ipcMain.handle('lan-host', async () => {
  lanStop();
  return await new Promise((resolve) => {
    server = net.createServer((sock) => {
      sockets.push(sock);
      attachLines(sock, (line) => { for (const o of sockets) if (o !== sock && !o.destroyed) o.write(line + '\n'); send('lan-msg', line); });
      const drop = () => { sockets = sockets.filter((s) => s !== sock); };
      sock.on('close', drop); sock.on('error', drop);
    });
    server.on('error', (err) => resolve({ ok: false, error: String(err.message || err) }));
    server.listen(LAN_PORT, '0.0.0.0', () => resolve({ ok: true, ips: localIPs(), port: LAN_PORT }));
  });
});
ipcMain.handle('lan-join', async (_e, host) => {
  lanStop();
  return await new Promise((resolve) => {
    let done = false; const [h, p] = String(host).trim().split(':');
    client = net.connect({ host: h, port: Number(p) || LAN_PORT }, () => { done = true; resolve({ ok: true }); });
    client.setTimeout(6000, () => { if (!done) { done = true; client.destroy(); resolve({ ok: false, error: 'Нет ответа от хоста' }); } });
    client.on('connect', () => client.setTimeout(0));
    client.on('error', (err) => { if (!done) { done = true; resolve({ ok: false, error: String(err.message || err) }); } else send('lan-closed', 1); });
    client.on('close', () => { if (done) send('lan-closed', 1); });
    attachLines(client, (line) => send('lan-msg', line));
  });
});
ipcMain.on('lan-send', (_e, line) => {
  if (server) for (const s of sockets) if (!s.destroyed) s.write(line + '\n');
  if (client && !client.destroyed) client.write(line + '\n');
});
ipcMain.on('lan-stop', () => lanStop());
ipcMain.on('quit', () => app.quit());
ipcMain.on('fullscreen', (_e, v) => { if (win) win.setFullScreen(!!v); });

// флаги запуска (применяются при следующем старте программы)
ipcMain.handle('flags-get', () => ({ ...readFlags(), shell: ctx.shellVersion, core: exports.version }));
ipcMain.handle('flags-set', (_e, f) => { const cur = readFlags(); const next = { ...cur, ...f }; try { fs.writeFileSync(flagsFile(), JSON.stringify(next)); } catch (e) { return false; } return true; });
ipcMain.on('open-url', (_e, u) => { if (/^https:\/\/github\.com\//.test(String(u))) shell.openExternal(String(u)); });
