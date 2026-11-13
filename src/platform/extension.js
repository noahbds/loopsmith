// Storage backend for the browser extension (Firefox and Chrome): extension storage is shared by
// every site, so loops saved on one site are visible everywhere, and it survives clearing site data.

const api = globalThis.browser || globalThis.chrome;
const local = api.storage.local;

export const backend = {
  getAll: () => local.get(null),
  set: (obj) => local.set(obj),
  remove: (keys) => local.remove(keys),
  onChange(cb) {
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const out = {};
      for (const [k, c] of Object.entries(changes)) out[k] = c.newValue;
      cb(out);
    });
  },
};
