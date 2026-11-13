import { describe, expect, it } from 'vitest';
import { hotkeyAction } from '../src/core/keys.js';

const press = (key, code, extra = {}) => hotkeyAction({ key, code, shiftKey: true, ...extra });

describe('hotkeyAction', () => {
  it('keeps the original four shortcuts', () => {
    expect(press('A', 'KeyA')).toEqual({ action: 'markA' });
    expect(press('B', 'KeyB')).toEqual({ action: 'markB' });
    expect(press('R', 'KeyR')).toEqual({ action: 'toggle' });
    expect(press('S', 'KeyS')).toEqual({ action: 'start' });
  });

  it('adds restart, next, previous, skip and go-to', () => {
    expect(press('Z', 'KeyZ')).toEqual({ action: 'restart' });
    expect(press('}', 'BracketRight')).toEqual({ action: 'next' });
    expect(press('{', 'BracketLeft')).toEqual({ action: 'prev' });
    expect(press('|', 'Backslash')).toEqual({ action: 'skipRep' });
    expect(press('!', 'Digit1')).toEqual({ action: 'goto', index: 0 });
    expect(press('(', 'Digit9')).toEqual({ action: 'goto', index: 8 });
  });

  it('follows the typed letter, not the key position', () => {
    // AZERTY: the key at the QWERTY "Q" position types "a"
    expect(press('A', 'KeyQ')).toEqual({ action: 'markA' });
  });

  it('finds the letter by position on a non-Latin layout', () => {
    expect(press('Ф', 'KeyA')).toEqual({ action: 'markA' });
  });

  it('leaves YouTube\'s own Shift shortcuts alone', () => {
    for (const [k, c] of [['N', 'KeyN'], ['P', 'KeyP'], ['<', 'Comma'], ['>', 'Period'], ['?', 'Slash'], ['+', 'Equal'], ['_', 'Minus']]) {
      expect(press(k, c)).toBeNull();
    }
  });

  it('needs Shift and no other modifier', () => {
    expect(hotkeyAction({ key: 'a', code: 'KeyA', shiftKey: false })).toBeNull();
    expect(press('A', 'KeyA', { ctrlKey: true })).toBeNull();
    expect(press('A', 'KeyA', { metaKey: true })).toBeNull();
    expect(press('A', 'KeyA', { altKey: true })).toBeNull();
  });

  it('ignores Shift+0', () => {
    expect(press(')', 'Digit0')).toBeNull();
  });
});
