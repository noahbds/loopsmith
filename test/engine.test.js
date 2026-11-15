import { describe, expect, it } from 'vitest';
import * as E from '../src/core/engine.js';

const D = { count: 3, infinite: false };
const loop = (a, b, more = {}) => ({ ...E.newLoop(a, b, 0, D), ...more });

describe('loopEnd', () => {
  it('turns around at b inside the media', () => {
    expect(E.loopEnd(loop(10, 20), 100, 0.25)).toBe(20);
  });
  it('turns around a little before the very end', () => {
    expect(E.loopEnd(loop(10, 100), 100, 0.25)).toBe(99.75);
  });
  it('never turns around before a + 0.2', () => {
    expect(E.loopEnd(loop(99.9, 100), 100, 0.25)).toBeCloseTo(100.1);
  });
});

describe('loopAt', () => {
  it('finds the loop the playhead is in', () => {
    const l = loop(10, 20);
    expect(E.loopAt([l], 15, 100, 0.25)).toBe(l);
    expect(E.loopAt([l], 25, 100, 0.25)).toBe(null);
  });
  it('gives the turn to the loop that started first, even with another inside it', () => {
    const outer = loop(0, 60);
    const inner = loop(20, 30);
    expect(E.loopAt([outer, inner], 25, 100, 0.25)).toBe(outer);
    expect(E.loopAt([inner, outer], 25, 100, 0.25)).toBe(outer);
    outer.done = 3; // its turn is over
    expect(E.loopAt([outer, inner], 25, 100, 0.25)).toBe(inner);
  });
  it('same start: the lower-numbered loop has the turn', () => {
    const one = loop(10, 40);
    const two = loop(10, 20);
    expect(E.loopAt([one, two], 15, 100, 0.25)).toBe(one);
    expect(E.loopAt([two, one], 15, 100, 0.25)).toBe(two);
  });
  it('ignores switched-off and played-out loops', () => {
    expect(E.loopAt([loop(10, 20, { on: false })], 15, 100, 0.25)).toBe(null);
    expect(E.loopAt([loop(10, 20, { done: 3 })], 15, 100, 0.25)).toBe(null);
  });
});

describe('nextLoop', () => {
  it('returns the closest playable loop ahead', () => {
    const a = loop(30, 40);
    const b = loop(50, 60);
    expect(E.nextLoop([b, a], 20)).toBe(a);
    expect(E.nextLoop([b, a, loop(25, 28, { on: false })], 20)).toBe(a);
    expect(E.nextLoop([a, b], 55)).toBe(null);
  });
});

describe('crossing a loop end', () => {
  const o = { duration: 100, guard: 0.25 };

  it('turns around when forward playback runs into the end', () => {
    const l = loop(10, 20);
    expect(E.advance([l], 19.9, 20.05, o)).toEqual({ seek: 10, repeat: l });
    expect(E.advance([l], 19.0, 19.5, o)).toBe(null);
  });

  it('passes over the end of a loop whose turn it is not', () => {
    const outer = loop(0, 60);
    const inner = loop(20, 30);
    expect(E.advance([outer, inner], 29.9, 30.05, o)).toBe(null);
    expect(inner.done).toBe(0);
  });

  it('counts plays until the loop is exhausted', () => {
    const l = loop(10, 20, { count: 2 });
    expect(E.advance([l], 19.9, 20.05, o)).toMatchObject({ repeat: l });
    expect(E.advance([l], 19.9, 20.05, o)).toEqual({ finish: true });
    expect(E.exhausted(l)).toBe(true);
  });

  it('never exhausts an infinite loop', () => {
    const l = loop(10, 20, { infinite: true });
    for (let i = 0; i < 50; i++) expect(E.advance([l], 19.9, 20.05, o)).toMatchObject({ repeat: l });
  });

  it('knows whether anything is left ahead', () => {
    expect(E.anyAhead([loop(10, 20), loop(40, 50)], 25, 100, 0.25)).toBe(true);
    expect(E.anyAhead([loop(10, 20)], 25, 100, 0.25)).toBe(false);
  });
});

describe('movePoint', () => {
  it('rounds to tenths and keeps the loop inside the media', () => {
    expect(E.movePoint(loop(10, 20), 'a', 12.34, false, 100)).toEqual({ a: 12.3, b: 20 });
    expect(E.movePoint(loop(10, 20), 'b', 150, false, 100)).toEqual({ a: 10, b: 100 });
    expect(E.movePoint(loop(10, 20), 'a', -5, false, 100)).toEqual({ a: 0, b: 20 });
  });
  it('snaps b to the end when within 0.1 s of it', () => {
    expect(E.movePoint(loop(10, 20), 'b', 99.95, false, 100)).toEqual({ a: 10, b: 100 });
  });
  it('stops against the other end without push', () => {
    expect(E.movePoint(loop(10, 20), 'a', 25, false, 100)).toEqual({ a: 19.5, b: 20 });
    expect(E.movePoint(loop(10, 20), 'b', 5, false, 100)).toEqual({ a: 10, b: 10.5 });
  });
  it('pushes the other end and keeps the length with push', () => {
    expect(E.movePoint(loop(10, 20), 'a', 25, true, 100)).toEqual({ a: 25, b: 35 });
    expect(E.movePoint(loop(10, 20), 'b', 5, true, 100)).toEqual({ a: 0, b: 5 });
  });
});

describe('lanesOf', () => {
  it('puts overlapping loops on separate rows', () => {
    expect(E.lanesOf([loop(0, 10), loop(5, 15), loop(12, 20)])).toEqual([0, 1, 0]);
  });
});

describe('saving and restoring', () => {
  it('round-trips loops', () => {
    const loops = [loop(1, 2, { count: 7 }), loop(3, 9, { infinite: true, on: false, c: 4 })];
    const back = E.loopsFromSaved({ loops: E.serializeLoops(loops) }, D);
    expect(back.map(({ a, b, count, infinite, on, c }) => ({ a, b, count, infinite, on, c })))
      .toEqual(loops.map(({ a, b, count, infinite, on, c }) => ({ a, b, count, infinite, on, c })));
    expect(back.every((l) => l.done === 0)).toBe(true);
  });
  it('drops malformed entries', () => {
    const back = E.loopsFromSaved({ loops: [null, { a: 5, b: 2 }, { a: -1, b: 3 }, { a: 'x', b: 3 }, { a: 1, b: 4, n: 0, c: 99 }] }, D);
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ a: 1, b: 4, count: 3, c: 11 }) // an unknown colour index is clamped to the last of the 12;
    expect(E.loopsFromSaved({ loops: [] }, D)).toBe(null);
    expect(E.loopsFromSaved(null, D)).toBe(null);
  });
  it('clamps loops to a new duration', () => {
    const loops = [loop(50, 80), loop(95, 120)];
    E.clampLoops(loops, 100);
    expect(loops.map((l) => [l.a, l.b])).toEqual([[50, 80], [95, 100]]);
  });
});
