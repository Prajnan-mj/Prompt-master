// Keystroke simulation via @nut-tree-fork/nut-js (maintained fork, better
// Windows support than robotjs).
const { keyboard, Key } = require('@nut-tree-fork/nut-js');

keyboard.config.autoDelayMs = 15;

const MODIFIERS = [
  Key.LeftControl,
  Key.RightControl,
  Key.LeftAlt,
  Key.RightAlt,
  Key.LeftShift,
  Key.RightShift,
  Key.LeftSuper,
  Key.RightSuper
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// THE critical step for a global-hotkey app.
//
// When the shortcut fires, the user is still physically holding its modifier
// keys down. Any key we synthesize is therefore combined with them: a
// simulated Ctrl+A arrives at the focused app as Ctrl+Alt+A (or Ctrl+Shift+A,
// etc.), which is not "select all" — so the capture silently does nothing.
// Worse, on Windows Ctrl+Alt is AltGr, so Ctrl+Alt+<letter> can *insert a
// character* into the user's text instead.
//
// Sending explicit key-up events for every modifier tells the OS they are
// released, even though they're still physically pressed, so the keystrokes
// we send afterwards are interpreted exactly as we intend.
async function releaseAllModifiers() {
  for (const key of MODIFIERS) {
    try {
      await keyboard.releaseKey(key);
    } catch {
      // A modifier that was never down can throw on some platforms; ignore.
    }
  }
  await sleep(60);
}

async function tap(...keys) {
  await keyboard.pressKey(...keys);
  await keyboard.releaseKey(...keys);
  await sleep(90);
}

async function sendCopy() {
  await tap(Key.LeftControl, Key.C);
}

async function sendSelectAll() {
  await tap(Key.LeftControl, Key.A);
}

async function sendPaste() {
  await tap(Key.LeftControl, Key.V);
}

module.exports = {
  releaseAllModifiers,
  sendCopy,
  sendSelectAll,
  sendPaste,
  sleep
};
