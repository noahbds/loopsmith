// Speed per loop, the speed ramp, and the gap / count-in settings. Pure, unit-tested.

import { clamp, isNum } from './util.js';

export const MIN_RATE = 0.25;
export const MAX_RATE = 2;
export const RATE_STEP = 0.05;
export const MAX_GAP = 5; // seconds
export const MAX_COUNT_IN = 8; // seconds

/** A playback speed: a multiple of 0.05 between 25% and 200%. @param {number} x */
export const clampRate = (x) => clamp(Math.round(x / RATE_STEP) * RATE_STEP, MIN_RATE, MAX_RATE);

/** "75%". @param {number} rate */
export const rateText = (rate) => `${Math.round(rate * 100)}%`;

/**
 * @typedef {object} Ramp
 * @property {boolean} on
 * @property {number} step    percentage points added each time (5 = 5%)
 * @property {number} every   repetitions between steps
 * @property {number} target  the speed it stops at, in percent
 */

/** @returns {Ramp} */
export const defaultRamp = () => ({ on: false, step: 5, every: 3, target: 100 });

/**
 * Reads a stored ramp, fixing whatever is out of range.
 * @param {any} raw
 * @returns {Ramp}
 */
export function readRamp(raw) {
  const d = defaultRamp();
  if (!raw || typeof raw !== 'object') return d;
  return {
    on: raw.on === true,
    step: isNum(raw.step) ? clamp(Math.round(raw.step), 1, 50) : d.step,
    every: isNum(raw.every) ? clamp(Math.round(raw.every), 1, 99) : d.every,
    target: isNum(raw.target) ? clamp(Math.round(raw.target), 25, 200) : d.target,
  };
}

/**
 * The speed a loop should play at in its current repetition, or null to leave the player's speed
 * alone (the loop has no speed of its own and the ramp is off). `done` is how many repetitions of
 * the loop are finished; with the ramp on, the speed goes up by `step` after every `every` of them,
 * from the loop's own speed (100% when it has none) towards `target`, and never past it.
 * @param {{ rate?: number | null, done: number }} loop
 * @param {Ramp} ramp
 * @returns {number | null}
 */
export function rateFor(loop, ramp) {
  const own = isNum(loop.rate) ? loop.rate : null;
  if (!ramp.on) return own == null ? null : clampRate(own);
  const base = own == null ? 1 : own;
  const goal = ramp.target / 100;
  if (base >= goal) return clampRate(base);
  const steps = Math.floor(loop.done / ramp.every);
  return clampRate(Math.min(goal, base + (steps * ramp.step) / 100));
}
