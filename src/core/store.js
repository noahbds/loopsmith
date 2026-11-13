// Saved loops and preferences.
//
// Layout in the backend (extension storage), one key per item so that
// tabs never overwrite each other's entries:
//   "prefs"            { count, infinite, after }
//   "m:<media key>"    { loops: [...], t: last change (ms), title?, url? }   e.g. "m:yt:dQw4w9WgXcQ"
//   anything else      small bookkeeping values (e.g. "mig:v1")
//
// A backend is { getAll(): Promise<object>, set(obj): Promise, remove(keys): Promise,
// onChange?(cb) } where cb receives { key: newValue | undefined }.

import { MAX_SAVED } from './constants.js';

/**
 * @typedef {object} Backend
 * @property {() => Promise<Record<string, any>>} getAll
 * @property {(obj: Record<string, any>) => Promise<any>} set
 * @property {(keys: string[]) => Promise<any>} remove
 * @property {(cb: (changes: Record<string, any>) => void) => void} [onChange]
 */

/** @typedef {{ loops: any[], t?: number, title?: string, url?: string }} Entry */


const PREFS = 'prefs';
const MEDIA = 'm:';
/** @param {unknown} x @returns {x is Record<string, any>} */
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * @param {Backend} backend
 * @param {{ maxSaved?: number, delay?: number }} [opts]
 */
export function createStore(backend, { maxSaved = MAX_SAVED, delay = 300 } = {}) {
  /** @type {Record<string, any>} */
  let prefs = {};
  /** @type {Map<string, Entry>} */
  const media = new Map();
  /** @type {Map<string, any>} */
  const meta = new Map();
  /** @type {Map<string, any>} */
  const pending = new Map(); // backend key -> value to write (undefined = remove)
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let timer = 0;

  /** @param {string} key @param {any} value */
  function take(key, value) {
    if (key === PREFS) {
      prefs = isObj(value) ? value : {};
    } else if (key.startsWith(MEDIA)) {
      const id = key.slice(MEDIA.length);
      if (!isObj(value)) {
        media.delete(id);
        return;
      }
      // An echo of an older write must not replace something newer made here meanwhile.
      const mine = media.get(id);
      if (!mine || (value.t || 0) >= (mine.t || 0)) media.set(id, /** @type {Entry} */ (value));
    } else if (value === undefined) {
      meta.delete(key);
    } else {
      meta.set(key, value);
    }
  }

  function schedule() {
    if (timer || !delay) return;
    timer = setTimeout(flush, delay);
  }

  /** @param {string} key @param {any} value */
  function queue(key, value) {
    pending.set(key, value);
    if (delay) schedule();
  }

  // Drops the oldest entries above the limit.
  function prune() {
    if (media.size <= maxSaved) return;
    const ids = [...media.keys()].sort((x, y) => ((media.get(x) || {}).t || 0) - ((media.get(y) || {}).t || 0));
    for (const id of ids.slice(0, media.size - maxSaved)) {
      media.delete(id);
      pending.set(MEDIA + id, undefined);
    }
  }

  function flush() {
    if (timer) clearTimeout(timer);
    timer = 0;
    prune();
    if (!pending.size) return Promise.resolve();
    /** @type {Record<string, any>} */
    const set = {};
    /** @type {string[]} */
    const gone = [];
    for (const [k, v] of pending) {
      if (v === undefined) gone.push(k);
      else set[k] = v;
    }
    pending.clear();
    const jobs = [];
    try {
      if (Object.keys(set).length) jobs.push(backend.set(set));
      if (gone.length) jobs.push(backend.remove(gone));
    } catch (_) { /* storage unavailable: keep working from memory */ }
    return Promise.all(jobs).then(() => {}, () => {});
  }

  return {
    async load() {
      let all = {};
      try { all = (await backend.getAll()) || {}; } catch (_) { /* start clean */ }
      for (const [k, v] of Object.entries(all)) take(k, v);
      if (backend.onChange) {
        backend.onChange((changes) => {
          for (const [k, v] of Object.entries(changes)) if (!pending.has(k)) take(k, v);
        });
      }
    },

    /** @param {string} id */
    get: (id) => media.get(id) || null,
    /** @param {string} id */
    has: (id) => media.has(id),
    ids: () => [...media.keys()],

    // entry = null removes it.
    /** @param {string} id @param {Entry | null} entry */
    put(id, entry) {
      if (entry) media.set(id, entry);
      else media.delete(id);
      queue(MEDIA + id, entry || undefined);
    },

    getPrefs: () => prefs,
    /** @param {Record<string, any>} p */
    setPrefs(p) {
      prefs = p;
      queue(PREFS, p);
    },

    /** @param {string} k */
    getMeta: (k) => meta.get(k),
    /** @param {string} k @param {any} v */
    setMeta(k, v) {
      meta.set(k, v);
      queue(k, v);
    },

    flush,
  };
}

// Version 1 (YouTube Section Loop 1.x) kept everything in one localStorage entry on youtube.com:
// { prefs, videos: { <video id>: { loops, t } } }. Copies it over once; the old entry is left in
// place so an older copy of the script still installed somewhere keeps working.
export const V1_KEY = 'ysl:v1';
const V1_DONE = 'mig:v1';

/**
 * @param {ReturnType<typeof createStore>} store
 * @param {any} raw
 * @param {string} [prefix]
 */
export function migrateV1(store, raw, prefix = 'yt') {
  if (store.getMeta(V1_DONE)) return 0;
  let copied = 0;
  if (isObj(raw)) {
    if (isObj(raw.videos)) {
      for (const [id, entry] of Object.entries(raw.videos)) {
        const key = `${prefix}:${id}`;
        if (!isObj(entry) || !Array.isArray(entry.loops) || store.has(key)) continue;
        store.put(key, { loops: entry.loops, t: Number(entry.t) || 0 });
        copied++;
      }
    }
    if (isObj(raw.prefs) && !Object.keys(store.getPrefs()).length) store.setPrefs(raw.prefs);
  }
  store.setMeta(V1_DONE, Date.now());
  return copied;
}
