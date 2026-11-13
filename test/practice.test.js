import { describe, expect, it } from 'vitest';
import * as P from '../src/core/practice.js';
import * as E from '../src/core/engine.js';

const ramp = (more = {}) => ({ ...P.defaultRamp(), on: true, ...more });

describe('clampRate', () => {
  it('snaps to 5% and stays between 25% and 200%', () => {
    expect(P.clampRate(0.73)).toBeCloseTo(0.75, 5);
    expect(P.clampRate(0.1)).toBe(0.25);
    expect(P.clampRate(5)).toBe(2);
    expect(P.rateText(0.75)).toBe('75%');
  });
});

describe('rateFor', () => {
  it('leaves the speed alone when the loop has none and there is no ramp', () => {
    expect(P.rateFor({ done: 0 }, P.defaultRamp())).toBeNull();
    expect(P.rateFor({ rate: null, done: 4 }, P.defaultRamp())).toBeNull();
  });
  it("uses the loop's own speed when there is no ramp", () => {
    expect(P.rateFor({ rate: 0.7, done: 9 }, P.defaultRamp())).toBeCloseTo(0.7, 5);
  });
  it('steps up after every N repetitions, from the loop speed to the target', () => {
    const r = ramp({ step: 5, every: 3, target: 100 });
    const at = (done) => P.rateFor({ rate: 0.7, done }, r);
    expect([0, 1, 2].map(at)).toEqual([0.7, 0.7, 0.7].map((x) => expect.closeTo(x, 5)));
    expect(at(3)).toBeCloseTo(0.75, 5);
    expect(at(6)).toBeCloseTo(0.8, 5);
    expect(at(30)).toBeCloseTo(1, 5); // stops at the target
    expect(at(300)).toBeCloseTo(1, 5);
  });
  it('starts from 100% when the loop has no speed of its own', () => {
    expect(P.rateFor({ done: 0 }, ramp({ target: 150, step: 10, every: 1 }))).toBeCloseTo(1, 5);
    expect(P.rateFor({ done: 2 }, ramp({ target: 150, step: 10, every: 1 }))).toBeCloseTo(1.2, 5);
  });
  it('never slows a loop that is already at or past the target', () => {
    expect(P.rateFor({ rate: 1.25, done: 10 }, ramp({ target: 100 }))).toBeCloseTo(1.25, 5);
  });
});

describe('readRamp', () => {
  it('fills in and limits whatever was stored', () => {
    expect(P.readRamp(null)).toEqual(P.defaultRamp());
    expect(P.readRamp({ on: true, step: 500, every: 0, target: 'x' })).toEqual({ on: true, step: 50, every: 1, target: 100 });
  });
});

describe('a speed on a loop', () => {
  it('is saved only when set, and read back within range', () => {
    const l = { ...E.newLoop(1, 5, 0, { count: 2, infinite: false }), rate: 0.75 };
    const saved = E.serializeLoops([l, E.newLoop(6, 9, 1, { count: 2, infinite: false })]);
    expect(saved[0].rate).toBe(0.75);
    expect(saved[1]).not.toHaveProperty('rate');
    const back = E.loopsFromSaved({ loops: [{ a: 1, b: 5, rate: 0.75 }, { a: 6, b: 9, rate: 9 }, { a: 10, b: 12 }] }, { count: 2, infinite: false });
    expect(back[0].rate).toBeCloseTo(0.75, 5);
    expect(back[1].rate).toBe(2);
    expect(back[2].rate).toBeUndefined();
  });
  it('is given to new loops from the default', () => {
    expect(E.newLoop(1, 5, 0, { count: 2, infinite: false, rate: 0.8 }).rate).toBeCloseTo(0.8, 5);
    expect(E.newLoop(1, 5, 0, { count: 2, infinite: false }).rate).toBeUndefined();
  });
});
