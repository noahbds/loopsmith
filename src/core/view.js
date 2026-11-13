// The slider's window onto the media (zoom and pan), snapping, and which loops are neighbours.
// Pure functions, unit-tested.

import { clamp } from './util.js';

/** @typedef {import('../types.js').Loop} Loop */

export const MIN_VIEW = 2; // the narrowest window, in seconds

/** Whether the window shows the whole media. @param {number} v0 @param {number} v1 @param {number} duration */
export const isFull = (v0, v1, duration) => v0 <= 0.05 && v1 >= duration - 0.05;

/**
 * A window around a loop, with room on both sides.
 * @param {Loop} l
 * @param {number} duration
 * @returns {{ v0: number, v1: number }}
 */
export function fitLoop(l, duration) {
  const pad = Math.max((l.b - l.a) * 0.4, 3);
  return {
    v0: Math.max(0, Math.floor((l.a - pad) * 10) / 10),
    v1: Math.min(duration, Math.ceil((l.b + pad) * 10) / 10),
  };
}

/**
 * Zooms the window by `factor` (above 1 zooms in) keeping the time `anchor` where it is on screen.
 * @param {{ v0: number, v1: number }} view
 * @param {number} duration
 * @param {number} factor
 * @param {number} anchor
 * @returns {{ v0: number, v1: number }}
 */
export function zoomAt({ v0, v1 }, duration, factor, anchor) {
  const span = v1 - v0;
  const next = clamp(span / factor, Math.min(MIN_VIEW, duration), duration);
  const f = span > 0 ? clamp((anchor - v0) / span, 0, 1) : 0.5;
  const nv0 = clamp(anchor - f * next, 0, duration - next);
  return { v0: nv0, v1: nv0 + next };
}

/**
 * Slides the window by `dt` seconds, keeping its width.
 * @param {{ v0: number, v1: number }} view
 * @param {number} duration
 * @param {number} dt
 * @returns {{ v0: number, v1: number }}
 */
export function panBy({ v0, v1 }, duration, dt) {
  const span = v1 - v0;
  const nv0 = clamp(v0 + dt, 0, Math.max(0, duration - span));
  return { v0: nv0, v1: nv0 + span };
}

/**
 * Puts the time `t` in the middle of the window (as far as the media allows).
 * @param {{ v0: number, v1: number }} view
 * @param {number} duration
 * @param {number} t
 */
export function centerOn({ v0, v1 }, duration, t) {
  return panBy({ v0, v1 }, duration, t - (v0 + v1) / 2);
}

/**
 * The start and end of every loop except `skip` (an index): where a dragged edge can snap to.
 * @param {Loop[]} loops
 * @param {number} skip
 * @returns {number[]}
 */
export function edgesOf(loops, skip) {
  const out = [];
  loops.forEach((l, i) => {
    if (i === skip) return;
    out.push(l.a, l.b);
  });
  return out;
}

/**
 * The candidate closest to `value`, if it is within `threshold`; otherwise null.
 * @param {number} value
 * @param {number[]} candidates
 * @param {number} threshold
 * @returns {number | null}
 */
export function snapTo(value, candidates, threshold) {
  let best = null;
  let bestD = threshold;
  for (const c of candidates) {
    const d = Math.abs(c - value);
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/**
 * Where to start a loop of length `len` so that either of its edges lands on a candidate. Null when
 * neither edge is within `threshold` of one.
 * @param {number} start
 * @param {number} len
 * @param {number[]} candidates
 * @param {number} threshold
 * @returns {number | null}
 */
export function snapWhole(start, len, candidates, threshold) {
  const a = snapTo(start, candidates, threshold);
  const b = snapTo(start + len, candidates, threshold);
  if (a == null && b == null) return null;
  if (a == null) return /** @type {number} */ (b) - len;
  if (b == null) return a;
  return Math.abs(a - start) <= Math.abs(b - (start + len)) ? a : b - len;
}

/**
 * The loops just before and after loops[i] in play order (by start; ties by list order).
 * @param {Loop[]} loops
 * @param {number} i
 * @returns {{ prev: Loop | null, next: Loop | null }}
 */
export function neighbours(loops, i) {
  const me = loops[i];
  /** @type {Loop | null} */
  let prev = null;
  /** @type {Loop | null} */
  let next = null;
  loops.forEach((l, j) => {
    if (j === i) return;
    const before = l.a < me.a || (l.a === me.a && j < i);
    if (before && (!prev || l.a > prev.a || (l.a === prev.a && l.b > prev.b))) prev = l;
    if (!before && (!next || l.a < next.a)) next = l;
  });
  return { prev, next };
}
