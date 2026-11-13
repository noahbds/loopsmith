// Which shortcut a key press is. Pure, so it can be tested. All shortcuts need Shift and no other
// modifier; none of the defaults is a shortcut YouTube uses (its Shift+N/P, Shift+, Shift+. and
// Shift+/ are left alone).
//
// Letters are matched by the character typed (so they follow the user's layout); the other keys by
// their physical position, so they are in the same place on every layout.

const LETTERS = { a: 'markA', b: 'markB', r: 'toggle', s: 'start', z: 'restart', m: 'tap' };
const CODES = { BracketRight: 'next', BracketLeft: 'prev', Backslash: 'skipRep' };

/**
 * @param {{ key?: string, code?: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} e
 * @returns {{ action: string, index?: number } | null}
 */
export function hotkeyAction(e) {
  if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return null;
  const key = e.key || '';
  const code = e.code || '';
  if (/^[a-z]$/i.test(key)) {
    const action = LETTERS[key.toLowerCase()];
    return action ? { action } : null;
  }
  if (CODES[code]) return { action: CODES[code] };
  const digit = /^Digit([1-9])$/.exec(code);
  if (digit) return { action: 'goto', index: Number(digit[1]) - 1 };
  // A layout whose letters aren't Latin: the physical key still says which letter it is.
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) {
    const action = LETTERS[letter[1].toLowerCase()];
    return action ? { action } : null;
  }
  return null;
}
