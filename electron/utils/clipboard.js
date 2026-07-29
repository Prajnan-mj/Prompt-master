const { clipboard } = require('electron');
const {
  releaseAllModifiers,
  sendCopy,
  sendSelectAll,
  sendPaste,
  sleep
} = require('./keystroke');

const MAX_CHARS = 4000;

// A unique marker parked on the clipboard before copying. If it's still there
// afterwards, the copy produced nothing — which is how we tell "empty field"
// apart from "the user really did copy this text".
function sentinel() {
  return `__PROMPTBOOSTER_SENTINEL_${process.hrtime.bigint()}__`;
}

/**
 * Capture text from whatever app currently has focus.
 *
 * Two-stage on purpose:
 *   1. Plain Ctrl+C first — if the user highlighted something, that's exactly
 *      what they want enhanced, and copying preserves their selection.
 *   2. Only if that came back empty do we fall back to Ctrl+A + Ctrl+C to
 *      grab the whole field.
 *
 * Doing select-all first (the original approach) would blow away a deliberate
 * selection and grab unrelated surrounding text.
 */
// One copy attempt against a freshly-parked sentinel. Returns '' when the
// clipboard never changed, i.e. the copy produced nothing.
async function copyAttempt({ selectAll, settleMs }) {
  const marker = sentinel();
  clipboard.writeText(marker);
  await sleep(settleMs);

  if (selectAll) await sendSelectAll();
  await sendCopy();
  await sleep(settleMs);

  const got = clipboard.readText();
  return got === marker ? '' : got;
}

async function captureActiveFieldText() {
  const previousClipboard = clipboard.readText();

  // Must happen before any synthesized keystroke — see keystroke.js.
  await releaseAllModifiers();

  // Copy the existing selection first, then widen to the whole field, then
  // retry the widened attempt more slowly: some apps (Electron chat inputs,
  // remote desktops) need noticeably longer to service a clipboard write.
  const attempts = [
    { selectAll: false, settleMs: 70 },
    { selectAll: true, settleMs: 70 },
    { selectAll: true, settleMs: 180 }
  ];

  let captured = '';
  let usedSelectAll = false;

  for (const attempt of attempts) {
    captured = await copyAttempt(attempt);
    usedSelectAll = attempt.selectAll;
    if (captured.trim().length > 0) break;
  }

  restoreClipboardSoon(previousClipboard);

  const text = captured.trim().length === 0 ? '' : captured;
  const truncated = text.length > MAX_CHARS;

  return {
    text: truncated ? text.slice(0, MAX_CHARS) : text,
    empty: text.length === 0,
    truncated,
    usedSelectAll
  };
}

async function replaceActiveFieldText(newText) {
  const previousClipboard = clipboard.readText();

  await releaseAllModifiers();
  clipboard.writeText(newText);
  await sleep(60);

  await sendSelectAll();
  await sendPaste();

  restoreClipboardSoon(previousClipboard, 1200);
}

function restoreClipboardSoon(previousClipboard, delay = 600) {
  setTimeout(() => {
    // Don't clobber the clipboard if the user copied something new meanwhile.
    clipboard.writeText(previousClipboard);
  }, delay);
}

module.exports = { captureActiveFieldText, replaceActiveFieldText, sleep, MAX_CHARS };
