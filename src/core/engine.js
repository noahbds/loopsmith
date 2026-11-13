// The loop rules as pure functions: no DOM, no player, no shared state. Everything the app does
// with loops goes through here, so this is the part covered by unit tests.
//
// A loop is { a, b, count, infinite, on, c, done }:
//   a, b      start and end, in seconds
//   count     how many times it plays (ignored when infinite)
//   on        false = switched off: kept and saved, never played
//   c         palette index
//   done      plays completed in the current run

import { MIN_LEN, MAX_LOOPS, MAX_COUNT, PALETTE } from './constants.js';
import { clamp, round1, isNum } from './util.js';

/** @typedef {import('../types.js').Loop} Loop */
/** @typedef {import('../types.js').LoopDefaults} LoopDefaults */
/** @typedef {import('../types.js').Step} Step */

/** @param {Loop} l */
export const exhausted = (l) => !l.infinite && l.done >= l.count;

// Loops the engine passes over: switched off, or played out in this run.
/** @param {Loop} l */
export const skipped = (l) => !l.on || exhausted(l);

/**
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {LoopDefaults} defaults
 * @returns {Loop}
 */
export function newLoop(a, b, c, defaults) {
  return { a, b, c, count: defaults.count, infinite: defaults.infinite, on: true, done: 0 };
}

// A single loop covering the whole media is the untouched default: nothing worth saving or marking.
/**
 * @param {Loop[]} loops
 * @param {number} duration
 */
export function isDefaultSet(loops, duration) {
  return loops.length === 1 && loops[0].a <= 0.001 && loops[0].b >= duration - 0.05;
}

// Where a loop really turns around. A loop that runs to the end of the media turns `guard`
// seconds early, so the player never reaches "ended" (which would trigger autoplay).
/**
 * @param {Loop} l
 * @param {number} duration
 * @param {number} guard
 */
export function loopEnd(l, duration, guard) {
  return Math.max(l.a + 0.2, Math.min(l.b, duration - guard));
}

// The loop in charge at the playhead: of the loops it is in, the one whose turn-around point comes
// first, since that is the one that will send playback back (an inner loop inside an outer one;
// the earlier of two loops that overlap partly). Same end: the one that starts later.
/**
 * @param {Loop[]} loops
 * @param {number} t
 * @param {number} duration
 * @param {number} guard
 * @returns {Loop | null}
 */
export function loopAt(loops, t, duration, guard) {
  /** @type {Loop | null} */
  let best = null;
  let bestEnd = Infinity;
  for (const l of loops) {
    if (skipped(l)) continue;
    const end = loopEnd(l, duration, guard);
    if (t < l.a - 0.3 || t >= end) continue;
    if (!best || end < bestEnd - 1e-6 || (Math.abs(end - bestEnd) <= 1e-6 && l.a > best.a)) {
      best = l;
      bestEnd = end;
    }
  }
  return best;
}

// The closest loop that starts after `t` and still has plays left.
/**
 * @param {Loop[]} loops
 * @param {number} t
 * @returns {Loop | null}
 */
export function nextLoop(loops, t) {
  /** @type {Loop | null} */
  let next = null;
  for (const l of loops) if (!skipped(l) && l.a > t && (!next || l.a < next.a)) next = l;
  return next;
}

// Loops whose end playback ran into between `prev` and `t` (forward playback only), or null.
/**
 * @param {Loop[]} loops
 * @param {number} prev
 * @param {number} t
 * @param {number} duration
 * @param {number} guard
 * @returns {Loop[] | null}
 */
export function crossedLoops(loops, prev, t, duration, guard) {
  /** @type {Loop[] | null} */
  let crossed = null;
  for (const l of loops) {
    if (skipped(l)) continue;
    const end = loopEnd(l, duration, guard);
    if (prev < end && t >= end) (crossed || (crossed = [])).push(l);
  }
  return crossed;
}

// Whether any playable loop still ends after `t`.
/**
 * @param {Loop[]} loops
 * @param {number} t
 * @param {number} duration
 * @param {number} guard
 */
export function anyAhead(loops, t, duration, guard) {
  return loops.some((l) => !skipped(l) && loopEnd(l, duration, guard) > t);
}

// Counts one play for each loop that just ended and returns the loop to go back to: the first
// one (inner loops first) that still has plays left. Null when they have all played out.
/**
 * @param {Loop[]} crossed
 * @returns {Loop | null}
 */
export function countCrossed(crossed) {
  crossed.sort((x, y) => y.a - x.a);
  for (const l of crossed) {
    l.done += 1;
    if (!exhausted(l)) return l;
  }
  return null;
}

// One step of the loop engine, for forward playback from `prev` to `t`. Counts the plays of the
// loops whose end was just reached and says what to do:
//   null                      nothing happened
//   { seek, repeat: loop }    go back to the start of `loop` (it has plays left)
//   { seek, next: loop }      "Next loop": the loops just played out; jump to the next one's start
//   { carryOn: true }         those loops are done, others remain: keep playing
//   { finish: true }          nothing left to play
// "Next loop" means the loop that starts after the one(s) just finished, even when it overlaps
// them and playback is already inside it: it is played from its own start.
/**
 * @param {Loop[]} loops
 * @param {number} prev
 * @param {number} t
 * @param {{ duration: number, guard: number, after?: string }} opts
 * @returns {Step}
 */
export function advance(loops, prev, t, { duration, guard, after = 'continue' }) {
  const crossed = crossedLoops(loops, prev, t, duration, guard);
  if (!crossed) return null;
  const finishedA = Math.max(...crossed.map((l) => l.a));
  const back = countCrossed(crossed);
  if (back) return { seek: back.a, repeat: back };
  if (!anyAhead(loops, t, duration, guard)) return { finish: true };
  if (after === 'next') {
    /** @type {Loop | null} */
    let next = null;
    for (const l of loops) if (!skipped(l) && l.a > finishedA && (!next || l.a < next.a)) next = l;
    if (next) return { seek: next.a, next };
    // Only a loop around the finished one is left: carry on inside it.
  }
  return { carryOn: true };
}

// Moves one end of a loop. push=true: the other end moves out of the way.
// push=false: this end stops against the other one. Returns the new { a, b }.
/**
 * @param {Loop} l
 * @param {'a' | 'b'} which
 * @param {number} value
 * @param {boolean} push
 * @param {number} duration
 * @returns {{ a: number, b: number }}
 */
export function movePoint(l, which, value, push, duration) {
  const d = duration;
  let a = l.a;
  let b = l.b;
  const len = Math.max(MIN_LEN, b - a);
  if (which === 'a') {
    a = clamp(round1(value), 0, d - MIN_LEN);
    if (a > b - MIN_LEN) {
      if (push) b = Math.min(d, a + len);
      else a = b - MIN_LEN;
    }
  } else {
    b = round1(value);
    if (b > d - 0.1) b = d;
    b = clamp(b, MIN_LEN, d);
    if (b < a + MIN_LEN) {
      if (push) a = Math.max(0, b - len);
      else b = Math.min(d, a + MIN_LEN);
    }
  }
  return { a, b };
}

// Keeps every loop inside [0, duration] and at least MIN_LEN long.
/**
 * @param {Loop[]} loops
 * @param {number} duration
 */
export function clampLoops(loops, duration) {
  for (const l of loops) {
    l.b = clamp(l.b, MIN_LEN, duration);
    l.a = clamp(l.a, 0, l.b - MIN_LEN);
  }
}

// Loops that overlap in time are drawn on separate rows.
/**
 * @param {Loop[]} loops
 * @returns {number[]}
 */
export function lanesOf(loops) {
  const order = loops.map((_, i) => i).sort((x, y) => loops[x].a - loops[y].a);
  /** @type {number[]} */
  const ends = [];
  const out = new Array(loops.length).fill(0);
  for (const i of order) {
    let k = ends.findIndex((e) => e <= loops[i].a);
    if (k < 0) k = ends.length;
    ends[k] = loops[i].b;
    out[i] = k;
  }
  return out;
}

// The stored form of a set of loops.
/** @param {Loop[]} loops */
export function serializeLoops(loops) {
  return loops.map((l) => ({ a: l.a, b: l.b, n: l.count, inf: l.infinite, on: l.on, c: l.c }));
}

// Reads a stored entry back into loops, dropping anything malformed. Null when nothing usable.
/**
 * @param {any} saved
 * @param {LoopDefaults} defaults
 * @returns {Loop[] | null}
 */
export function loopsFromSaved(saved, defaults) {
  if (!saved || !Array.isArray(saved.loops)) return null;
  /** @type {Loop[]} */
  const out = [];
  for (const r of saved.loops) {
    if (!r || !isNum(r.a) || !isNum(r.b) || !(r.b > r.a) || r.a < 0) continue;
    const l = newLoop(r.a, r.b, Number.isInteger(r.c) ? clamp(r.c, 0, PALETTE.length - 1) : out.length % PALETTE.length, defaults);
    if (isNum(r.n) && r.n >= 1) l.count = clamp(Math.round(r.n), 1, MAX_COUNT);
    if (typeof r.inf === 'boolean') l.infinite = r.inf;
    if (typeof r.on === 'boolean') l.on = r.on;
    out.push(l);
    if (out.length >= MAX_LOOPS) break;
  }
  return out.length ? out : null;
}
