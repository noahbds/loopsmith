// Page-world entry for the media hook (see media-hook-core.js) and the "next track" hook
// (media-session-core.js).
import { installMediaHook } from './media-hook-core.js';
import { installNextHook } from './media-session-core.js';

installMediaHook();
installNextHook();
