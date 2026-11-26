// Shareable loop links (#loopsmith=...). Pure functions, no network requests.
//
// Format in the URL hash:
//   #loopsmith=12.5-24x4:Intro%20riff,30-45*
// Each item is `<a-sec>-<b-sec>` followed by `x<count>` or `*` (forever), optional `!` (switched
// off), and optional `:<url-encoded name>`.

import { loopsFromSaved } from './engine.js';
import { roundT } from './util.js';

/** @typedef {import('../types.js').Loop} Loop */
/** @typedef {import('../types.js').LoopDefaults} LoopDefaults */

const PARAM = 'loopsmith=';
const ITEM_RE = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(?:x(\d+)|(\*))?(!)?(?::(.*))?$/;

/**
 * Encodes loops as a `loopsmith=...` hash parameter (without `#`). Empty string when no loops.
 * @param {Loop[]} loops
 */
export function encodeShareHash(loops) {
  if (!Array.isArray(loops) || !loops.length) return '';
  const parts = loops.map((l) => {
    const a = roundT(l.a, 2);
    const b = roundT(l.b, 2);
    const rep = l.infinite ? '*' : `x${l.count}`;
    const off = l.on === false ? '!' : '';
    const name = l.name ? ':' + encodeURIComponent(l.name) : '';
    return `${a}-${b}${rep}${off}${name}`;
  });
  return PARAM + parts.join(',');
}

/**
 * Reads loops out of a URL hash (`#loopsmith=...` or `#t=10&loopsmith=...`). Null when absent or invalid.
 * @param {string} hash
 * @param {LoopDefaults} [defaults]
 * @returns {Loop[] | null}
 */
export function parseShareHash(hash, defaults = { count: 5, infinite: false }) {
  if (typeof hash !== 'string' || !hash.includes(PARAM)) return null;
  const clean = hash.replace(/^#/, '');
  const seg = clean.split('&').find((p) => p.startsWith(PARAM));
  if (!seg) return null;
  const body = seg.slice(PARAM.length).trim();
  if (!body) return null;

  const raw = [];
  for (const token of body.split(',')) {
    const m = ITEM_RE.exec(token.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    const inf = m[4] === '*';
    const n = m[3] ? Number(m[3]) : defaults.count;
    const on = m[5] !== '!';
    let name = '';
    if (m[6]) {
      try { name = decodeURIComponent(m[6]); } catch (_) { name = m[6]; }
    }
    raw.push({ a, b, n, inf, on, c: raw.length, ...(name ? { name } : {}) });
  }
  return loopsFromSaved({ loops: raw }, defaults);
}

/**
 * Removes any `loopsmith=...` parameter from a URL's fragment so stored URLs stay clean.
 * @param {string} href
 */
export function stripShareHash(href) {
  let u;
  try { u = new URL(href); } catch (_) { return href; }
  if (!u.hash || !u.hash.includes(PARAM)) return u.toString();
  const kept = u.hash.replace(/^#/, '').split('&').filter((p) => p && !p.startsWith(PARAM));
  u.hash = kept.length ? '#' + kept.join('&') : '';
  return u.toString();
}

/**
 * Builds a shareable URL with a native start-time parameter (where supported) plus `#loopsmith=...`.
 * @param {string} href
 * @param {Loop[]} loops
 * @param {string} [adapterId]
 */
export function buildShareUrl(href, loops, adapterId = '') {
  const param = encodeShareHash(loops);
  if (!param) return href;
  let u;
  try { u = new URL(stripShareHash(href)); } catch (_) { return href; }

  const first = loops.find((l) => l.on) || loops[0];
  const startSec = first ? Math.max(0, Math.floor(first.a)) : 0;
  if ((adapterId === 'youtube' || adapterId === 'ytmusic') && u.pathname === '/watch') {
    if (startSec > 0) u.searchParams.set('t', `${startSec}s`);
    else u.searchParams.delete('t');
  } else if (adapterId === 'twitch' && /^\/videos\//.test(u.pathname)) {
    if (startSec > 0) u.searchParams.set('t', `${startSec}s`);
  }

  const existing = u.hash.replace(/^#/, '').trim();
  u.hash = existing ? `#${existing}&${param}` : `#${param}`;
  return u.toString();
}
