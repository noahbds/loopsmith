// Which shortcut a key press is, plus custom binding helpers. Pure, so it can be tested.
//
// Default shortcuts all use Shift and no other modifier; none of the defaults is a shortcut
// YouTube uses (its Shift+N/P, Shift+, Shift+. and Shift+/ are left alone).
// Custom bindings in `prefs.keys` map an action name to a chord like "Alt+A" or "Ctrl+Shift+BracketRight",
// or "" to turn that shortcut off.

/**
 * @typedef {{ action: string, label: string, defaultSpec: string }} ShortcutDef
 */

/** @type {ShortcutDef[]} */
export const SHORTCUT_DEFS = [
  { action: 'markA', label: 'Start at the current time', defaultSpec: 'Shift+A' },
  { action: 'markB', label: 'End at the current time', defaultSpec: 'Shift+B' },
  { action: 'start', label: 'Play the selected loop', defaultSpec: 'Shift+S' },
  { action: 'toggle', label: 'Looping on / off', defaultSpec: 'Shift+R' },
  { action: 'next', label: 'Next loop', defaultSpec: 'Shift+BracketRight' },
  { action: 'prev', label: 'Previous loop', defaultSpec: 'Shift+BracketLeft' },
  { action: 'skipRep', label: 'Skip this repetition', defaultSpec: 'Shift+Backslash' },
  { action: 'restart', label: 'Restart this repetition', defaultSpec: 'Shift+Z' },
  { action: 'tap', label: 'Tap to mark sections', defaultSpec: 'Shift+M' },
  { action: 'shiftBack', label: 'Move loop back by its length', defaultSpec: 'Shift+J' },
  { action: 'shiftForward', label: 'Move loop ahead by its length', defaultSpec: 'Shift+L' },
  { action: 'halve', label: 'Halve loop length', defaultSpec: 'Shift+H' },
  { action: 'double', label: 'Double loop length', defaultSpec: 'Shift+D' },
];

const VALID_ACTIONS = new Set(SHORTCUT_DEFS.map((d) => d.action));
const LETTERS = /** @type {Record<string, string>} */ ({
  a: 'markA', b: 'markB', r: 'toggle', s: 'start', z: 'restart', m: 'tap',
  j: 'shiftBack', l: 'shiftForward', h: 'halve', d: 'double',
});
const CODES = /** @type {Record<string, string>} */ ({
  BracketRight: 'next', BracketLeft: 'prev', Backslash: 'skipRep',
});

const PRETTY_KEY = /** @type {Record<string, string>} */ ({
  BracketRight: ']',
  BracketLeft: '[',
  Backslash: '\\',
  Slash: '/',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Space: 'Space',
});

/**
 * Sanitises a stored `prefs.keys` map.
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function cleanKeyMap(raw) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (VALID_ACTIONS.has(k) && typeof v === 'string' && v.length <= 40) out[k] = v;
  }
  return out;
}

/**
 * Active binding spec for `action` ("Shift+A", or "" when disabled).
 * @param {string} action
 * @param {Record<string, string>} [custom]
 */
export function specFor(action, custom) {
  if (custom && Object.prototype.hasOwnProperty.call(custom, action)) return custom[action];
  const def = SHORTCUT_DEFS.find((d) => d.action === action);
  return def ? def.defaultSpec : '';
}

/**
 * Formats a binding spec ("Shift+BracketRight" -> "Shift+]") for display.
 * @param {string} spec
 */
export function formatBinding(spec) {
  if (!spec) return 'Off';
  const parts = spec.split('+');
  const last = parts[parts.length - 1];
  let key = PRETTY_KEY[last] || last;
  if (/^Key([A-Z])$/.test(last)) key = last.slice(3);
  else if (/^Digit([0-9])$/.test(last)) key = last.slice(5);
  else if (/^Arrow/.test(last)) key = last.slice(5);
  return [...parts.slice(0, -1), key].join('+');
}

/**
 * Records a modifier+key press from a KeyboardEvent into a canonical spec string, or null if
 * the press is a bare modifier or has no modifier at all (plain keys are left to the page).
 * @param {{ key?: string, code?: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} e
 * @returns {string | null}
 */
export function bindingFromEvent(e) {
  const key = e.key || '';
  const code = e.code || '';
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(key)) return null;
  if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) return null;
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Meta');
  const tok = /^[a-z]$/i.test(key) ? key.toUpperCase() : code || key.toUpperCase();
  return tok ? `${mods.join('+')}+${tok}` : null;
}

/**
 * @param {{ key?: string, code?: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} e
 * @param {string} spec
 */
function matchesSpec(e, spec) {
  if (!spec) return false;
  const parts = spec.split('+');
  const tok = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  if (!!e.ctrlKey !== mods.has('Ctrl')) return false;
  if (!!e.altKey !== mods.has('Alt')) return false;
  if (!!e.shiftKey !== mods.has('Shift')) return false;
  if (!!e.metaKey !== mods.has('Meta')) return false;
  const key = e.key || '';
  const code = e.code || '';
  if (/^[A-Z]$/.test(tok)) {
    if (/^[a-z]$/i.test(key)) return key.toUpperCase() === tok;
    return code === 'Key' + tok;
  }
  return code === tok;
}

/**
 * @param {{ key?: string, code?: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} e
 * @param {Record<string, string>} [custom]
 * @returns {{ action: string, index?: number } | null}
 */
export function hotkeyAction(e, custom) {
  const hasCustom = !!custom && Object.keys(custom).length > 0;
  if (hasCustom) {
    for (const [action, spec] of Object.entries(custom)) {
      if (spec && VALID_ACTIONS.has(action) && matchesSpec(e, spec)) return { action };
    }
  }

  if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return null;
  /** @param {string} action */
  const isOverridden = (action) => hasCustom && Object.prototype.hasOwnProperty.call(custom, action);
  const key = e.key || '';
  const code = e.code || '';
  if (/^[a-z]$/i.test(key)) {
    const action = LETTERS[key.toLowerCase()];
    return action && !isOverridden(action) ? { action } : null;
  }
  if (CODES[code]) {
    const action = CODES[code];
    return !isOverridden(action) ? { action } : null;
  }
  // Shift+1…9, unless Shift is how this layout types digits (AZERTY): there the key is the site's
  // own digit shortcut (YouTube: jump to 10 %…90 %).
  const digit = /^Digit([1-9])$/.exec(code);
  if (digit) return /^[0-9]$/.test(key) ? null : { action: 'goto', index: Number(digit[1]) - 1 };
  // A layout whose letters aren't Latin: the physical key still says which letter it is.
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) {
    const action = LETTERS[letter[1].toLowerCase()];
    return action && !isOverridden(action) ? { action } : null;
  }
  return null;
}
