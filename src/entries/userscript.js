import { boot } from '../boot.js';
import { backend } from '../platform/userscript.js';
import { installMediaHook } from '../page/media-hook-core.js';

// The userscript starts at document-start so the media hook (out-of-page audio, plays inside
// shadow-DOM players) is in place before the site creates its player. Userscript managers usually
// run scripts in the page's own world, where the hook works; in an isolated world it has no effect.
try { installMediaHook(); } catch (_) { /* no effect here */ }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot(backend), { once: true });
else boot(backend);
