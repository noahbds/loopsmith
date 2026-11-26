// Exporting and importing saved loops as JSON. Pure functions, validated through loopsFromSaved.

import { loopsFromSaved, serializeLoops } from './engine.js';
import { isNum } from './util.js';

/** @typedef {import('../types.js').LoopDefaults} LoopDefaults */
/** @typedef {import('./store.js').Entry} Entry */

const TITLE_MAX = 140;
const URL_MAX = 500;
const KEY_MAX = 300;

/** @param {unknown} x @returns {x is Record<string, any>} */
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/** @param {unknown} raw */
export function cleanTitle(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/^\s*(?:\(\d+\)\s*|[▶►🔊]\s*)+/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TITLE_MAX);
}

/** @param {unknown} raw */
export function cleanUrl(raw) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim().slice(0, URL_MAX);
  return /^(https?|file):\/\//i.test(s) ? s : '';
}

/**
 * Builds a portable JSON backup object from a loaded store.
 * @param {ReturnType<typeof import('./store.js').createStore>} store
 * @param {string} [extVersion]
 */
export function exportBackup(store, extVersion = '') {
  const defaults = { count: 5, infinite: false };
  /** @type {Record<string, Entry>} */
  const items = {};
  for (const { id, entry } of store.entries()) {
    const valid = loopsFromSaved(entry, defaults);
    if (!valid) continue;
    /** @type {Entry} */
    const out = { loops: serializeLoops(valid), t: isNum(entry.t) && entry.t > 0 ? Math.round(entry.t) : Date.now() };
    if (isNum(entry.u) && entry.u > 0) out.u = Math.round(entry.u);
    const title = cleanTitle(entry.title);
    const url = cleanUrl(entry.url);
    if (title) out.title = title;
    if (url) out.url = url;
    items[id] = out;
  }
  return {
    app: 'loopsmith',
    version: 1,
    exportedAt: Date.now(),
    ...(extVersion ? { extVersion } : {}),
    prefs: { ...store.getPrefs() },
    items,
  };
}

/**
 * Validates and merges a parsed JSON backup into `store`. Newer local entries are kept.
 * @param {ReturnType<typeof import('./store.js').createStore>} store
 * @param {unknown} raw
 * @param {LoopDefaults} [defaults]
 * @returns {{ ok: true, imported: number, updated: number, skipped: number } | { ok: false, error: string }}
 */
export function importBackup(store, raw, defaults = { count: 5, infinite: false }) {
  if (!isObj(raw)) return { ok: false, error: 'Not a valid Loopsmith backup file.' };
  const map = isObj(raw.items) ? raw.items : null;
  if (!map) return { ok: false, error: 'Backup has no items list.' };

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const now = Date.now();

  for (const [id, item] of Object.entries(map)) {
    const key = String(id).trim();
    if (!key || key.length > KEY_MAX || !isObj(item)) {
      skipped++;
      continue;
    }
    const loops = loopsFromSaved(item, defaults);
    if (!loops) {
      skipped++;
      continue;
    }
    const t = isNum(item.t) && item.t > 0 ? Math.round(item.t) : now;
    const existing = store.get(key);
    const hasExisting = existing && Array.isArray(existing.loops) && existing.loops.length > 0;
    if (hasExisting && (existing.t || 0) >= t) {
      skipped++;
      continue;
    }
    /** @type {Entry} */
    const clean = { loops: serializeLoops(loops), t };
    if (isNum(item.u) && item.u > 0) clean.u = Math.round(item.u);
    const title = cleanTitle(item.title) || cleanTitle(existing && existing.title);
    const url = cleanUrl(item.url) || cleanUrl(existing && existing.url);
    if (title) clean.title = title;
    if (url) clean.url = url;
    store.put(key, clean);
    if (hasExisting) updated++;
    else imported++;
  }

  if (isObj(raw.prefs) && !Object.keys(store.getPrefs()).length) {
    store.setPrefs({ ...raw.prefs });
  }

  return { ok: true, imported, updated, skipped };
}

/**
 * Human-readable site label from a saved media key ("yt:abc" -> "YouTube", "web:example.com/..." -> "example.com").
 * @param {string} id
 */
export function siteLabelOf(id) {
  const colon = id.indexOf(':');
  const prefix = colon > 0 ? id.slice(0, colon) : '';
  const rest = colon > 0 ? id.slice(colon + 1) : id;
  switch (prefix) {
    case 'yt': return 'YouTube';
    case 'sp': return 'Spotify';
    case 'sc': return 'SoundCloud';
    case 'am': return 'Apple Music';
    case 'dz': return 'Deezer';
    case 'td': return 'Tidal';
    case 'az': return 'Amazon Music';
    default: break;
  }
  if (rest.startsWith('bilibili:')) return 'Bilibili';
  if (rest.startsWith('dailymotion:')) return 'Dailymotion';
  if (rest.startsWith('vimeo:')) return 'Vimeo';
  if (rest.startsWith('file/')) return 'Local file';
  const slash = rest.indexOf('/');
  const hash = rest.indexOf('#');
  const end = slash >= 0 ? slash : hash >= 0 ? hash : rest.length;
  const host = rest.slice(0, end).replace(/^www\./, '');
  if (host.endsWith('bandcamp.com')) return 'Bandcamp';
  if (host === 'vimeo.com' || host === 'player.vimeo.com') return 'Vimeo';
  if (host === 'twitch.tv' || host === 'clips.twitch.tv') return 'Twitch';
  return host || 'Web';
}

/**
 * Best-effort URL for opening a saved entry when `entry.url` wasn't stored yet (items saved before 1.7).
 * @param {string} id
 * @param {Entry} [entry]
 */
export function entryUrlOf(id, entry) {
  if (entry && entry.url && /^(https?|file):\/\//i.test(entry.url)) return entry.url;
  if (id.startsWith('yt:')) return `https://www.youtube.com/watch?v=${encodeURIComponent(id.slice(3))}`;
  if (id.startsWith('sp:')) {
    const sub = id.slice(3);
    if (sub.startsWith('ep:')) return `https://open.spotify.com/episode/${encodeURIComponent(sub.slice(3))}`;
    if (!sub.startsWith('t:')) return `https://open.spotify.com/track/${encodeURIComponent(sub)}`;
    return 'https://open.spotify.com/';
  }
  if (id.startsWith('sc:')) return `https://soundcloud.com${id.slice(3).startsWith('/') ? '' : '/'}${id.slice(3)}`;
  if (id.startsWith('web:bilibili:')) return `https://www.bilibili.com/video/${id.slice('web:bilibili:'.length)}`;
  if (id.startsWith('web:dailymotion:')) return `https://www.dailymotion.com/video/${id.slice('web:dailymotion:'.length)}`;
  if (id.startsWith('web:vimeo:')) return `https://vimeo.com/${id.slice('web:vimeo:'.length)}`;
  if (id.startsWith('web:') && !id.startsWith('web:file/')) {
    const raw = id.slice(4).split('|')[0].split('#')[0];
    if (raw && raw.includes('.')) return `https://${raw}`;
  }
  return '';
}
