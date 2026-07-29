import React, { useEffect, useState } from 'react';
import { formatAccelerator, prettyShortcut, DEFAULT_SHORTCUT } from '../lib/shortcut.js';

const STYLES = [
  { id: 'auto', label: 'Auto' },
  { id: 'builder', label: 'Builder' },
  { id: 'writer', label: 'Writer' },
  { id: 'researcher', label: 'Researcher' },
  { id: 'brainstorm', label: 'Brainstorm' }
];

const POSITIONS = [
  { id: 'center', label: 'Center of screen' },
  { id: 'cursor', label: 'Near cursor' },
  { id: 'bottom-right', label: 'Bottom right' }
];

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testState, setTestState] = useState(null); // null | 'testing' | 'ok' | 'fail'
  const [testMessage, setTestMessage] = useState('');
  const [style, setStyle] = useState('auto');
  const [shortcut, setShortcut] = useState(DEFAULT_SHORTCUT);
  const [capturingShortcut, setCapturingShortcut] = useState(false);
  const [overlayPosition, setOverlayPosition] = useState('center');
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [usage, setUsage] = useState({ usageToday: 0, usageTotal: 0 });

  useEffect(() => {
    document.title = 'PromptBooster Settings';
    window.promptbooster.getAllSettings().then((s) => {
      setApiKey(s.apiKey || '');
      setStyle(s.enhancementStyle || 'auto');
      setShortcut(s.globalShortcut || DEFAULT_SHORTCUT);
      setOverlayPosition(s.overlayPosition || 'center');
      setLaunchAtLogin(!!s.launchAtLogin);
    });
    window.promptbooster.getUsage().then(setUsage);
  }, []);

  const [shortcutWarning, setShortcutWarning] = useState('');

  useEffect(() => {
    if (!capturingShortcut) return;
    function handleKey(e) {
      e.preventDefault();
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
      const result = formatAccelerator(e);
      if (!result) return;
      if (result.error) {
        setShortcutWarning(result.error);
        return;
      }
      setShortcutWarning('');
      setShortcut(result.accelerator);
      setCapturingShortcut(false);
      window.promptbooster.setShortcutCapturing(false);
      window.promptbooster.setSetting('globalShortcut', result.accelerator);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [capturingShortcut]);

  async function handleTestConnection() {
    setTestState('testing');
    setTestMessage('');
    await window.promptbooster.setSetting('apiKey', apiKey);
    const result = await window.promptbooster.testApiKey(apiKey);
    if (result.ok) {
      setTestState('ok');
    } else {
      setTestState('fail');
      setTestMessage(result.message || 'Connection failed');
    }
  }

  function handleApiKeyBlur() {
    window.promptbooster.setSetting('apiKey', apiKey);
  }

  function handleStyleChange(e) {
    setStyle(e.target.value);
    window.promptbooster.setSetting('enhancementStyle', e.target.value);
  }

  function handlePositionChange(e) {
    setOverlayPosition(e.target.value);
    window.promptbooster.setSetting('overlayPosition', e.target.value);
  }

  function toggleLaunchAtLogin() {
    const next = !launchAtLogin;
    setLaunchAtLogin(next);
    window.promptbooster.setSetting('launchAtLogin', next);
  }

  function startCapturingShortcut() {
    setCapturingShortcut(true);
    window.promptbooster.setShortcutCapturing(true);
  }

  async function handleClearApiKey() {
    await window.promptbooster.clearApiKey();
    setApiKey('');
    setTestState(null);
  }

  return (
    <div className="page">
      <h1>Settings</h1>

      <div className="field-group">
        <h2>API Key</h2>
        <div className="field-desc">NVIDIA API key (build.nvidia.com) — used to call the enhancement model.</div>
        <div className="key-row">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            placeholder="nvapi-..."
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={handleApiKeyBlur}
          />
          <button className="btn" onClick={() => setShowKey((v) => !v)}>
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
        <div className="field-row">
          <button className="btn primary" onClick={handleTestConnection} disabled={!apiKey || testState === 'testing'}>
            {testState === 'testing' ? 'Testing...' : 'Test connection'}
          </button>
          {testState === 'ok' && (
            <span>
              <span className="status-dot green" />
              Connected
            </span>
          )}
          {testState === 'fail' && (
            <span>
              <span className="status-dot red" />
              {testMessage}
            </span>
          )}
        </div>
      </div>

      <hr className="divider" />

      <div className="field-group">
        <h2>Default Style</h2>
        <select value={style} onChange={handleStyleChange}>
          {STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field-group">
        <h2>Keyboard Shortcut</h2>
        <button className="btn" onClick={startCapturingShortcut}>
          {capturingShortcut ? 'Press new combo...' : prettyShortcut(shortcut)}
        </button>
        <div className="field-desc">
          Select text in any app, then press this. Avoid Alt-based combos — Windows uses them for menus.
        </div>
        {shortcutWarning && <div className="field-desc" style={{ color: 'var(--danger)' }}>{shortcutWarning}</div>}
      </div>

      <div className="field-group">
        <h2>Overlay Position</h2>
        <select value={overlayPosition} onChange={handlePositionChange}>
          {POSITIONS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field-row">
        <div>
          <div className="field-label">Launch at Login</div>
          <div className="field-desc">Start PromptBooster automatically when Windows starts.</div>
        </div>
        <button className={`toggle ${launchAtLogin ? 'on' : ''}`} onClick={toggleLaunchAtLogin}>
          <span className="knob" />
        </button>
      </div>

      <hr className="divider" />

      <div className="field-group">
        <h2>Usage Stats</h2>
        <div className="field-desc">
          {usage.usageToday} prompts enhanced today · {usage.usageTotal} all time
        </div>
      </div>

      <div className="field-group">
        <button className="btn" onClick={handleClearApiKey}>
          Clear API Key
        </button>
      </div>

      <div className="version-footer">PromptBooster v1.0.0</div>
    </div>
  );
}
