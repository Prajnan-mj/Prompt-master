import React, { useState } from 'react';
import { formatAccelerator, prettyShortcut, DEFAULT_SHORTCUT } from '../lib/shortcut.js';

const STEPS = ['welcome', 'apikey', 'shortcut', 'done'];

export default function OnboardingFlow() {
  const [stepIdx, setStepIdx] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [testState, setTestState] = useState(null);
  const [testMessage, setTestMessage] = useState('');
  const [shortcut, setShortcut] = useState(DEFAULT_SHORTCUT);
  const [capturingShortcut, setCapturingShortcut] = useState(false);
  const [shortcutWarning, setShortcutWarning] = useState('');

  const step = STEPS[stepIdx];

  React.useEffect(() => {
    document.title = 'Welcome to PromptBooster';
  }, []);

  function next() {
    // The apikey step's field only writes to the store when "Test connection"
    // is clicked — if the user pastes a key and hits Continue instead, save
    // it here too so it's never silently dropped.
    if (step === 'apikey' && apiKey) {
      window.promptbooster.setSetting('apiKey', apiKey);
    }
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  }
  function back() {
    setStepIdx((i) => Math.max(i - 1, 0));
  }

  async function handleTest() {
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

  function startCapturingShortcut() {
    setCapturingShortcut(true);
    window.promptbooster.setShortcutCapturing(true);
  }

  React.useEffect(() => {
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

  async function handleFinish() {
    if (apiKey) {
      await window.promptbooster.setSetting('apiKey', apiKey);
    }
    await window.promptbooster.completeOnboarding();
  }

  return (
    <div className="page">
      <div className="onboarding-steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`onboarding-dot ${i === stepIdx ? 'active' : ''}`} />
        ))}
      </div>

      {step === 'welcome' && (
        <div className="onboarding-content">
          <div className="onboarding-icon">✦</div>
          <h1>Welcome to PromptBooster</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 380 }}>
            Press a global shortcut anywhere on your PC — Claude Desktop, ChatGPT, Cursor, Notion, any text field —
            and PromptBooster rewrites your rough prompt into a detailed, structured one in seconds.
          </p>
        </div>
      )}

      {step === 'apikey' && (
        <div className="onboarding-content" style={{ width: '100%' }}>
          <h1>Add your NVIDIA API key</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Get a free key at{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.promptbooster.openExternal('https://build.nvidia.com');
              }}
              style={{ color: 'var(--accent)' }}
            >
              build.nvidia.com
            </a>
            . Your key is stored encrypted, locally on this machine only.
          </p>
          <div className="key-row" style={{ width: '100%', maxWidth: 360 }}>
            <input
              type="password"
              placeholder="nvapi-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <button className="btn primary" onClick={handleTest} disabled={!apiKey || testState === 'testing'}>
            {testState === 'testing' ? 'Testing...' : 'Test connection'}
          </button>
          {testState === 'ok' && (
            <div>
              <span className="status-dot green" />
              Connected successfully
            </div>
          )}
          {testState === 'fail' && (
            <div>
              <span className="status-dot red" />
              {testMessage}
            </div>
          )}
        </div>
      )}

      {step === 'shortcut' && (
        <div className="onboarding-content">
          <h1>Your global shortcut</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Press this anywhere to capture and enhance whatever you've typed.
          </p>
          <button className="btn" style={{ fontSize: 16, padding: '10px 20px' }} onClick={startCapturingShortcut}>
            {capturingShortcut ? 'Press new combo...' : prettyShortcut(shortcut)}
          </button>
          {shortcutWarning && <div className="field-desc" style={{ color: 'var(--danger)' }}>{shortcutWarning}</div>}
          <div className="field-desc">You can change this anytime in Settings.</div>
        </div>
      )}

      {step === 'done' && (
        <div className="onboarding-content">
          <div className="onboarding-icon">✓</div>
          <h1>You're all set</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Select some text anywhere, press <strong>{prettyShortcut(shortcut)}</strong>, and watch PromptBooster do its thing.
          </p>
          <button className="btn primary" onClick={handleFinish}>
            Try it now
          </button>
        </div>
      )}

      <div className="onboarding-nav">
        <button className="btn" onClick={back} style={{ visibility: stepIdx === 0 ? 'hidden' : 'visible' }}>
          Back
        </button>
        {step !== 'done' && (
          <button className="btn primary" onClick={next}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
