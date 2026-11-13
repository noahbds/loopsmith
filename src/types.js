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
 * @property {boolean} [skip]  skipped by the user in the current run (never saved)
 */

/**
 * Defaults for new loops.
 * @typedef {object} LoopDefaults
 * @property {number} count
 * @property {boolean} infinite
 */

/**
 * Result of one step of the loop engine.
 * @typedef {{ seek: number, repeat: Loop } | { seek: number, next: Loop } | { seek: number, restart: Loop } | { seek: number, prev: Loop } | { seek: number, goto: Loop } | { seek: number, carryOn: true } | { carryOn: true } | { finish: true } | null} Step
 */

export {};
