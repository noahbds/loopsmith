// Test-only build of Loopsmith for local test pages: the real app (src/boot.js) with the media hook,
// storing in the page's localStorage instead of extension storage. Bundled by run.mjs.
import { boot } from '../../src/boot.js';
import { installMediaHook } from '../../src/page/media-hook-core.js';

const PREFIX = 'loopsmith-test:';
const backend = {
  async getAll() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
    }
    return out;
  },
  async set(obj) { for (const [k, v] of Object.entries(obj)) localStorage.setItem(PREFIX + k, JSON.stringify(v)); },
  async remove(keys) { for (const k of keys) localStorage.removeItem(PREFIX + k); },
};

installMediaHook(); // injected at document start, in the page world, like the extension's hook
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot(backend), { once: true });
else boot(backend);
