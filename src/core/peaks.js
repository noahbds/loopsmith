// What has been heard of a piece of audio, as loudness per slice of time, for drawing a waveform.
// Built while the media plays (nothing is fetched or decoded), so only the parts that have been
// played are known. Pure, unit-tested.

import { clamp } from './util.js';

export const PER_SECOND = 20; // slices per second of media
export const MAX_SECONDS = 12 * 3600;

/**
 * @param {number} duration seconds
 * @param {number} [perSecond]
 */
export function createPeaks(duration, perSecond = PER_SECOND) {
  const n = Math.ceil(Math.min(duration, MAX_SECONDS) * perSecond) + 1;
  // 0 = not heard yet; 1..255 = heard, with that loudness (1 is silence)
  const data = new Uint8Array(n);

  return {
    duration,
    perSecond,
    data,

    /**
     * Notes that `level` (0..1) was heard between the times t0 and t1.
     * @param {number} t0
     * @param {number} t1
     * @param {number} level
     */
    add(t0, t1, level) {
      const v = 1 + Math.round(clamp(level, 0, 1) * 254);
      const lo = clamp(Math.floor(Math.min(t0, t1) * perSecond), 0, n - 1);
      const hi = clamp(Math.max(lo, Math.ceil(Math.max(t0, t1) * perSecond) - 1), 0, n - 1);
      for (let i = lo; i <= hi; i++) if (data[i] < v) data[i] = v;
    },

    /**
     * The loudest level in each of `count` equal parts of the window v0..v1: 0..1, or -1 where
     * nothing has been heard.
     * @param {number} v0
     * @param {number} v1
     * @param {number} count
     * @returns {Float32Array}
     */
    columns(v0, v1, count) {
      const out = new Float32Array(count).fill(-1);
      const span = v1 - v0;
      if (!(span > 0) || count < 1) return out;
      for (let c = 0; c < count; c++) {
        const a = clamp(Math.floor((v0 + (c / count) * span) * perSecond), 0, n - 1);
        const b = clamp(Math.max(a, Math.ceil((v0 + ((c + 1) / count) * span) * perSecond) - 1), 0, n - 1);
        let m = 0;
        for (let i = a; i <= b; i++) if (data[i] > m) m = data[i];
        if (m) out[c] = (m - 1) / 254;
      }
      return out;
    },

    /** Share of the media heard so far, 0..1. */
    heard() {
      let k = 0;
      for (let i = 0; i < n; i++) if (data[i]) k++;
      return k / n;
    },
  };
}
