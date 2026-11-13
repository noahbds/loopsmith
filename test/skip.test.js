// Skipping, going back and jumping: the actions behind the next/previous buttons and their shortcuts.
import { describe, expect, it } from 'vitest';
import * as E from '../src/core/engine.js';

const loop = (a, b, count = 1, more = {}) => ({ ...E.newLoop(a, b, 0, { count, infinite: false }), ...more });
const opts = { duration: 100, guard: 0.25, after: 'continue' };

describe('restartRep', () => {
  it('goes back to the start without counting a play', () => {
    const l = loop(10, 20, 3);
    expect(E.restartRep(l)).toEqual({ seek: 10, restart: l });
    expect(l.done).toBe(0);
  });
  it('does nothing outside a loop', () => {
    expect(E.restartRep(null)).toBeNull();
  });
});

describe('skipRep', () => {
  it('counts the repetition and starts the next one', () => {
    const l = loop(10, 20, 3);
    expect(E.skipRep([l], l, opts)).toEqual({ seek: 10, repeat: l });
    expect(l.done).toBe(1);
    expect(E.skipRep([l], l, opts)).toEqual({ seek: 10, repeat: l });
    expect(l.done).toBe(2);
  });

  it('on an endless loop just starts the next repetition, forever', () => {
    const l = loop(10, 20, 1, { infinite: true });
    for (let i = 0; i < 5; i++) expect(E.skipRep([l], l, opts)).toEqual({ seek: 10, repeat: l });
    expect(E.exhausted(l)).toBe(false);
  });

  it('skipping the last repetition of the only loop finishes the run', () => {
    const l = loop(10, 20, 1);
    expect(E.skipRep([l], l, opts)).toEqual({ finish: true });
  });

  it('skipping the last repetition: "Play on" carries on from the loop end', () => {
    const l1 = loop(10, 20, 1);
    const l2 = loop(40, 50, 1);
    expect(E.skipRep([l1, l2], l1, opts)).toEqual({ seek: 20, carryOn: true });
  });

  it('skipping the last repetition: "Next loop" jumps to the next loop', () => {
    const l1 = loop(10, 20, 1);
    const l2 = loop(40, 50, 1);
    expect(E.skipRep([l1, l2], l1, { ...opts, after: 'next' })).toEqual({ seek: 40, next: l2 });
  });

  it('does nothing outside a loop', () => {
    expect(E.skipRep([loop(10, 20)], null, opts)).toBeNull();
  });
});

describe('skipLoop', () => {
  it('drops the remaining plays and jumps to the next loop', () => {
    const l1 = loop(10, 20, 5);
    const l2 = loop(40, 50, 2);
    expect(E.skipLoop([l1, l2], l1, 12, opts)).toEqual({ seek: 40, next: l2 });
    expect(l1.skip).toBe(true);
    expect(E.skipped(l1)).toBe(true);
    expect(E.exhausted(l1)).toBe(false); // the count is untouched
  });

  it('works on an endless loop, the way out of it', () => {
    const l1 = loop(10, 20, 1, { infinite: true });
    const l2 = loop(40, 50, 2);
    expect(E.skipLoop([l1, l2], l1, 12, opts)).toEqual({ seek: 40, next: l2 });
  });

  it('the skipped loop no longer takes the playhead or counts plays', () => {
    const l1 = loop(10, 20, 5);
    const l2 = loop(40, 50, 2);
    E.skipLoop([l1, l2], l1, 12, opts);
    expect(E.loopAt([l1, l2], 15, 100, 0.25)).toBeNull();
    expect(E.advance([l1, l2], 19.9, 20.1, opts)).toBeNull();
  });

  it('finishes the run when no loop is left', () => {
    const l1 = loop(10, 20, 5);
    expect(E.skipLoop([l1], l1, 12, opts)).toEqual({ finish: true });
  });

  it('ignores loops that are switched off or already played out', () => {
    const l1 = loop(10, 20, 5);
    const off = loop(30, 35, 2, { on: false });
    const spent = loop(40, 45, 1, { done: 1 });
    const l4 = loop(60, 70, 1);
    expect(E.skipLoop([l1, off, spent, l4], l1, 12, opts)).toEqual({ seek: 60, next: l4 });
  });

  it('inside an outer loop, carries on from the skipped loop\'s end', () => {
    const outer = loop(0, 40, 2);
    const inner = loop(10, 20, 3);
    expect(E.skipLoop([outer, inner], inner, 12, opts)).toEqual({ seek: 20, carryOn: true });
    expect(E.loopAt([outer, inner], 25, 100, 0.25)).toBe(outer);
  });

  it('between loops jumps to the next one', () => {
    const l1 = loop(10, 20, 2);
    const l2 = loop(40, 50, 2);
    expect(E.skipLoop([l1, l2], null, 30, opts)).toEqual({ seek: 40, next: l2 });
    expect(l1.skip).toBe(false);
  });

  it('jumps to an overlapping loop at its own start', () => {
    const l1 = loop(10, 30, 2);
    const l2 = loop(20, 40, 2);
    expect(E.skipLoop([l1, l2], l1, 12, opts)).toEqual({ seek: 20, next: l2 });
  });
});

describe('prevLoop', () => {
  const l1 = () => loop(10, 20, 2, { done: 2 });
  const l2 = () => loop(40, 50, 2);

  it('early in a repetition, goes back to the previous loop and plays it afresh', () => {
    const a = l1();
    const b = l2();
    a.skip = true;
    expect(E.prevLoop([a, b], b, 41)).toEqual({ seek: 10, prev: a });
    expect(a.done).toBe(0);
    expect(a.skip).toBe(false);
  });

  it('later in a repetition, restarts it', () => {
    const a = l1();
    const b = l2();
    expect(E.prevLoop([a, b], b, 44)).toEqual({ seek: 40, restart: b });
    expect(a.done).toBe(2);
  });

  it('on the first loop, restarts it', () => {
    const a = loop(10, 20);
    expect(E.prevLoop([a, l2()], a, 10.5)).toEqual({ seek: 10, restart: a });
  });

  it('passes over loops that are switched off', () => {
    const a = loop(10, 20);
    const off = loop(25, 30, 1, { on: false });
    const b = l2();
    expect(E.prevLoop([a, off, b], b, 41)).toEqual({ seek: 10, prev: a });
  });

  it('between loops, goes to the closest loop that starts before the playhead', () => {
    const a = l1();
    const b = l2();
    expect(E.prevLoop([a, b], null, 30)).toEqual({ seek: 10, prev: a });
  });

  it('does nothing with no loop behind and none in charge', () => {
    expect(E.prevLoop([l2()], null, 5)).toBeNull();
  });
});

describe('gotoLoop', () => {
  it('switches the loop on and plays it afresh', () => {
    const l = loop(10, 20, 2, { on: false, done: 2, skip: true });
    expect(E.gotoLoop(l)).toEqual({ seek: 10, goto: l });
    expect(l).toMatchObject({ on: true, done: 0, skip: false });
  });
  it('does nothing for a loop that does not exist', () => {
    expect(E.gotoLoop(undefined)).toBeNull();
  });
});

describe('a run and its reset', () => {
  it('resetRun starts every count over and clears skips', () => {
    const a = loop(1, 2, 2, { done: 2, skip: true });
    const b = loop(3, 4, 2, { done: 1 });
    E.resetRun([a, b]);
    expect([a.done, a.skip, b.done, b.skip]).toEqual([0, false, 0, false]);
  });

  it('skips are never saved', () => {
    const a = loop(1, 5, 2, { skip: true });
    expect(E.serializeLoops([a])[0]).not.toHaveProperty('skip');
    expect(E.loopsFromSaved({ loops: E.serializeLoops([a]) }, { count: 5, infinite: false })[0].skip).toBe(false);
  });

  it('finished() covers both played out and skipped', () => {
    expect(E.finished(loop(1, 2, 1, { done: 1 }))).toBe(true);
    expect(E.finished(loop(1, 2, 1, { skip: true }))).toBe(true);
    expect(E.finished(loop(1, 2, 1))).toBe(false);
  });
});
