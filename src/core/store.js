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

const PREFS = 'prefs';
const MEDIA = 'm:';
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

export function createStore(backend, { maxSaved = MAX_SAVED, delay = 300 } = {}) {
  let prefs = {};
  const media = new Map();
  const meta = new Map();
  const pending = new Map(); // backend key -> value to write (undefined = remove)
  let timer = 0;

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
      if (!mine || (value.t || 0) >= (mine.t || 0)) media.set(id, value);
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

  function queue(key, value) {
    pending.set(key, value);
    if (delay) schedule();
  }

  // Drops the oldest entries above the limit.
  function prune() {
    if (media.size <= maxSaved) return;
    const ids = [...media.keys()].sort((x, y) => (media.get(x).t || 0) - (media.get(y).t || 0));
    for (const id of ids.slice(0, media.size - maxSaved)) {
      media.delete(id);
      pending.set(MEDIA + id, undefined);
    }
  }

  function flush() {
    clearTimeout(timer);
    timer = 0;
    prune();
    if (!pending.size) return Promise.resolve();
    const set = {};
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

    get: (id) => media.get(id) || null,
    has: (id) => media.has(id),
    ids: () => [...media.keys()],

    // entry = null removes it.
    put(id, entry) {
      if (entry) media.set(id, entry);
      else media.delete(id);
      queue(MEDIA + id, entry || undefined);
    },

    getPrefs: () => prefs,
    setPrefs(p) {
      prefs = p;
      queue(PREFS, p);
    },

    getMeta: (k) => meta.get(k),
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
