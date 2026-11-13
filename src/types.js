// Shared JSDoc types (no runtime code). Imported with `@typedef {import('../types.js').Loop}`.

/**
 * One loop of a media item.
 * @typedef {object} Loop
 * @property {number} a        start, seconds
 * @property {number} b        end, seconds
 * @property {number} count    how many times it plays (ignored when infinite)
 * @property {boolean} infinite
 * @property {boolean} on      false = switched off: kept and saved, never played
 * @property {number} c        palette index
 * @property {number} done     plays completed in the current run
 * @property {string} [name]   optional label
 * @property {number} [rate]   playback speed for this loop; absent = leave the speed alone
 * @property {boolean} [skip]  skipped by the user in the current run (never saved)
 */

/**
 * Defaults for new loops.
 * @typedef {object} LoopDefaults
 * @property {number} count
 * @property {boolean} infinite
 * @property {number | null} [rate]
 */

/**
 * Result of one step of the loop engine.
 * @typedef {{ seek: number, repeat: Loop } | { seek: number, next: Loop } | { seek: number, restart: Loop } | { seek: number, prev: Loop } | { seek: number, goto: Loop } | { seek: number, carryOn: true } | { carryOn: true } | { finish: true } | null} Step
 */

export {};
