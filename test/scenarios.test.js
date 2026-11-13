// Whole playback runs through the loop engine: a simulated player moves forward in small steps,
// the engine decides, and the test checks which stretches of the media were actually played.
import { describe, expect, it } from 'vitest';
import * as E from '../src/core/engine.js';

const loop = (a, b, count = 1, more = {}) => ({ ...E.newLoop(a, b, 0, { count, infinite: false }), ...more });

// Plays from `from` until the run finishes (or `until`). Returns the played stretches, rounded.
function run(loops, { from = 0, after = 'continue', duration = 100, guard = 0.25, until = 1000 } = {}) {
  const dt = 0.05;
  const played = [];
  let start = from;
  let t = from;
  let clock = 0;
  let finished = false;
  while (clock < until && t < duration) {
    const prev = t;
    t = Math.min(duration, t + dt);
    clock += dt;
    const step = E.advance(loops, prev, t, { duration, guard, after });
    if (!step) continue;
    if (step.finish) {
      finished = true;
      break;
    }
    if (step.seek != null) {
      played.push([start, t]);
      t = step.seek;
      start = t;
    }
  }
  played.push([start, t]);
  return { played: played.map(([a, b]) => [Math.round(a * 10) / 10, Math.round(b * 10) / 10]), finished, at: Math.round(t * 10) / 10 };
}

describe('one loop', () => {
  it('plays the section the chosen number of times, then plays on', () => {
    const r = run([loop(10, 20, 3)], { from: 0, until: 60 });
    expect(r.played).toEqual([[0, 20], [10, 20], [10, 20]]);
    expect(r.finished).toBe(true);
  });
  it('turns around a little before the very end of the media', () => {
    const r = run([loop(90, 100, 2)], { from: 90 });
    expect(r.played).toEqual([[90, 99.8], [90, 99.8]]);
  });
  it('never finishes when infinite', () => {
    const r = run([loop(10, 12, 1, { infinite: true })], { from: 10, until: 30 });
    expect(r.finished).toBe(false);
    expect(r.played.length).toBeGreaterThan(10);
  });
  it('ignores a loop that is switched off', () => {
    const r = run([loop(10, 20, 3, { on: false }), loop(30, 40, 2)], { from: 0, until: 200 });
    expect(r.played).toEqual([[0, 40], [30, 40]]);
  });
});

describe('loops one after another', () => {
  const loops = () => [loop(10, 20, 2), loop(40, 50, 2)];
  it('"Play on": plays the gap between them', () => {
    expect(run(loops()).played).toEqual([[0, 20], [10, 50], [40, 50]]);
  });
  it('"Next loop": skips the gap', () => {
    expect(run(loops(), { after: 'next' }).played).toEqual([[0, 20], [10, 20], [40, 50], [40, 50]]);
  });
});

describe('loops that overlap partly (the bug from the screenshot)', () => {
  // Loop 1: 0:05 → 0:15 ×2. Loop 2: 0:12 → 0:20 ×3.
  const loops = () => [loop(5, 15, 2), loop(12, 20, 3)];

  it('loop 1 is in charge where they overlap, while it still has plays left', () => {
    const [l1, l2] = loops();
    expect(E.loopAt([l1, l2], 13, 100, 0.25)).toBe(l1);
    l1.done = 2; // played out
    expect(E.loopAt([l1, l2], 13, 100, 0.25)).toBe(l2);
  });

  it('"Next loop": loop 1 twice, then loop 2 from its own start, three times', () => {
    const r = run(loops(), { from: 5, after: 'next' });
    expect(r.played).toEqual([[5, 15], [5, 15], [12, 20], [12, 20], [12, 20]]);
    expect(r.finished).toBe(true);
  });

  it('"Play on": loop 1 twice, then playback carries on into loop 2', () => {
    const r = run(loops(), { from: 5 });
    expect(r.played).toEqual([[5, 15], [5, 20], [12, 20], [12, 20]]);
  });
});

describe('a loop inside another', () => {
  // Outer 0:00 → 1:00 ×2, inner 0:20 → 0:30 ×3.
  const loops = () => [loop(0, 60, 2), loop(20, 30, 3)];

  it('the inner loop is in charge inside it', () => {
    const [outer, inner] = loops();
    expect(E.loopAt([outer, inner], 25, 100, 0.25)).toBe(inner);
  });

  it('plays the inner loop, carries on in the outer one, then the outer one again', () => {
    for (const after of ['continue', 'next']) {
      const r = run(loops(), { from: 0, after });
      expect(r.played).toEqual([[0, 30], [20, 30], [20, 60], [0, 60]]);
    }
  });
});

describe('two loops ending at the same point', () => {
  it('counts the inner one first', () => {
    const r = run([loop(0, 30, 2), loop(20, 30, 2)], { from: 0 });
    expect(r.played).toEqual([[0, 30], [20, 30], [0, 30]]);
  });
});
