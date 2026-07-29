const Store = require('electron-store');

// Why Ctrl+Shift+F9 and not something snappier:
//  - No Alt. On Windows Ctrl+Alt is AltGr, so any Ctrl+Alt+<letter> combo can
//    type a stray character into the user's text field.
//  - A function key, so even if a modifier leaks through it cannot insert a
//    character the way a letter or Space would.
//  - Two modifiers, so it never collides with the OS Alt+<letter> menu
//    mnemonic system the way a bare Alt+P does.
//  - Effectively unbound in Cursor / VS Code / browsers / Office, unlike
//    Ctrl+Shift+P (command palette) or Ctrl+Shift+Space (parameter hints).
const DEFAULT_SHORTCUT = 'Control+Shift+F9';

const schema = {
  apiKey: { type: 'string', default: '' },
  enhancementStyle: { type: 'string', default: 'auto' },
  globalShortcut: { type: 'string', default: DEFAULT_SHORTCUT },
  overlayPosition: { type: 'string', default: 'center' },
  launchAtLogin: { type: 'boolean', default: false },
  onboardingComplete: { type: 'boolean', default: false },
  usageToday: { type: 'number', default: 0 },
  usageTotal: { type: 'number', default: 0 },
  usageLastDate: { type: 'string', default: '' }
};

const store = new Store({
  schema,
  encryptionKey: 'promptbooster-local-store-v1',
  name: 'promptbooster-config'
});

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function recordUsage() {
  const today = todayStr();
  const lastDate = store.get('usageLastDate');
  const usageToday = lastDate === today ? store.get('usageToday') + 1 : 1;
  store.set('usageToday', usageToday);
  store.set('usageTotal', store.get('usageTotal') + 1);
  store.set('usageLastDate', today);
  return { usageToday, usageTotal: store.get('usageTotal') };
}

function getUsage() {
  const today = todayStr();
  const lastDate = store.get('usageLastDate');
  return {
    usageToday: lastDate === today ? store.get('usageToday') : 0,
    usageTotal: store.get('usageTotal')
  };
}

module.exports = { store, recordUsage, getUsage, DEFAULT_SHORTCUT };
