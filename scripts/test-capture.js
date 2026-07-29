// Self-contained end-to-end test of the capture pipeline.
//
// Opens a real focused window containing a textarea with known text, then runs
// the same captureActiveFieldText() the global shortcut uses and asserts the
// text came back. This exercises modifier release, Ctrl+C on an existing
// selection, the Ctrl+A fallback, and clipboard restore — without touching any
// of the user's own apps or files.
//
//   npx electron scripts/test-capture.js

const { app, BrowserWindow, clipboard } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { captureActiveFieldText } = require('../electron/utils/clipboard');

const SELECTED_TEXT = 'build me a dashboard with charts';
const FULL_TEXT = `${SELECTED_TEXT}\nsecond line that is not selected`;
const PRE_EXISTING_CLIPBOARD = 'user-clipboard-should-survive';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-test-'));

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// A real file on disk: Electron refuses to execute inline <script> in data: URLs.
function writePage(selectFirstLine) {
  const selection = selectFirstLine
    ? `ta.setSelectionRange(0, ${SELECTED_TEXT.length});`
    : 'ta.setSelectionRange(ta.value.length, ta.value.length);';

  const html = `<!doctype html>
<body style="margin:0">
  <textarea id="ta" style="width:100vw;height:100vh;font-size:16px"></textarea>
  <script>
    const ta = document.getElementById('ta');
    ta.value = ${JSON.stringify(FULL_TEXT)};
    ta.focus();
    ${selection}
  </script>
</body>`;

  const file = path.join(tmpDir, `page-${selectFirstLine ? 'sel' : 'nosel'}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return `file://${file.replace(/\\/g, '/')}`;
}

async function runScenario({ title, selectFirstLine, expect, expectSelectAll }) {
  const win = new BrowserWindow({
    width: 500,
    height: 300,
    show: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  await win.loadURL(writePage(selectFirstLine));
  win.focus();
  await new Promise((r) => setTimeout(r, 800));

  const selLen = await win.webContents.executeJavaScript(
    'document.getElementById("ta").selectionEnd - document.getElementById("ta").selectionStart'
  );
  check(`${title}: page selection set up (${selLen} chars)`, selectFirstLine ? selLen > 0 : selLen === 0);

  clipboard.writeText(PRE_EXISTING_CLIPBOARD);
  await new Promise((r) => setTimeout(r, 120));

  const capture = await captureActiveFieldText();

  // Windows normalises clipboard newlines to CRLF.
  const normalise = (s) => s.replace(/\r\n/g, '\n').trim();
  check(
    `${title}: captured expected text`,
    normalise(capture.text) === normalise(expect),
    `got ${JSON.stringify(capture.text.slice(0, 60))}`
  );
  check(`${title}: usedSelectAll === ${expectSelectAll}`, capture.usedSelectAll === expectSelectAll);
  check(`${title}: not reported empty`, capture.empty === false);

  // Clipboard restore is scheduled on a timer.
  await new Promise((r) => setTimeout(r, 1000));
  check(
    `${title}: original clipboard restored`,
    clipboard.readText() === PRE_EXISTING_CLIPBOARD,
    `clipboard is ${JSON.stringify(clipboard.readText().slice(0, 40))}`
  );

}

// One scenario per process: tearing down and recreating a focused
// BrowserWindow mid-run destabilises the native input layer, which would
// silently kill the run before later scenarios reported.
const SCENARIOS = {
  selection: {
    title: 'selection',
    selectFirstLine: true,
    expect: SELECTED_TEXT,
    expectSelectAll: false
  },
  fallback: {
    title: 'no-selection fallback',
    selectFirstLine: false,
    expect: FULL_TEXT,
    expectSelectAll: true
  }
};

app.whenReady().then(async () => {
  const name = process.argv[2] || 'selection';
  try {
    await runScenario(SCENARIOS[name]);
  } catch (err) {
    check('harness completed without throwing', false, err.message);
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  app.exit(failed.length === 0 ? 0 : 1);
});
