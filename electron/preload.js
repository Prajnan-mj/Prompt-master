const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('promptbooster', {
  // Overlay events from main
  onCaptureResult: (cb) => ipcRenderer.on('capture:result', (_e, data) => cb(data)),
  onCaptureEmpty: (cb) => ipcRenderer.on('capture:empty', () => cb()),
  onManualMode: (cb) => ipcRenderer.on('overlay:manual', (_e, data) => cb(data)),
  onEnhanceStart: (cb) => ipcRenderer.on('enhance:start', () => cb()),
  onEnhanceSuccess: (cb) => ipcRenderer.on('enhance:success', (_e, data) => cb(data)),
  onEnhanceError: (cb) => ipcRenderer.on('enhance:error', (_e, data) => cb(data)),

  // Overlay actions
  closeOverlay: () => ipcRenderer.invoke('overlay:close'),
  regenerate: (rawPrompt, style) => ipcRenderer.invoke('overlay:regenerate', { rawPrompt, style }),
  enhanceManual: (text, style) => ipcRenderer.invoke('overlay:enhanceManual', { text, style }),
  copyText: (text) => ipcRenderer.invoke('overlay:copy', text),
  replaceText: (text) => ipcRenderer.invoke('overlay:replace', text),
  openSettings: () => ipcRenderer.invoke('overlay:openSettings'),

  // Store
  getSetting: (key) => ipcRenderer.invoke('store:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('store:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('store:getAll'),
  clearApiKey: () => ipcRenderer.invoke('store:clearApiKey'),

  // API
  testApiKey: (apiKey) => ipcRenderer.invoke('api:testKey', apiKey),

  // Usage
  getUsage: () => ipcRenderer.invoke('usage:get'),

  // Onboarding
  completeOnboarding: () => ipcRenderer.invoke('onboarding:complete'),

  // Shortcut remap
  setShortcutCapturing: (capturing) => ipcRenderer.invoke('shortcut:capturing', capturing),

  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
});
