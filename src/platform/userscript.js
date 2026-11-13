/* global GM_getValue, GM_setValue, GM_deleteValue, GM_listValues */
// Storage backend for the userscript. Tampermonkey / Violentmonkey storage is shared by every site
// the script runs on. Without it (e.g. the bundle pasted into a console), falls back to this
// site's localStorage under a prefix.

const hasGM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function'
  && typeof GM_deleteValue === 'function' && typeof GM_listValues === 'function';

const PREFIX = 'loopsmith:';

const gm = {
  async getAll() {
    const out = {};
    for (const k of GM_listValues()) out[k] = GM_getValue(k);
    return out;
  },
  async set(obj) {
    for (const [k, v] of Object.entries(obj)) GM_setValue(k, v);
  },
  async remove(keys) {
    for (const k of keys) GM_deleteValue(k);
  },
};

const local = {
  async getAll() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      try { out[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)); } catch (_) { /* skip corrupt */ }
    }
    return out;
  },
  async set(obj) {
    for (const [k, v] of Object.entries(obj)) localStorage.setItem(PREFIX + k, JSON.stringify(v));
  },
  async remove(keys) {
    for (const k of keys) localStorage.removeItem(PREFIX + k);
  },
};

export const backend = hasGM ? gm : local;
