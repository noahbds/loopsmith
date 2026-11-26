// The loop rules as pure functions: no DOM, no player, no shared state. Everything the app does
// with loops goes through here, so this is the part covered by unit tests.
//
// A loop is { a, b, count, infinite, on, c, done }:
//   a, b      start and end, in seconds
//   count     how many times it plays (ignored when infinite)
//   on        false = switched off: kept and saved, never played
//   c         palette index
//   name      optional label, at most NAME_MAX characters
//   done      plays completed in the current run
//   skip      skipped by the user in the current run (runtime only, never saved)
//   turn      started or jumped to on purpose: has the turn while it plays (runtime only)
//   partial   the playhead came into it after its start, so the current play is not a whole one
//             and won't count (runtime only)

import { MIN_LEN, FINE_MIN_LEN, MAX_LOOPS, MAX_COUNT, NAME_MAX, PALETTE } from './constants.js';
import { clamp, roundT, isNum } from './util.js';

/** @typedef {import('../types.js').Loop} Loop */
/** @typedef {import('../types.js').LoopDefaults} LoopDefaults */
/** @typedef {import('../types.js').Step} Step */

/** @param {Loop} l */
export const exhausted = (l) => !l.infinite && l.done >= l.count;

// Loops the engine passes over: switched off, or played out in this run.
/** @param {Loop} l */
export const skipped = (l) => !l.on || !!l.skip || exhausted(l);

/** A loop that took part in this run and is over: played out, or skipped by the user. @param {Loop} l */
export const finished = (l) => !!l.skip || exhausted(l);

/** Every count starts over. @param {Loop[]} loops */
export function resetRun(loops) {
  for (const l of loops) {
    l.done = 0;
    l.skip = false;
    l.turn = false;
    l.partial = false;
  }
}

/**
 * Gives `loop` the turn (it was started or jumped to on purpose): it keeps it, even inside a loop
 * that starts earlier, until its plays are done.
 * @param {Loop[]} loops
 * @param {Loop} loop
 */
export function giveTurn(loops, loop) {
  for (const l of loops) l.turn = l === loop;
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {LoopDefaults} defaults
 * @returns {Loop}
 */
export function newLoop(a, b, c, defaults) {
  return { a, b, c, count: defaults.count, infinite: defaults.infinite, on: true, done: 0, skip: false, turn: false, partial: false };
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

// The loop whose turn it is at the playhead: of the loops it is in, the one that was started or
// jumped to on purpose (giveTurn), otherwise the one that started first (same start: the
// lower-numbered one). Only that loop turns playback around; a loop inside it, or one that
// overlaps its end, waits for its own turn and never cuts into it.
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
  for (const l of loops) {
    if (skipped(l) || t < l.a - 0.3 || t >= loopEnd(l, duration, guard)) continue;
    if (!best || (l.turn && !best.turn) || (!!l.turn === !!best.turn && l.a < best.a - 1e-6)) best = l;
  }
  return best;
}

// Play order: by start; loops that start together play in list order (lower number first).
/**
 * @param {Loop[]} loops
 * @param {Loop} x
 * @param {Loop} y
 */
function before(loops, x, y) {
  if (Math.abs(x.a - y.a) > 1e-6) return x.a < y.a;
  return loops.indexOf(x) < loops.indexOf(y);
}

/**
 * The loops in play order. A new array.
 * @param {Loop[]} loops
 */
export const playOrder = (loops) => [...loops].sort((x, y) => (x === y ? 0 : before(loops, x, y) ? -1 : 1));

/**
 * The loop that comes after `loop` in play order and still has plays left.
 * @param {Loop[]} loops
 * @param {Loop} loop
 * @returns {Loop | null}
 */
export function nextAfter(loops, loop) {
  /** @type {Loop | null} */
  let next = null;
  for (const l of loops) {
    if (l === loop || skipped(l) || !before(loops, loop, l)) continue;
    if (!next || before(loops, l, next)) next = l;
  }
  return next;
}

/**
 * The playhead just landed at `t` (a seek, or looping was turned on): a loop it lands in after
 * its start is only partly played this time round, so reaching its end won't count as a play.
 * A seek that stays inside the loop whose turn it was at `from` (where the playhead was before
 * it) is the user moving around in the section that is playing: that pass still counts (or still
 * doesn't, if it already didn't).
 * @param {Loop[]} loops
 * @param {number} t
 * @param {number} duration
 * @param {number} guard
 * @param {number | null} [from]
 */
export function enter(loops, t, duration, guard, from = null) {
  const playing = from === null ? null : loopAt(loops, from, duration, guard);
  for (const l of loops) {
    if (l === playing || t < l.a - 0.3 || t >= loopEnd(l, duration, guard)) continue;
    l.partial = t > l.a + LATE;
  }
}

// How far past its start the playhead can come into a loop and still play it whole.
const LATE = 0.75;

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

// Loops that start within this many seconds of where another ends count as joined.
const ADJACENT = 0.15;

/**
 * What happens once a loop's turn is over:
 *   - the next loop in play order starts inside it (nested, or overlapping its end): play that one
 *     from its start, whatever the "between loops" setting;
 *   - otherwise "Next loop" jumps to the next one, and "Play on" keeps playing;
 *   - nothing left: finish.
 * @param {Loop[]} loops
 * @param {Loop} done the loop that just finished
 * @param {number} doneEnd where it turned around
 * @param {number} t playhead
 * @param {{ duration: number, guard: number, after?: string }} opts
 * @returns {Step}
 */
function settle(loops, done, doneEnd, t, { duration, guard, after = 'continue' }) {
  const next = nextAfter(loops, done);
  if (next) {
    // A loop that starts right where the finished one ends is already playing: seeking to its
    // start would only cut the sound for a moment.
    if (Math.abs(next.a - doneEnd) <= ADJACENT) return carryOn(loops, t, duration, guard);
    if (next.a < doneEnd || after === 'next') {
      giveTurn(loops, next);
      next.partial = false;
      return { seek: next.a, next };
    }
  }
  return anyAhead(loops, t, duration, guard) ? carryOn(loops, t, duration, guard) : { finish: true };
}

// Playback carries on from `t`: a loop it is already inside was entered after its start.
/**
 * @param {Loop[]} loops
 * @param {number} t
 * @param {number} duration
 * @param {number} guard
 * @returns {Step}
 */
function carryOn(loops, t, duration, guard) {
  enter(loops, t, duration, guard);
  return { carryOn: true };
}

// One step of the loop engine, for forward playback from `prev` to `t`. When playback just ran
// into the end of the loop whose turn it is (see loopAt), counts a play and says what to do:
//   null                      nothing happened (the end of any other loop is passed over)
//   { seek, repeat: loop }    go back to the start of `loop` (it has plays left)
//   { seek, restart: loop }   it was only partly played (entered after its start): back to its
//                             start, no play counted
//   { seek, next: loop }      its turn is over: the next loop plays from its start
//   { carryOn: true }         its turn is over, others remain: keep playing
//   { finish: true }          nothing left to play
// The next loop is the one after it in play order (see settle), even when it lies inside it or
// overlaps it and playback is already past its start: it is played from its own start.
/**
 * @param {Loop[]} loops
 * @param {number} prev
 * @param {number} t
 * @param {{ duration: number, guard: number, after?: string }} opts
 * @returns {Step}
 */
export function advance(loops, prev, t, opts) {
  // Playing into a loop through its start: this play is a whole one.
  for (const x of loops) if (x.partial && prev < x.a && t >= x.a) x.partial = false;
  const l = loopAt(loops, prev, opts.duration, opts.guard);
  if (!l) return null;
  const end = loopEnd(l, opts.duration, opts.guard);
  if (t < end) return null;
  if (l.partial) {
    l.partial = false;
    return { seek: l.a, restart: l };
  }
  l.done += 1;
  if (!exhausted(l)) return { seek: l.a, repeat: l };
  return settle(loops, l, end, t, opts);
}

/**
 * Restart the repetition the playhead is in: back to its start, no play counted.
 * @param {Loop | null} target
 * @returns {Step}
 */
export function restartRep(target) {
  if (!target) return null;
  target.partial = false;
  return { seek: target.a, restart: target };
}

/**
 * Skip the rest of the repetition the playhead is in: it counts as played. With plays left, go
 * back to the start; if it was the last one, apply the "when done" rule from the loop's end.
 * An endless loop can't be played out: skipping a repetition just starts the next one.
 * @param {Loop[]} loops
 * @param {Loop | null} target
 * @param {{ duration: number, guard: number, after?: string }} opts
 * @returns {Step}
 */
export function skipRep(loops, target, opts) {
  if (!target) return null;
  target.done += 1;
  if (!exhausted(target)) {
    target.partial = false;
    return { seek: target.a, repeat: target };
  }
  const end = loopEnd(target, opts.duration, opts.guard);
  const step = settle(loops, target, end, end, opts);
  // Carrying on from the middle of a repetition that was skipped: carry on from its end.
  return step && 'carryOn' in step && !('seek' in step) ? { seek: end, carryOn: true } : step;
}

/**
 * Skip the rest of the loop the playhead is in (or the gap before the next one): its remaining
 * plays are dropped for this run, and playback jumps to the next loop's start. If no loop starts
 * later but one still surrounds the skipped loop, playback carries on from the skipped loop's end.
 * @param {Loop[]} loops
 * @param {Loop | null} target loop in charge at the playhead, or null between loops
 * @param {number} t playhead
 * @param {{ duration: number, guard: number }} opts
 * @returns {Step}
 */
export function skipLoop(loops, target, t, opts) {
  if (target) target.skip = true;
  const next = target ? nextAfter(loops, target) : nextLoop(loops, t);
  if (next) {
    giveTurn(loops, next);
    next.partial = false;
    return { seek: next.a, next };
  }
  const end = target ? loopEnd(target, opts.duration, opts.guard) : t;
  if (anyAhead(loops, end, opts.duration, opts.guard)) return { seek: end, carryOn: true };
  return { finish: true };
}

/**
 * The "previous" button, as on a music player: more than `restartAfter` seconds into the
 * repetition it restarts it; otherwise it goes back to the loop that starts before this one (or
 * before the playhead, between loops), playing it afresh. Nothing before: restart.
 * @param {Loop[]} loops
 * @param {Loop | null} target
 * @param {number} t playhead
 * @param {number} [restartAfter]
 * @returns {Step}
 */
export function prevLoop(loops, target, t, restartAfter = 2) {
  if (target && t - target.a > restartAfter) return { seek: target.a, restart: target };
  /** @type {Loop | null} */
  let prev = null;
  for (const l of loops) {
    if (!l.on || l === target) continue;
    const earlier = target ? before(loops, l, target) : l.a < t - 1e-6;
    if (earlier && (!prev || before(loops, prev, l))) prev = l;
  }
  if (!prev) return target ? { seek: target.a, restart: target } : null;
  prev.skip = false;
  prev.done = 0;
  prev.partial = false;
  giveTurn(loops, prev);
  return { seek: prev.a, prev };
}

/**
 * Another round: every count starts over and playback goes back to the first loop that is
 * switched on. Null when no loop is on (then there is nothing to play again).
 * @param {Loop[]} loops
 * @returns {Loop | null}
 */
export function restartSet(loops) {
  resetRun(loops);
  /** @type {Loop | null} */
  let first = null;
  for (const l of loops) if (l.on && (!first || l.a < first.a)) first = l;
  return first;
}

/**
 * Jump to a given loop and play it afresh, whatever it did before in this run. It has the turn.
 * @param {Loop | undefined} loop
 * @param {Loop[]} [loops]
 * @returns {Step}
 */
export function gotoLoop(loop, loops = []) {
  if (!loop) return null;
  loop.on = true;
  loop.skip = false;
  loop.done = 0;
  loop.partial = false;
  giveTurn(loops, loop);
  loop.turn = true;
  return { seek: loop.a, goto: loop };
}

/**
 * Moves one end of a loop. push=true: the other end moves out of the way. push=false: this end
 * stops against it. `digits` is how finely times are kept (1 = tenths, 2 = hundredths).
 * @param {Loop} l
 * @param {'a' | 'b'} which
 * @param {number} value
 * @param {boolean} push
 * @param {number} duration
 * @param {number} [digits]
 * @returns {{ a: number, b: number }}
 */
export function movePoint(l, which, value, push, duration, digits = 1) {
  const d = duration;
  const minLen = digits > 1 ? FINE_MIN_LEN : MIN_LEN;
  let a = l.a;
  let b = l.b;
  const len = Math.max(minLen, b - a);
  if (which === 'a') {
    a = clamp(roundT(value, digits), 0, d - minLen);
    if (a > b - minLen) {
      if (push) b = Math.min(d, a + len);
      else a = b - minLen;
    }
  } else {
    b = roundT(value, digits);
    if (b > d - 0.1) b = d;
    b = clamp(b, minLen, d);
    if (b < a + minLen) {
      if (push) a = Math.max(0, b - len);
      else b = Math.min(d, a + minLen);
    }
  }
  return { a: roundT(a, digits), b: roundT(b, digits) };
}

/**
 * Moves the whole loop so it starts at `start`, keeping its length; it stops at the ends of the media.
 * @param {Loop} l
 * @param {number} start
 * @param {number} duration
 * @param {number} [digits]
 * @returns {{ a: number, b: number }}
 */
export function moveLoop(l, start, duration, digits = 1) {
  const len = l.b - l.a;
  const a = clamp(roundT(start, digits), 0, Math.max(0, duration - len));
  const b = Math.min(duration, roundT(a + len, digits));
  return { a, b };
}

/**
 * Shifts a loop backward (`dir = -1`) or forward (`dir = 1`) by its own length.
 * @param {Loop} l
 * @param {-1 | 1} dir
 * @param {number} duration
 * @param {number} [digits]
 * @returns {{ a: number, b: number }}
 */
export function shiftLoop(l, dir, duration, digits = 1) {
  return moveLoop(l, l.a + dir * (l.b - l.a), duration, digits);
}

/**
 * Scales a loop's length by `factor` (e.g. 0.5 to halve, 2 to double), anchored at `a` unless
 * the end of the media pushes `a` earlier so the scaled length fits.
 * @param {Loop} l
 * @param {number} factor
 * @param {number} duration
 * @param {number} [digits]
 * @returns {{ a: number, b: number }}
 */
export function scaleLoop(l, factor, duration, digits = 1) {
  const minLen = digits > 1 ? FINE_MIN_LEN : MIN_LEN;
  const len = clamp(roundT((l.b - l.a) * factor, digits), Math.min(minLen, duration), duration);
  const a = clamp(roundT(Math.min(l.a, duration - len), digits), 0, Math.max(0, duration - len));
  const b = Math.min(duration, roundT(a + len, digits));
  return { a, b };
}

/**
 * Largest forward playhead advance (in seconds) between two checks that still counts as continuous
 * playback rather than an unannounced seek. In hidden tabs, browser timer throttling can space
 * checks several seconds apart while audio keeps playing.
 * @param {number} rate
 * @param {number} elapsedMs
 * @param {boolean} [hidden]
 */
export function maxAdvance(rate, elapsedMs, hidden = false) {
  const r = rate > 0 ? rate : 1;
  const base = Math.max(2, r * 2);
  if (!hidden || !(elapsedMs > 0)) return base;
  const sec = Math.min(120, elapsedMs / 1000);
  return Math.max(base, sec * r + 2);
}

/**
 * The loops in play order (by start; the shorter first when they start together). A new array.
 * @param {Loop[]} loops
 */
export const sortedByStart = (loops) => [...loops].sort((x, y) => x.a - y.a || x.b - y.b);

/**
 * @param {Loop[]} loops
 * @param {number} duration
 */
export function clampLoops(loops, duration) {
  for (const l of loops) {
    const min = Math.min(MIN_LEN, Math.max(FINE_MIN_LEN, l.b - l.a)); // a short loop made in fine mode stays short
    l.b = clamp(l.b, min, duration);
    l.a = clamp(l.a, 0, l.b - min);
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
  return loops.map((l) => ({ a: l.a, b: l.b, n: l.count, inf: l.infinite, on: l.on, c: l.c, ...(l.name ? { name: l.name } : {}) }));
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
    if (typeof r.name === 'string' && r.name.trim()) l.name = r.name.trim().slice(0, NAME_MAX);
    out.push(l);
    if (out.length >= MAX_LOOPS) break;
  }
  return out.length ? out : null;
}
