# PromptBooster

A system-wide prompt enhancer for Windows. Press a global hotkey anywhere — Claude Desktop, ChatGPT, Cursor, Notion, any text field — and PromptBooster rewrites whatever you typed into a detailed, structured prompt using an NVIDIA-hosted LLM.

## How it works

1. Select some text in any app (or leave the field focused with nothing selected)
2. Press **`Ctrl+Shift+F9`**
3. A floating overlay appears with the enhanced prompt
4. **Copy** it, or **Replace in App** to paste it straight back where you were typing

No selection? The overlay opens in manual mode instead — type or paste your prompt directly and hit Enhance. You can also reach that from the tray icon's right-click menu ("Write a prompt manually", "Enhance clipboard contents").

## Requirements

- Windows 10/11
- Node.js 18+
- A free API key from [build.nvidia.com](https://build.nvidia.com) — **you bring your own key**, nothing is bundled or hardcoded. The app is unusable until you paste your own key into onboarding/Settings and it's stored locally, encrypted, and never leaves your machine except to call NVIDIA's API directly.

## Setup

```bash
npm install
npm run gen-icons   # generates placeholder tray/app icons
npm run dev
```

`npm run dev` starts Vite and Electron together with hot reload. On first launch you'll be walked through pasting your NVIDIA API key and confirming the global shortcut.

## Building an installer

```bash
npm run build
```

Produces an NSIS `.exe` installer under `build/`.

## Enhancement styles

Pick a default in Settings, or switch per-use from the dropdown in the overlay:

| Style | What it adds |
|---|---|
| **Auto** | Infers the task type and applies whichever additions fit |
| **Builder** | Tech stack, file structure, acceptance criteria — for dev tasks |
| **Writer** | Tone, audience, word count, format — for writing tasks |
| **Researcher** | Scope, source requirements, output structure |
| **Brainstorm** | Divergent-thinking instructions, quantity targets, no-filter mode |

## Why `Ctrl+Shift+F9`

Global hotkeys on Windows have two traps this app deliberately avoids:

- **`Alt+<letter>`** is the OS menu-mnemonic key — whatever app has focus may swallow it to open a menu instead of firing our shortcut.
- **`Ctrl+Alt+<letter>`** is AltGr on Windows — it can type a stray character into the field you're capturing from instead of acting as a clean accelerator.

`Ctrl+Shift+F9` uses two modifiers (avoiding both OS traps above) and a function key (nothing to accidentally type), and doesn't collide with common editor/browser bindings. You can remap it in Settings — the picker will warn you if you try to set something fragile.

## Project structure

```
promptbooster/
├── electron/
│   ├── main.js              # App lifecycle, tray, global shortcut, IPC, window management
│   ├── preload.js           # contextBridge — the only surface the renderer can call into main from
│   └── utils/
│       ├── clipboard.js     # Clipboard-hijack capture: copy selection, fall back to select-all
│       ├── keystroke.js     # nut-js keyboard simulation, including modifier-release handling
│       ├── api.js           # NVIDIA API call + meta-prompt construction
│       └── store.js         # electron-store schema (encrypted local settings)
├── src/
│   ├── App.jsx               # Hash-based router between overlay/settings/onboarding
│   ├── components/
│   │   ├── OverlayWindow.jsx    # Floating result window (manual input + enhanced output)
│   │   ├── SettingsPage.jsx     # API key, style, shortcut remap, launch-at-login
│   │   └── OnboardingFlow.jsx   # First-run wizard
│   └── lib/shortcut.js       # Shared accelerator formatting/validation
├── scripts/
│   ├── generate-icons.js     # Generates tray/app icons with no external deps
│   └── test-capture.js       # End-to-end test of the clipboard-capture pipeline
└── assets/                   # Tray + app icons
```

## Testing the capture pipeline

```bash
npm run test:capture
```

Spins up a real focused window with known text and runs the exact capture path the global shortcut uses — verifying selection-copy, select-all fallback, and clipboard restore, without touching any of your own apps or files.

## Privacy

- Your API key is stored encrypted in `%APPDATA%\promptbooster\promptbooster-config.json`, never in this repo
- The only network call this app makes is to `https://integrate.api.nvidia.com` with your own key
- No telemetry, no analytics, no auto-update phone-home

## Out of scope (v1)

- Prompt history / favorites
- Custom meta-prompt editor
- macOS / Linux support
- Multiple AI providers (NVIDIA-hosted models only)

## License

MIT
