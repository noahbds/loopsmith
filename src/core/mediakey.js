// How media on an arbitrary page is recognised again on a later visit, and which of several media
// elements is the one the user cares about. Pure functions, unit-tested.

/**
 * @typedef {object} MediaLike
 * @property {boolean} isConnected
 * @property {boolean} muted
 * @property {boolean} loop
 * @property {boolean} autoplay
 * @property {number} duration
 * @property {boolean} paused
 * @property {boolean} controls
 */

/**
 * @typedef {{ left: number, top: number, right: number, bottom: number }} BoxRect
 */

// Query parameters that usually name the media itself. Everything else (tracking, time, …) is dropped.
const KEEP = new Set(['v', 'id', 'video', 'vid', 'videoid', 'video_id', 'episode', 'ep', 'lesson', 'lecture', 'track', 'item', 'clip', 'p']);

/**
 * "example.com/watch?id=42#634": the page, the parameters that identify the media, and the
 * rounded duration (several media on one page, or a page that swaps media, get different keys).
 * Local `file://` URLs are keyed by filename and duration so moving folders preserves loops.
 * @param {string} href
 * @param {number} duration
 * @returns {string | null}
 */
export function mediaKey(href, duration) {
  let u;
  try { u = new URL(href); } catch (_) { return null; }
  const dur = duration === Infinity ? 'live' : String(Math.round(duration));
  if (u.protocol === 'file:') {
    const raw = u.pathname.split('/').filter(Boolean).pop() || 'file';
    let name = raw;
    try { name = decodeURIComponent(raw); } catch (_) { /* keep raw */ }
    return `file/${name}#${dur}`;
  }
  const params = [];
  for (const [k, v] of u.searchParams) if (KEEP.has(k.toLowerCase()) && v) params.push(`${k}=${v}`);
  params.sort();
  const path = u.pathname.replace(/\/+$/, '') || '/';
  return `${u.hostname}${path}${params.length ? '?' + params.join('&') : ''}#${dur}`;
}

/**
 * Media that is only decoration: background loops, autoplaying muted previews.
 * @param {MediaLike} m
 */
export function decorative(m) {
  return (m.muted && m.loop && m.autoplay) || (m.duration > 0 && m.duration < 5);
}

/**
 * Visible area of a rect inside a viewport, in px².
 * @param {BoxRect} r
 * @param {number} vw
 * @param {number} vh
 */
export function visibleArea(r, vw, vh) {
  const w = Math.min(r.right, vw) - Math.max(r.left, 0);
  const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
  return w > 0 && h > 0 ? w * h : 0;
}

const MIN_VIDEO_AREA = 200 * 112;

/**
 * Picks the media element to attach to:
 *   1. the one currently attached, while looping is on or the panel is open (keep);
 *   2. the one the user played last;
 *   3. the largest visible, non-decorative video with a known duration;
 *   4. an audio element that is playing or shows its own controls.
 * @template {MediaLike} M
 * @param {{ m: M, rect: BoxRect, video: boolean }[]} items
 * @param {{ current?: M | null, keep?: boolean, lastPlayed?: M | null, vw: number, vh: number }} opts
 * @returns {M | null}
 */
export function pickMedia(items, { current = null, keep = false, lastPlayed = null, vw, vh }) {
  /** @param {M | null | undefined} m @returns {m is M} */
  const ok = (m) => !!m && m.isConnected && !decorative(m);
  if (keep && ok(current)) return current;
  if (ok(lastPlayed)) return lastPlayed;
  /** @type {M | null} */
  let best = null;
  let bestArea = 0;
  for (const it of items) {
    if (!it.video || !ok(it.m) || !(it.m.duration > 0)) continue;
    const a = visibleArea(it.rect, vw, vh);
    if (a > bestArea) {
      best = it.m;
      bestArea = a;
    }
  }
  if (best && bestArea >= MIN_VIDEO_AREA) return best;
  for (const it of items) {
    if (it.video || !ok(it.m) || !(it.m.duration > 0)) continue;
    if (!it.m.paused || it.m.controls) return it.m;
  }
  return ok(current) ? current : null;
}
