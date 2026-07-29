# PRD: PromptBooster — System-Wide AI Prompt Enhancer (Desktop App)

**Version:** 1.0  
**Status:** Ready for Development  
**Target Builder:** Claude Code  
**Stack:** Electron + React + Node.js

---

## 1. Overview

### 1.1 What It Is

PromptBooster is a **downloadable desktop utility** (Mac + Windows) that lives in the system tray/menu bar. It works globally across every app on your computer — Claude Desktop, ChatGPT Desktop, Cursor, Notion, any text field anywhere.

Press the global shortcut → it grabs whatever you've typed → sends it to Claude API → shows a floating overlay with an enhanced, structured prompt → you paste it back in one keystroke.

### 1.2 The Problem

Users type vague prompts:
> _"build me a dashboard with charts"_

And get generic output. The skill is in prompt engineering — adding context, constraints, format expectations, persona, edge cases. Nobody does this because it's slow and requires expertise.

### 1.3 The Solution

A **system-level hotkey** (`Ctrl+Shift+P` / `Cmd+Shift+P`) that intercepts what you typed, runs it through a prompt engineering AI pipeline, and gives you back a detailed, structured, copy-pasteable prompt in under 4 seconds. Works in every app. No browser required.

---

## 2. How It Actually Works (Technical Strategy)

This is the most important architectural decision in the PRD.

### 2.1 Text Capture Strategy — Clipboard Hijack Method

There is no universal API to read text from another app's input field. The reliable cross-platform approach:

```
User presses global shortcut (Ctrl+Shift+P)
         │
         ▼
App saves current clipboard content (backup)
         │
         ▼
App simulates Ctrl+A (select all in active field)
         │
         ▼
App simulates Ctrl+C (copy selection to clipboard)
         │
         ▼
App reads clipboard → this is the user's prompt text
         │
         ▼
App restores original clipboard content (cleanup)
         │
         ▼
Send captured text to Claude API
         │
         ▼
Show floating overlay with enhanced prompt
         │
         ▼
User clicks "Replace" → App simulates Ctrl+A + pastes enhanced prompt
```

This works universally: Claude Desktop, ChatGPT Desktop, Cursor, Notion, VS Code, any text field in any app.

### 2.2 Why Electron

- **robotjs / @nut-tree/nut-js** — for simulating keystrokes and reading/writing clipboard
- **electron globalShortcut** — registers system-wide hotkeys that fire even when the app isn't focused
- **Frameless always-on-top BrowserWindow** — the floating overlay renders above every other app
- **Cross-platform** — one codebase ships Mac (.dmg) and Windows (.exe)
- Claude Code knows Electron extremely well

---

## 3. Application Architecture

### 3.1 Folder Structure

```
promptbooster/
├── package.json
├── electron/
│   ├── main.js                  # Main process — tray, global shortcut, IPC
│   ├── preload.js               # Secure bridge between main and renderer
│   └── utils/
│       ├── clipboard.js         # Clipboard capture + restore logic
│       ├── keystroke.js         # Simulate Ctrl+A, Ctrl+C, Ctrl+V via robotjs
│       └── api.js               # Anthropic API call
├── src/
│   ├── App.jsx                  # Root React component
│   ├── components/
│   │   ├── OverlayWindow.jsx    # The floating result modal
│   │   ├── SettingsPage.jsx     # API key, shortcuts, style config
│   │   └── OnboardingFlow.jsx   # First-run setup wizard
│   └── styles/
│       └── global.css
├── assets/
│   ├── tray-icon.png            # 16x16 tray icon (dark + light variants)
│   └── tray-icon@2x.png
└── build/                       # electron-builder output
```

### 3.2 Process Architecture

```
┌─────────────────────────────────────┐
│           MAIN PROCESS              │
│  electron/main.js                   │
│  - Registers global shortcut        │
│  - Creates tray icon                │
│  - Creates overlay BrowserWindow    │
│  - Calls Anthropic API              │
│  - Manages clipboard via robotjs    │
└──────────────┬──────────────────────┘
               │ IPC (ipcMain / ipcRenderer)
               │
┌──────────────▼──────────────────────┐
│          RENDERER PROCESS           │
│  React app (OverlayWindow)          │
│  - Shows enhanced prompt            │
│  - Copy / Replace / Regenerate UI   │
│  - Settings page                    │
└─────────────────────────────────────┘
```

---

## 4. Features

### 4.1 F1 — System Tray / Menu Bar Presence

- App runs in background, no Dock icon when overlay is closed (Mac: `app.dock.hide()`)
- **Tray icon** shows at all times with right-click menu:
  - `Enhance Prompt` (same as hotkey)
  - `Settings`
  - `Usage: 23 prompts today`
  - `Quit PromptBooster`
- Tray icon **pulses** while API call is in progress
- Badge indicator when overlay is open

### 4.2 F2 — Global Keyboard Shortcut

- Default: `Ctrl+Shift+P` (Windows/Linux), `Cmd+Shift+P` (Mac)
- Registered via `electron.globalShortcut.register()` — fires regardless of which app is focused
- User can remap it in Settings
- Shortcut is **unregistered when user is in Settings** (to allow typing the new hotkey)

### 4.3 F3 — Text Capture (Clipboard Hijack)

```js
// electron/utils/clipboard.js
async function captureActiveFieldText() {
  const previousClipboard = clipboard.readText(); // backup
  
  await simulateKeys(['ctrl+a']);   // select all (cmd+a on mac)
  await sleep(80);                  // wait for OS to process
  await simulateKeys(['ctrl+c']);   // copy to clipboard
  await sleep(80);
  
  const capturedText = clipboard.readText();
  
  // restore original clipboard after a short delay
  setTimeout(() => clipboard.writeText(previousClipboard), 500);
  
  return capturedText;
}
```

**Edge cases:**
- If captured text === previousClipboard (nothing was selected / field was empty): show toast "Nothing to enhance — type a prompt first"
- If captured text is empty string: same toast
- If captured text > 4000 chars: truncate to first 4000 and show a warning badge

### 4.4 F4 — Claude API Enhancement

```js
// electron/utils/api.js
async function enhancePrompt(rawPrompt, style, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [
        { role: 'user', content: buildMetaPrompt(rawPrompt, style) }
      ]
    })
  });
  const data = await response.json();
  return data.content[0].text;
}
```

- API key stored in **electron-store** (encrypted local file, not plaintext)
- Timeout: 15 seconds; if exceeded → error state with retry button
- Errors surfaced in overlay (see Section 7.3)

### 4.5 F5 — Floating Overlay Window

A frameless, always-on-top, non-focusable-by-default window that appears centered on screen (or near the cursor).

**Window config:**
```js
new BrowserWindow({
  width: 620,
  height: 520,
  frame: false,
  alwaysOnTop: true,
  resizable: true,
  skipTaskbar: true,
  transparent: true,          // rounded corners with CSS
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true
  }
})
```

**Overlay contents:**
- Header bar: `PromptBooster ✦` logo + drag handle + close (×) button
- **Style pill:** shows current enhancement style (`Builder / Writer / Auto`)
- **Original prompt** (collapsed section, click to expand) — shows what was captured
- **Enhanced prompt** — main text area, editable by user before copying
- **Action row:**
  - `Copy` — copies to clipboard, button shows ✓ for 2s
  - `Replace in App` — simulates Ctrl+A in the originating app then pastes the enhanced prompt
  - `Regenerate` — re-calls API with same original prompt
- **Character count** of enhanced prompt
- Keyboard shortcuts labeled: `Esc` to close, `Cmd+C` to copy, `Cmd+Enter` to replace

### 4.6 F6 — Enhancement Styles

User picks a default in settings; can switch per-use via a dropdown in the overlay.

| Style | What It Adds |
|---|---|
| **Auto** | Claude infers the task type and picks the best approach |
| **Builder** | Tech stack, file structure, acceptance criteria, edge cases — for dev tasks |
| **Writer** | Tone, audience, word count, format, style reference — for writing tasks |
| **Researcher** | Scope definition, source requirements, output structure — for research |
| **Brainstorm** | Divergent thinking instructions, quantity targets, no-filter mode |

### 4.7 F7 — Settings Window

Opened from tray menu or by pressing `,` inside the overlay.

- **API Key** — password input, "Test connection" button, green/red status
- **Default Style** — dropdown (Auto / Builder / Writer / Researcher / Brainstorm)
- **Keyboard Shortcut** — click to remap, press new combo, save
- **Launch at Login** — toggle (uses `app.setLoginItemSettings`)
- **Overlay Position** — Center of screen / Near cursor / Bottom right
- **Usage Stats** — prompts enhanced today / all time (stored in electron-store)
- **Clear Data / API Key** button
- **Version info**

### 4.8 F8 — Onboarding (First Run)

A dedicated onboarding window that opens automatically on first launch:

1. **Welcome screen** — what PromptBooster does, animated demo
2. **API Key setup** — paste key, test it, show success
3. **Shortcut confirmation** — shows the default, option to change it
4. **Permissions prompt** — on Mac: requests Accessibility permissions (required for `robotjs` to simulate keystrokes). Shows OS dialog, explains why.
5. **Done** — "Try it now" CTA

---

## 5. The Meta-Prompt (Core Logic)

```
You are a world-class prompt engineer. Your job is to take a rough, vague user prompt and rewrite it into a detailed, structured, high-quality prompt that will produce a significantly better output from an AI assistant.

The user's original prompt:
"""
{{USER_PROMPT}}
"""

Enhancement style: {{STYLE}}

Rewrite this into a detailed prompt following these rules:

1. PRESERVE INTENT — don't change what they're asking for, just make it far more specific
2. ADD CONTEXT — infer what domain/stack/use-case makes most sense and specify it clearly
3. DEFINE OUTPUT FORMAT — tell the AI exactly how to structure its response (step-by-step, code blocks, bullet lists, tables, etc.)
4. ADD CONSTRAINTS — specify what to avoid, edge cases to handle, depth/length expectations
5. SET THE PERSONA — tell the AI what expert role to assume (e.g. "You are a senior React engineer...")
6. BUILDER ADDITIONS (if dev task) — desired file structure, tech stack assumptions, acceptance criteria checklist
7. WRITER ADDITIONS (if writing task) — tone, audience, word count, format, what NOT to write
8. NO PREAMBLE — output only the enhanced prompt. Do not write "Here is your enhanced prompt:" or any wrapper text.

The enhanced prompt should be ready to paste directly into an AI chat interface and send.
```

---

## 6. Permissions Required

### Mac
- **Accessibility permission** — required for `robotjs` to simulate keystrokes (`System Preferences → Security & Privacy → Accessibility`)
- App must prompt for this on first run and explain why
- If permission denied: show persistent warning, "Replace in App" feature disabled (Copy still works)

### Windows
- No special permissions required for keyboard simulation
- May need to run as administrator if simulating keys into elevated processes (document this edge case)

---

## 7. UI / UX Spec

### 7.1 Visual Design
- **Dark theme** (primary) — matches the dark UI of Claude Desktop, ChatGPT Desktop
- **Light theme** — auto-follows system `prefers-color-scheme`
- **Window:** Rounded corners (12px), subtle drop shadow, frosted glass effect on Mac via CSS `backdrop-filter`
- **Font:** `Inter` (bundled) for UI, `JetBrains Mono` (bundled) for the prompt text area
- **Accent:** Electric indigo `#6366F1` — distinctive, not Claude purple or OpenAI green
- **Drag handle** at top — user can reposition the overlay

### 7.2 Loading State
- Tray icon animates while API call is in progress
- Inside overlay: prompt text area shows skeleton shimmer
- Cycling subtitle text: _"Reading your prompt..."_ → _"Engineering a better one..."_ → _"Almost ready..."_

### 7.3 Error States

| Error | Action |
|---|---|
| No API key configured | Overlay shows "Set your API key in Settings first →" with button |
| Empty / nothing captured | Small toast notification, overlay doesn't open |
| API 401 Invalid key | Overlay error state with "Fix in Settings" button |
| API 429 Rate limited | "Rate limited — try again in a few seconds" + retry button |
| Network timeout (15s) | "Request timed out" + retry button |
| Accessibility permission denied (Mac) | Warning banner in overlay, Copy works but Replace is disabled |

---

## 8. Data Storage (electron-store)

```json
{
  "apiKey": "sk-ant-...",
  "enhancementStyle": "auto",
  "globalShortcut": "CommandOrControl+Shift+P",
  "overlayPosition": "center",
  "launchAtLogin": true,
  "onboardingComplete": true,
  "usageToday": 7,
  "usageTotal": 134,
  "usageLastDate": "2026-07-29"
}
```

API key stored via `electron-store` with encryption enabled (`encryptionKey` option).

---

## 9. Build & Distribution

### 9.1 Dependencies (package.json)
```json
{
  "dependencies": {
    "electron": "^29.0.0",
    "electron-store": "^8.0.0",
    "robotjs": "^0.6.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "electron-builder": "^24.0.0",
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0"
  }
}
```

> ⚠️ **Note for Claude Code:** `robotjs` requires native compilation. Run `npm rebuild` after install. On Mac arm64, may need Rosetta or arm64 build of robotjs. Alternative if robotjs causes issues: use `@nut-tree/nut-js` which has better M1/M2 support.

### 9.2 electron-builder Config
```json
{
  "appId": "com.promptbooster.app",
  "productName": "PromptBooster",
  "mac": {
    "target": "dmg",
    "category": "public.app-category.productivity",
    "icon": "assets/icon.icns",
    "entitlements": "assets/entitlements.mac.plist"
  },
  "win": {
    "target": "nsis",
    "icon": "assets/icon.ico"
  }
}
```

### 9.3 Mac Entitlements (required for Accessibility)
```xml
<!-- assets/entitlements.mac.plist -->
<key>com.apple.security.automation.apple-events</key>
<true/>
```

---

## 10. Build Order for Claude Code

Build strictly in this sequence to avoid IPC + window management tangles:

1. **Scaffold** — `package.json`, folder structure, `electron/main.js` with app lifecycle (no features yet)
2. **Tray icon** — appears in menu bar, right-click menu with Quit
3. **Global shortcut** — registers `Cmd+Shift+P`, logs "shortcut fired" to console
4. **Clipboard capture** — `captureActiveFieldText()` utility, test it by logging captured text
5. **API call** — `enhancePrompt()` utility with hardcoded test key first, verify response
6. **Overlay window** — frameless BrowserWindow, React app renders inside it, IPC bridge
7. **Overlay UI** — enhanced prompt display, Copy button, Regenerate button
8. **Replace in App** — simulate Ctrl+A + paste back into originating app
9. **Settings window** — API key input, save to electron-store, test connection
10. **Onboarding flow** — first-run wizard, accessibility permission prompt (Mac)
11. **Polish** — animations, error states, dark/light mode, launch at login

---

## 11. Test Cases

| Scenario | Expected Result |
|---|---|
| Shortcut pressed with cursor in Claude Desktop text field | Captures typed text, shows overlay with enhanced prompt |
| Shortcut pressed with cursor in ChatGPT Desktop | Same |
| Shortcut pressed with cursor in Cursor IDE | Same |
| Shortcut pressed with empty text field | Toast: "Nothing to enhance — type a prompt first" |
| Click "Copy" button | Clipboard updated, button shows ✓ for 2s |
| Click "Replace in App" | Original app's text field now contains enhanced prompt |
| Click "Regenerate" | New API call, new enhanced prompt in same overlay |
| Press Esc | Overlay closes |
| Invalid API key | Error state in overlay with link to settings |
| No internet | Timeout error state after 15s with retry button |
| First launch | Onboarding wizard opens automatically |
| Mac without Accessibility permission | Replace button shows warning, Copy still works |

---

## 12. Out of Scope (v1.0)

- ❌ Prompt history / favorites
- ❌ Custom meta-prompt editor
- ❌ Linux support (Phase 2)
- ❌ Multiple AI model options for enhancement (Claude only)
- ❌ Team/shared settings
- ❌ Analytics or telemetry
- ❌ Auto-update mechanism

---

## 13. Known Challenges for Claude Code

1. **`robotjs` native compilation** — may need `electron-rebuild` in postinstall script. If it fails on the target machine, swap to `@nut-tree/nut-js`.
2. **Mac Accessibility permission** — `robotjs` silently fails if not granted. Main process must check `systemPreferences.isTrustedAccessibilityClient(false)` and prompt user if false.
3. **Clipboard timing** — `Ctrl+A` → `Ctrl+C` needs `sleep(80-150ms)` between steps. Too fast and the clipboard won't update before you read it. Tune this.
4. **`alwaysOnTop` focus stealing** — set `alwaysOnTop: true` but `focusable: false` initially so the overlay doesn't steal keyboard focus from the originating app. Only set focusable when user clicks inside it.
5. **App hiding from Dock** — use `app.dock.hide()` on Mac so the app doesn't appear as a regular app in the Dock, only in the menu bar.

---

*End of PRD — ready for Claude Code.*
