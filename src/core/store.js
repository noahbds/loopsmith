// Saved loops and preferences.
//
// Layout in the backend (extension storage), one key per item so that
// tabs never overwrite each other's entries:
//   "prefs"            { count, infinite, between, end, ... }
//   "m:<media key>"    { loops: [...], t: last change (ms), u?: last load (ms), title?: string, url?: string }
//   anything else      small bookkeeping values (e.g. "mig:v1")
//
// A backend is { getAll(): Promise<object>, get?(keys): Promise<object>, set(obj): Promise,
// remove(keys): Promise, onChange?(cb) } where cb receives { key: newValue | undefined }.

import { MAX_SAVED } from './constants.js';

/**
 * @typedef {object} Backend
 * @property {() => Promise<Record<string, any>>} getAll
 * @property {(keys: string[]) => Promise<Record<string, any>>} [get]
 * @property {(obj: Record<string, any>) => Promise<any>} set
 * @property {(keys: string[]) => Promise<any>} remove
 * @property {(cb: (changes: Record<string, any>) => void) => void} [onChange]
 */

/** @typedef {{ loops: any[], t?: number, u?: number, title?: string, url?: string }} Entry */

// An entry's last use: loaded or changed, whichever is later.
/** @param {Entry | undefined} e */
export const lastUse = (e) => Math.max((e && e.t) || 0, (e && e.u) || 0);

const PREFS = 'prefs';
const MEDIA = 'm:';
const MIG_V1 = 'mig:v1';
/** @param {unknown} x @returns {x is Record<string, any>} */
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * @param {Backend} backend
 * @param {{ maxSaved?: number, delay?: number, lazy?: boolean }} [opts]
 */
export function createStore(backend, { maxSaved = MAX_SAVED, delay = 300, lazy = false } = {}) {
  /** @type {Record<string, any>} */
  let prefs = {};
  /** @type {Map<string, Entry>} */
  const media = new Map();
  /** @type {Map<string, any>} */
  const meta = new Map();
  /** @type {Map<string, any>} */
  const pending = new Map(); // backend key -> value to write (undefined = remove)
  /** @type {Set<string>} */
  const loaded = new Set(); // media ids fetched in lazy mode
  let allLoaded = false;
  let listening = false;
  /** @type {Promise<void> | null} */
  let loadingAll = null;
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let timer = 0;
  /** @type {((keys: string[]) => void)[]} */
  const listeners = []; // told about changes made in other tabs
  /** @type {{ prune: ((n: number) => void)[], error: (() => void)[] }} */
  const events = { prune: [], error: [] };

  /** @param {string} key @param {any} value */
  function take(key, value) {
    if (key === PREFS) {
      prefs = isObj(value) ? value : {};
    } else if (key.startsWith(MEDIA)) {
      const id = key.slice(MEDIA.length);
      loaded.add(id);
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

  function bindChanges() {
    if (listening || !backend.onChange) return;
    listening = true;
    backend.onChange((changes) => {
      const keys = Object.keys(changes).filter((k) => !pending.has(k));
      for (const k of keys) take(k, changes[k]);
      if (keys.length) for (const cb of listeners) cb(keys);
    });
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

  // Drops the least recently used entries above the limit, and says how many went.
  function prune() {
    if (media.size <= maxSaved) return;
    const ids = [...media.keys()].sort((x, y) => lastUse(media.get(x)) - lastUse(media.get(y)));
    const gone = ids.slice(0, media.size - maxSaved);
    for (const id of gone) {
      media.delete(id);
      pending.set(MEDIA + id, undefined);
    }
    for (const cb of events.prune) cb(gone.length);
  }

  async function loadAll() {
    if (allLoaded) return;
    if (loadingAll) return loadingAll;
    loadingAll = (async () => {
      let all = {};
      try { all = (await backend.getAll()) || {}; } catch (_) { /* start clean */ }
      for (const [k, v] of Object.entries(all)) {
        if (!pending.has(k)) take(k, v);
      }
      allLoaded = true;
      loadingAll = null;
    })();
    return loadingAll;
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
    let wroteMedia = false;
    for (const [k, v] of pending) {
      if (v === undefined) gone.push(k);
      else {
        set[k] = v;
        if (k.startsWith(MEDIA)) wroteMedia = true;
      }
    }
    pending.clear();
    const jobs = [];
    // Storage full or unavailable: keep working from memory, and say so.
    const failed = () => { for (const cb of events.error) cb(); };
    try {
      if (Object.keys(set).length) jobs.push(backend.set(set));
      if (gone.length) jobs.push(backend.remove(gone));
    } catch (_) {
      failed();
    }
    // In lazy mode, load the full key set after writes settle so pruning can act if needed.
    return Promise.all(jobs).then(() => {
      if (wroteMedia && !allLoaded) {
        loadAll().then(() => { if (media.size > maxSaved) flush(); }, () => {});
      }
    }, failed);
  }

  return {
    async load() {
      if (lazy && backend.get) {
        let init = {};
        try { init = (await backend.get([PREFS, MIG_V1])) || {}; } catch (_) { /* start clean */ }
        for (const [k, v] of Object.entries(init)) take(k, v);
      } else {
        await loadAll();
      }
      bindChanges();
    },

    loadAll,

    // Ensures the given media ids have been fetched from storage (no-op when not in lazy mode).
    /** @param {string[]} ids */
    async ensure(ids) {
      if (allLoaded || !backend.get) return;
      const missing = ids.filter((id) => id && !loaded.has(id) && !media.has(id) && !pending.has(MEDIA + id));
      if (!missing.length) return;
      /** @type {Record<string, any>} */
      let got = {};
      try { got = (await backend.get(missing.map((id) => MEDIA + id))) || {}; } catch (_) { /* ignore */ }
      for (const id of missing) {
        const k = MEDIA + id;
        loaded.add(id);
        if (!pending.has(k) && Object.prototype.hasOwnProperty.call(got, k)) take(k, got[k]);
      }
    },

    /** @param {string} id */
    isLoaded: (id) => allLoaded || !backend.get || loaded.has(id) || media.has(id) || pending.has(MEDIA + id),

    /** @param {string} id */
    get: (id) => media.get(id) || null,
    /** @param {string} id */
    has: (id) => media.has(id),
    ids: () => [...media.keys()],

    // Non-empty saved entries, most recently used first (for the popup library).
    entries() {
      /** @type {{ id: string, entry: Entry }[]} */
      const out = [];
      for (const [id, entry] of media) {
        if (entry && Array.isArray(entry.loops) && entry.loops.length > 0) out.push({ id, entry });
      }
      out.sort((a, b) => lastUse(b.entry) - lastUse(a.entry));
      return out;
    },

    // entry = null removes it.
    /** @param {string} id @param {Entry | null} entry */
    put(id, entry) {
      loaded.add(id);
      if (entry) media.set(id, entry);
      else media.delete(id);
      queue(MEDIA + id, entry || undefined);
    },

    // The media's loops were just loaded: remember when (at most once an hour, to keep writes rare),
    // and backfill missing title/url on items saved before 1.7.
    /** @param {string} id @param {{ title?: string, url?: string }} [info] */
    touch(id, info) {
      const e = media.get(id);
      if (!e) return;
      const now = Date.now();
      const addTitle = !e.title && info && info.title ? info.title : '';
      const addUrl = !e.url && info && info.url ? info.url : '';
      const due = now - (e.u || 0) >= 3600e3;
      if (!due && !addTitle && !addUrl) return;
      /** @type {Entry} */
      const next = {
        ...e,
        ...(due ? { u: now } : {}),
        ...(addTitle ? { title: addTitle } : {}),
        ...(addUrl ? { url: addUrl } : {}),
      };
      media.set(id, next);
      queue(MEDIA + id, next);
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

    // Calls `cb(keys)` with the backend keys ("prefs", "m:<id>") that changed elsewhere.
    /** @param {(keys: string[]) => void} cb */
    subscribe(cb) {
      listeners.push(cb);
    },

    // 'prune': cb(number of entries removed). 'error': cb() when a write failed.
    /** @param {'prune' | 'error'} type @param {(n?: any) => void} cb */
    on(type, cb) {
      events[type].push(cb);
    },
  };
}

// Version 1 (YouTube Section Loop 1.x) kept everything in one localStorage entry on youtube.com
// ("ysl:v1", the YouTube adapter's legacyStoreKey):
// { prefs, videos: { <video id>: { loops, t } } }. Copies it over once; the old entry is left in
// place so an older copy of the script still installed somewhere keeps working.
const V1_DONE = MIG_V1;

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
