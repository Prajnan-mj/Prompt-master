import React, { useEffect, useRef, useState } from 'react';

const STYLES = [
  { id: 'auto', label: 'Auto' },
  { id: 'builder', label: 'Builder' },
  { id: 'writer', label: 'Writer' },
  { id: 'researcher', label: 'Researcher' },
  { id: 'brainstorm', label: 'Brainstorm' }
];

const LOADING_SUBTITLES = [
  'Reading your prompt...',
  'Engineering a better one...',
  'Almost ready...'
];

const ERROR_COPY = {
  NO_KEY: { message: 'Set your API key in Settings first.', showSettings: true, retry: false },
  INVALID_KEY: { message: 'Invalid API key.', showSettings: true, retry: false },
  RATE_LIMITED: { message: 'Rate limited — try again in a few seconds.', showSettings: false, retry: true },
  TIMEOUT: { message: 'Request timed out.', showSettings: false, retry: true },
  NETWORK: { message: 'Network error — check your connection.', showSettings: false, retry: true },
  UNKNOWN: { message: 'Something went wrong.', showSettings: false, retry: true }
};

export default function OverlayWindow() {
  // manual | loading | success | error
  const [status, setStatus] = useState('manual');
  const [manualText, setManualText] = useState('');
  const [original, setOriginal] = useState('');
  const [enhanced, setEnhanced] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);
  const [style, setStyle] = useState('auto');
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [subtitleIdx, setSubtitleIdx] = useState(0);

  const enhancedRef = useRef(null);
  const manualRef = useRef(null);
  const styleRef = useRef(style);
  styleRef.current = style;

  useEffect(() => {
    window.promptbooster.getSetting('enhancementStyle').then((s) => s && setStyle(s));

    window.promptbooster.onCaptureEmpty(() => {
      setOriginal('');
      setEnhanced('');
      setErrorInfo(null);
      setManualText('');
      setStatus('manual');
      setTimeout(() => manualRef.current?.focus(), 60);
    });

    window.promptbooster.onManualMode(({ text }) => {
      setOriginal('');
      setEnhanced('');
      setErrorInfo(null);
      setManualText(text || '');
      setStatus('manual');
      setTimeout(() => manualRef.current?.focus(), 60);
    });

    window.promptbooster.onCaptureResult(({ text, truncated: t }) => {
      setOriginal(text);
      setTruncated(t);
    });

    window.promptbooster.onEnhanceStart(() => {
      setErrorInfo(null);
      setStatus('loading');
    });

    window.promptbooster.onEnhanceSuccess(({ enhanced: text, rawPrompt }) => {
      setEnhanced(text);
      if (rawPrompt) setOriginal(rawPrompt);
      setStatus('success');
    });

    window.promptbooster.onEnhanceError(({ code, message }) => {
      setErrorInfo(ERROR_COPY[code] || { ...ERROR_COPY.UNKNOWN, message: message || ERROR_COPY.UNKNOWN.message });
      setStatus('error');
    });
  }, []);

  useEffect(() => {
    if (status !== 'loading') return;
    const interval = setInterval(() => setSubtitleIdx((i) => (i + 1) % LOADING_SUBTITLES.length), 1200);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    function handleKey(e) {
      const typing = document.activeElement === enhancedRef.current || document.activeElement === manualRef.current;

      if (e.key === 'Escape') {
        window.promptbooster.closeOverlay();
        return;
      }
      // Ctrl+Enter submits from the manual box, or replaces from a result.
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (status === 'manual') submitManual();
        else if (status === 'success') handleReplace();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !typing && enhanced) {
        handleCopy();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  function submitManual() {
    const text = manualText.trim();
    if (!text) return;
    setOriginal(text);
    setStatus('loading');
    window.promptbooster.enhanceManual(text, styleRef.current);
  }

  function handleCopy() {
    if (!enhanced) return;
    window.promptbooster.copyText(enhanced);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReplace() {
    if (!enhanced) return;
    window.promptbooster.replaceText(enhanced);
  }

  function handleRegenerate() {
    setStatus('loading');
    setErrorInfo(null);
    window.promptbooster.regenerate(original, style);
  }

  function selectStyle(id) {
    setStyle(id);
    setStyleMenuOpen(false);
    window.promptbooster.setSetting('enhancementStyle', id);
  }

  function startOver() {
    setManualText(original || '');
    setEnhanced('');
    setErrorInfo(null);
    setStatus('manual');
    setTimeout(() => manualRef.current?.focus(), 60);
  }

  const styleLabel = STYLES.find((s) => s.id === style)?.label || 'Auto';

  return (
    <div className="overlay">
      <div className="overlay-header">
        <div className="logo">
          PromptBooster <span className="accent">✦</span>
        </div>
        <div className="overlay-header-actions">
          <div style={{ position: 'relative' }}>
            <button className="style-pill" onClick={() => setStyleMenuOpen((v) => !v)}>
              {styleLabel} ▾
            </button>
            {styleMenuOpen && (
              <div className="style-menu">
                {STYLES.map((s) => (
                  <div
                    key={s.id}
                    className={`style-menu-item ${s.id === style ? 'active' : ''}`}
                    onClick={() => selectStyle(s.id)}
                  >
                    {s.label}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="icon-btn" title="Settings" onClick={() => window.promptbooster.openSettings()}>
            ⚙
          </button>
          <button className="icon-btn" title="Close (Esc)" onClick={() => window.promptbooster.closeOverlay()}>
            ×
          </button>
        </div>
      </div>

      <div className="overlay-body">
        {truncated && status !== 'manual' && (
          <div className="warning-banner">Captured text was over 4000 characters and was truncated.</div>
        )}

        {status === 'manual' && (
          <>
            <div className="field-desc">
              Type or paste a rough prompt — PromptBooster will rewrite it into a detailed, structured one.
            </div>
            <textarea
              ref={manualRef}
              className="enhanced-textarea"
              autoFocus
              placeholder="e.g. build me a dashboard with charts"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
            />
          </>
        )}

        {status !== 'manual' && original && (
          <details className="original-section">
            <summary>Original prompt</summary>
            <pre>{original}</pre>
          </details>
        )}

        {status === 'loading' && (
          <>
            <div className="skeleton" />
            <div className="loading-subtitle">{LOADING_SUBTITLES[subtitleIdx]}</div>
          </>
        )}

        {status === 'success' && (
          <textarea
            ref={enhancedRef}
            className="enhanced-textarea"
            value={enhanced}
            onChange={(e) => setEnhanced(e.target.value)}
          />
        )}

        {status === 'error' && errorInfo && (
          <div className="error-box">
            <div>{errorInfo.message}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {errorInfo.showSettings && (
                <button className="btn primary" onClick={() => window.promptbooster.openSettings()}>
                  Open Settings
                </button>
              )}
              {errorInfo.retry && (
                <button className="btn" onClick={handleRegenerate}>
                  Retry
                </button>
              )}
              <button className="btn" onClick={startOver}>
                Edit prompt
              </button>
            </div>
          </div>
        )}
      </div>

      {status === 'manual' && (
        <div className="action-row">
          <div className="spacer" />
          <span className="char-count">{manualText.length} chars</span>
          <button className="btn primary" onClick={submitManual} disabled={!manualText.trim()}>
            Enhance
          </button>
        </div>
      )}

      {status === 'success' && (
        <div className="action-row">
          <button className="btn" onClick={handleRegenerate}>
            ↻ Regenerate
          </button>
          <button className="btn" onClick={startOver}>
            Edit prompt
          </button>
          <div className="spacer" />
          <span className="char-count">{enhanced.length} chars</span>
          <button className="btn" onClick={handleCopy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button className="btn primary" onClick={handleReplace}>
            Replace in App
          </button>
        </div>
      )}

      <div className="overlay-footer">
        <div className="shortcut-hints">
          <span>
            <kbd>Esc</kbd> close
          </span>
          <span>
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> {status === 'manual' ? 'enhance' : 'replace'}
          </span>
        </div>
      </div>
    </div>
  );
}
