const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, ipcMain, screen, shell, clipboard } = require('electron');
const path = require('path');
const { store, recordUsage, getUsage, DEFAULT_SHORTCUT } = require('./utils/store');
const { captureActiveFieldText, replaceActiveFieldText } = require('./utils/clipboard');
const { enhancePrompt, testApiKey, ApiError } = require('./utils/api');

const isDev = process.env.NODE_ENV === 'development';
const DEV_SERVER_URL = 'http://localhost:5173';

// Combos that are actively broken as global shortcuts on Windows and must not
// survive from an older install. Alt+<letter> is swallowed by the OS menu
// mnemonic system; Ctrl+Alt+<letter> is AltGr and types stray characters.
const BROKEN_SHORTCUTS = [/^Alt\+[A-Z]$/i, /^(Control|CommandOrControl)\+Alt\+[A-Z]$/i];

let tray = null;
let overlayWindow = null;
let settingsWindow = null;
let onboardingWindow = null;
let lastRawPrompt = '';

function rendererURL(hash) {
  if (isDev) return `${DEV_SERVER_URL}/#${hash}`;
  return `file://${path.join(__dirname, '..', 'dist', 'index.html')}#${hash}`;
}

function trayIconPath(name) {
  return path.join(__dirname, '..', 'assets', name);
}

// ---------- Overlay window ----------

function overlayPositionFor(win) {
  const position = store.get('overlayPosition');
  const { width, height } = win.getBounds();
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x: wx, y: wy, width: ww, height: wh } = display.workArea;

  if (position === 'cursor') {
    const cursor = screen.getCursorScreenPoint();
    let x = cursor.x - width / 2;
    let y = cursor.y + 20;
    x = Math.max(wx, Math.min(x, wx + ww - width));
    y = Math.max(wy, Math.min(y, wy + wh - height));
    return { x: Math.round(x), y: Math.round(y) };
  }
  if (position === 'bottom-right') {
    return { x: Math.round(wx + ww - width - 24), y: Math.round(wy + wh - height - 24) };
  }
  return { x: Math.round(wx + (ww - width) / 2), y: Math.round(wy + (wh - height) / 2) };
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  overlayWindow = new BrowserWindow({
    width: 640,
    height: 560,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    show: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.loadURL(rendererURL('/overlay'));
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  // Hide instead of destroy so the next invocation is instant.
  overlayWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      overlayWindow.hide();
    }
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

async function waitForOverlayReady(win) {
  if (win.webContents.isLoading()) {
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  }
}

async function showOverlay(win) {
  await waitForOverlayReady(win);
  const pos = overlayPositionFor(win);
  win.setPosition(pos.x, pos.y);
  win.show();
  win.focus();
}

async function showOverlayWithCapture() {
  const win = createOverlayWindow();

  // Capture BEFORE showing any window of our own, otherwise the copy
  // keystrokes would target our overlay instead of the user's app.
  const capture = await captureActiveFieldText();
  console.log('[PromptBooster] captured', {
    empty: capture.empty,
    viaSelectAll: capture.usedSelectAll,
    chars: capture.text.length
  });

  await showOverlay(win);

  if (capture.empty) {
    // Don't bail out with a toast that vanishes — drop into manual mode so the
    // user can just type or paste the prompt themselves.
    lastRawPrompt = '';
    win.webContents.send('capture:empty');
    return;
  }

  lastRawPrompt = capture.text;
  win.webContents.send('capture:result', {
    text: capture.text,
    truncated: capture.truncated
  });

  runEnhancement(capture.text, store.get('enhancementStyle'));
}

// Opens the overlay directly in manual mode — no capture, just an input box.
async function showOverlayManual(prefill = '') {
  const win = createOverlayWindow();
  await showOverlay(win);
  lastRawPrompt = prefill;
  win.webContents.send('overlay:manual', { text: prefill });
}

async function runEnhancement(rawPrompt, style) {
  const win = overlayWindow;
  if (!win || win.isDestroyed()) return;

  lastRawPrompt = rawPrompt;
  win.webContents.send('enhance:start');
  tray?.setToolTip('PromptBooster — enhancing...');

  try {
    const apiKey = store.get('apiKey');
    const enhanced = await enhancePrompt(rawPrompt, style, apiKey);
    const usage = recordUsage();
    refreshTrayMenu();
    win.webContents.send('enhance:success', { enhanced, usage, rawPrompt });
  } catch (err) {
    const code = err instanceof ApiError ? err.code : 'UNKNOWN';
    console.error('[PromptBooster] enhance failed:', code, err.message);
    win.webContents.send('enhance:error', { code, message: err.message });
  } finally {
    tray?.setToolTip('PromptBooster');
  }
}

// ---------- Settings window ----------

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 540,
    height: 680,
    title: 'PromptBooster Settings',
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadURL(rendererURL('/settings'));
  settingsWindow.setMenuBarVisibility(false);

  settingsWindow.on('closed', () => {
    settingsWindow = null;
    registerGlobalShortcut(store.get('globalShortcut'));
  });

  return settingsWindow;
}

// ---------- Onboarding window ----------

function createOnboardingWindow() {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.focus();
    return onboardingWindow;
  }

  onboardingWindow = new BrowserWindow({
    width: 580,
    height: 660,
    title: 'Welcome to PromptBooster',
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  onboardingWindow.loadURL(rendererURL('/onboarding'));
  onboardingWindow.setMenuBarVisibility(false);

  onboardingWindow.on('closed', () => {
    onboardingWindow = null;
  });

  return onboardingWindow;
}

// ---------- Global shortcut ----------

function sanitizeShortcut(accelerator) {
  if (!accelerator || BROKEN_SHORTCUTS.some((re) => re.test(accelerator))) {
    return DEFAULT_SHORTCUT;
  }
  return accelerator;
}

function registerGlobalShortcut(accelerator) {
  globalShortcut.unregisterAll();

  const wanted = sanitizeShortcut(accelerator);
  if (wanted !== accelerator) {
    console.warn('[PromptBooster] replaced unusable shortcut', accelerator, '->', wanted);
    store.set('globalShortcut', wanted);
  }

  let ok = false;
  try {
    ok = globalShortcut.register(wanted, () => showOverlayWithCapture());
  } catch (err) {
    console.error('[PromptBooster] shortcut register threw:', err.message);
  }

  // Another app may already own the combo — fall back so the app is never
  // left with no working shortcut at all.
  if (!ok && wanted !== DEFAULT_SHORTCUT) {
    console.warn('[PromptBooster] could not register', wanted, '— falling back');
    store.set('globalShortcut', DEFAULT_SHORTCUT);
    ok = globalShortcut.register(DEFAULT_SHORTCUT, () => showOverlayWithCapture());
  }

  console.log('[PromptBooster] shortcut', store.get('globalShortcut'), ok ? 'registered' : 'FAILED');
  refreshTrayMenu();
  return ok;
}

// ---------- Tray ----------

function buildTrayMenu() {
  const usage = getUsage();
  return Menu.buildFromTemplate([
    { label: `Enhance selection  (${store.get('globalShortcut')})`, click: () => showOverlayWithCapture() },
    { label: 'Write a prompt manually...', click: () => showOverlayManual() },
    { label: 'Enhance clipboard contents', click: () => showOverlayManual(clipboard.readText()) },
    { type: 'separator' },
    { label: 'Settings', click: () => createSettingsWindow() },
    { label: `Usage: ${usage.usageToday} prompts today`, enabled: false },
    { type: 'separator' },
    { label: 'Quit PromptBooster', click: () => app.quit() }
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(trayIconPath('tray-icon.png'));
  tray = new Tray(icon);
  tray.setToolTip('PromptBooster');
  tray.setContextMenu(buildTrayMenu());
  // Left-click opens manual mode; capture needs a real target app in focus,
  // and clicking the tray means our own shell already took focus.
  tray.on('click', () => showOverlayManual());
}

function refreshTrayMenu() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu());
}

// ---------- IPC ----------

function registerIpcHandlers() {
  ipcMain.handle('overlay:close', () => overlayWindow?.hide());

  ipcMain.handle('overlay:regenerate', async (_e, { rawPrompt, style }) => {
    await runEnhancement(rawPrompt || lastRawPrompt, style);
  });

  ipcMain.handle('overlay:enhanceManual', async (_e, { text, style }) => {
    if (!text || !text.trim()) return false;
    await runEnhancement(text.trim(), style);
    return true;
  });

  ipcMain.handle('overlay:copy', (_e, text) => {
    clipboard.writeText(text);
    return true;
  });

  ipcMain.handle('overlay:replace', async (_e, text) => {
    overlayWindow?.hide();
    // Give Windows a moment to hand focus back to the originating app.
    await new Promise((r) => setTimeout(r, 250));
    await replaceActiveFieldText(text);
    return true;
  });

  ipcMain.handle('overlay:openSettings', () => createSettingsWindow());

  ipcMain.handle('store:get', (_e, key) => store.get(key));
  ipcMain.handle('store:set', (_e, key, value) => {
    store.set(key, value);
    if (key === 'globalShortcut') registerGlobalShortcut(value);
    if (key === 'launchAtLogin') applyLoginItemSettings(value);
    refreshTrayMenu();
    return true;
  });
  ipcMain.handle('store:getAll', () => store.store);
  ipcMain.handle('store:clearApiKey', () => {
    store.set('apiKey', '');
    return true;
  });

  ipcMain.handle('api:testKey', async (_e, apiKey) => testApiKey(apiKey));

  ipcMain.handle('usage:get', () => getUsage());

  ipcMain.handle('onboarding:complete', () => {
    store.set('onboardingComplete', true);
    onboardingWindow?.close();
    registerGlobalShortcut(store.get('globalShortcut'));
  });

  ipcMain.handle('shortcut:capturing', (_e, capturing) => {
    if (capturing) globalShortcut.unregisterAll();
    else registerGlobalShortcut(store.get('globalShortcut'));
  });

  ipcMain.handle('shell:openExternal', (_e, url) => shell.openExternal(url));
}

function applyLoginItemSettings(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
}

// ---------- App lifecycle ----------

// A second launch should surface the existing tray app, not start a rival
// instance that fights over the same global shortcut.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showOverlayManual());

  app.whenReady().then(() => {
    registerIpcHandlers();
    createTray();
    applyLoginItemSettings(store.get('launchAtLogin'));

    if (!store.get('onboardingComplete')) {
      createOnboardingWindow();
    } else {
      registerGlobalShortcut(store.get('globalShortcut'));
    }
  });
}

// Tray app: closing every window must not quit.
app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
