// Chapter helpers: normalising chapter lists, finding the chapter at the playhead, and snap edges.

import { MIN_LEN } from './constants.js';
import { clamp, isNum, roundT } from './util.js';

/**
 * @typedef {{ a: number, b: number, title: string }} Chapter
 */

/**
 * Turns raw `{ a, b?, title? }` markers into ordered, non-empty chapters spanning up to `duration`.
 * @param {{ a: number, b?: number, title?: string }[]} raw
 * @param {number} duration
 * @returns {Chapter[]}
 */
export function normalizeChapters(raw, duration) {
  if (!Array.isArray(raw) || !raw.length || !(duration > 0)) return [];
  const sorted = raw
    .filter((c) => c && isNum(c.a) && c.a >= 0 && c.a < duration - MIN_LEN)
    .map((c) => ({ a: roundT(clamp(c.a, 0, duration), 2), b: isNum(c.b) ? roundT(clamp(c.b, 0, duration), 2) : -1, title: typeof c.title === 'string' ? c.title.trim().slice(0, 60) : '' }))
    .sort((x, y) => x.a - y.a);

  /** @type {Chapter[]} */
  const dedup = [];
  for (const c of sorted) {
    if (dedup.length && Math.abs(c.a - dedup[dedup.length - 1].a) < 0.25) continue;
    dedup.push({ a: c.a, b: c.b, title: c.title });
  }
  for (let i = 0; i < dedup.length; i++) {
    const nextA = i + 1 < dedup.length ? dedup[i + 1].a : duration;
    if (!(dedup[i].b > dedup[i].a)) dedup[i].b = roundT(nextA, 2);
    else dedup[i].b = roundT(Math.min(dedup[i].b, nextA), 2);
  }
  return dedup.filter((c) => c.b - c.a >= MIN_LEN);
}

/**
 * The chapter containing playback position `t`, or null.
 * @param {Chapter[]} chapters
 * @param {number} t
 * @returns {Chapter | null}
 */
export function chapterAt(chapters, t) {
  if (!chapters.length || !isNum(t)) return null;
  for (let i = chapters.length - 1; i >= 0; i--) {
    const c = chapters[i];
    if (t >= c.a - 0.05 && t <= c.b + 0.05) return c;
  }
  return null;
}

/**
 * Unique boundary times from a list of chapters, for slider handle snapping.
 * @param {Chapter[]} chapters
 * @returns {number[]}
 */
export function chapterEdges(chapters) {
  /** @type {Set<number>} */
  const set = new Set();
  for (const c of chapters) {
    set.add(c.a);
    set.add(c.b);
  }
  return [...set];
}

/**
 * Reads chapters from standard HTML5 `<track kind="chapters">` cues on a media element.
 * @param {HTMLMediaElement | null} media
 * @param {number} duration
 * @returns {Chapter[]}
 */
export function mediaTrackChapters(media, duration) {
  if (!media || !media.textTracks || !(duration > 0)) return [];
  /** @type {{ a: number, b: number, title: string }[]} */
  const raw = [];
  try {
    for (let i = 0; i < media.textTracks.length; i++) {
      const tr = media.textTracks[i];
      if (tr.kind !== 'chapters' || !tr.cues) continue;
      for (let j = 0; j < tr.cues.length; j++) {
        const cue = /** @type {any} */ (tr.cues[j]);
        if (isNum(cue.startTime) && isNum(cue.endTime) && cue.endTime > cue.startTime) {
          raw.push({ a: cue.startTime, b: cue.endTime, title: String(cue.text || '') });
        }
      }
    }
  } catch (_) { /* ignore inaccessible tracks */ }
  return normalizeChapters(raw, duration);
}
