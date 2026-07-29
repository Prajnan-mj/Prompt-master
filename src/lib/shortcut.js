export const DEFAULT_SHORTCUT = 'Control+Shift+F9';

// Derive the key name from e.code, not e.key: with modifiers held (especially
// AltGr) e.key reports the *composed character*, which is exactly the garbage
// we're trying to avoid binding.
function keyNameFromCode(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  const named = {
    Space: 'Space',
    Enter: 'Return',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/'
  };
  return named[code] || null;
}

/**
 * Turn a keydown event into an Electron accelerator string.
 * Returns {accelerator} on success, {error} for a combo we refuse to bind,
 * or null for a modifier-only / unnameable press.
 */
export function formatAccelerator(e) {
  const modifiers = [];
  if (e.ctrlKey) modifiers.push('Control');
  if (e.altKey) modifiers.push('Alt');
  if (e.shiftKey) modifiers.push('Shift');
  if (e.metaKey) modifiers.push('Super');

  const key = keyNameFromCode(e.code);
  if (!key) return null;

  // A lone Alt+<letter> (or any single-modifier combo) collides with the OS
  // menu-mnemonic system and other apps' own accelerators.
  if (modifiers.length < 2) {
    return { error: 'Use at least two modifiers (e.g. Ctrl+Shift+F9) — single-modifier combos collide with other apps.' };
  }

  // Ctrl+Alt is AltGr on Windows: it types stray characters into the focused
  // field instead of acting as a clean accelerator.
  if (e.ctrlKey && e.altKey && !e.shiftKey) {
    return { error: 'Avoid Ctrl+Alt — Windows treats it as AltGr and types stray characters. Try Ctrl+Shift+…' };
  }

  return { accelerator: [...modifiers, key].join('+') };
}

/** Human-friendly rendering of an accelerator, e.g. "Ctrl + Shift + F9". */
export function prettyShortcut(accelerator) {
  if (!accelerator) return '';
  return accelerator
    .replace(/CommandOrControl|Control/g, 'Ctrl')
    .replace(/Super/g, 'Win')
    .split('+')
    .join(' + ');
}
