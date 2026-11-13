import { boot } from '../boot.js';
import { backend } from '../platform/userscript.js';
import { builtInFor } from '../sites.js';
import { installMediaHook } from '../page/media-hook-core.js';

// The userscript starts at document-start so the media hook (SoundCloud, Spotify…) is in place
// before the site creates its player. Userscript managers usually run scripts in the page's own
// world, where the hook works; in an isolated world it simply has no effect.
const site = builtInFor(location.hostname);
if (site && (site.pageWorld || []).some((f) => f.includes('media-hook'))) {
  try { installMediaHook(); } catch (_) { /* no effect here */ }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot(backend), { once: true });
else boot(backend);
