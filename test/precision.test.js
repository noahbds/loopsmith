// Moving a whole loop, loop names, the colour palette, and times kept to hundredths.
import { describe, expect, it } from 'vitest';
import * as E from '../src/core/engine.js';
import { PALETTE, MAX_LOOPS, NAME_MAX } from '../src/core/constants.js';
import { fmt, parseTime, segments } from '../src/core/util.js';

const loop = (a, b, more = {}) => ({ ...E.newLoop(a, b, 0, { count: 2, infinite: false }), ...more });

describe('moveLoop', () => {
  it('keeps the length and rounds to tenths', () => {
    expect(E.moveLoop(loop(10, 20), 33.37, 100)).toEqual({ a: 33.4, b: 43.4 });
  });
  it('stops at the start of the media', () => {
    expect(E.moveLoop(loop(10, 20), -5, 100)).toEqual({ a: 0, b: 10 });
  });
  it('stops at the end of the media', () => {
    expect(E.moveLoop(loop(10, 20), 95, 100)).toEqual({ a: 90, b: 100 });
  });
  it('keeps hundredths when asked to', () => {
    expect(E.moveLoop(loop(10, 20.5), 33.376, 100, 2)).toEqual({ a: 33.38, b: 43.88 });
  });
});

describe('movePoint with hundredths', () => {
  it('rounds to hundredths and allows 0.2 s loops', () => {
    expect(E.movePoint(loop(10, 20), 'a', 12.345, false, 100, 2)).toEqual({ a: 12.35, b: 20 });
    expect(E.movePoint(loop(10, 20), 'b', 10.25, false, 100, 2)).toEqual({ a: 10, b: 10.25 });
  });
  it('still stops at 0.5 s in the default mode', () => {
    expect(E.movePoint(loop(10, 20), 'b', 10.25, false, 100)).toEqual({ a: 10, b: 10.5 });
  });
});

describe('sortedByStart', () => {
  it('orders loops by start without changing the original list', () => {
    const a = loop(30, 40);
    const b = loop(5, 9);
    const c = loop(5, 7);
    const list = [a, b, c];
    expect(E.sortedByStart(list)).toEqual([c, b, a]);
    expect(list).toEqual([a, b, c]);
  });
});

describe('names and colours', () => {
  it('a name survives saving and is trimmed and shortened', () => {
    const saved = E.serializeLoops([loop(1, 5, { name: 'Intro riff' }), loop(6, 9)]);
    expect(saved[0].name).toBe('Intro riff');
    expect(saved[1]).not.toHaveProperty('name');
    const long = 'x'.repeat(NAME_MAX + 10);
    const back = E.loopsFromSaved({ loops: [{ a: 1, b: 5, name: `  ${long}  ` }, { a: 6, b: 9, name: '   ' }] }, { count: 3, infinite: false });
    expect(back[0].name).toBe('x'.repeat(NAME_MAX));
    expect(back[1].name).toBeUndefined();
  });
  it('has a colour for every possible loop, all different', () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(MAX_LOOPS);
    expect(new Set(PALETTE).size).toBe(PALETTE.length);
  });
});

describe('times to hundredths', () => {
  it('formats and drops trailing zeros', () => {
    expect(fmt(83.45, false, 2)).toBe('1:23.45');
    expect(fmt(83.5, false, 2)).toBe('1:23.5');
    expect(fmt(83.05, false, 2)).toBe('1:23.05');
    expect(fmt(83, false, 2)).toBe('1:23');
    expect(fmt(83.45, false)).toBe('1:23.5'); // tenths by default (rounded)
  });
  it('parses what it prints', () => {
    for (const x of [83.45, 83.5, 83.05, 3723.25]) expect(parseTime(fmt(x, false, 2))).toBeCloseTo(x, 5);
  });
  it('splits the seconds part for stepping', () => {
    expect(segments('1:23.45', 2).at(-1)).toEqual({ start: 5, end: 7, unit: 0.01 });
    expect(segments('1:23.4').at(-1)).toEqual({ start: 5, end: 6, unit: 0.1 });
  });
});

describe('clampLoops', () => {
  it('leaves a short loop made in fine mode short', () => {
    const l = loop(10, 10.25);
    E.clampLoops([l], 100);
    expect([l.a, l.b]).toEqual([10, 10.25]);
  });
  it('still grows a loop that is shorter than any loop can be', () => {
    const l = loop(10, 10.05);
    E.clampLoops([l], 100);
    expect(l.b - l.a).toBeCloseTo(0.2, 5);
  });
});
