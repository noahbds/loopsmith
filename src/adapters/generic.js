// Any page with an HTML5 <video> or <audio>: course sites, embeds (Video.js, JW Player, Wistia…),
// Plex/Jellyfin, news sites, self-hosted media. There's no site control bar to join, so the app
// runs in floating mode: a small loop button over the video (or docked bottom-right for audio),
// with the loop markers along the bottom of the video.
//
// Media inside open shadow roots (web-component players) is found too. Media that isn't in the
// page at all is brought in by the page-world hook (src/page/media-hook-core.js), which also
// announces every play() with a composed event the content script can see across shadow roots.

import { mediaKey, pickMedia } from '../core/mediakey.js';
import { allMedia, mediaOf, PLAY_EVENT } from '../core/deepmedia.js';
import { findProgressBar } from '../core/findbar.js';

let lastPlayed = null;
let current = null;
const bar = { media: null, el: null, at: 0 };

function snapshot() {
  const items = [];
  for (const m of allMedia()) {
    items.push({ m, video: m.tagName === 'VIDEO', rect: m.getBoundingClientRect() });
  }
  return items;
}

export default {
  id: 'generic',
  keyPrefix: 'web',
  floating: true,

  shouldRun: () => true,

  // The user playing something is the strongest hint of what they want to loop.
  init(changed) {
    // Something may already be playing (the play that woke Loopsmith up came before this listener).
    for (const m of allMedia()) if (!m.paused) lastPlayed = m;
    const onPlay = (e) => {
      const m = mediaOf(e);
      if (!m || m === lastPlayed) return;
      lastPlayed = m;
      changed();
    };
    document.addEventListener('play', onPlay, true);
    document.addEventListener(PLAY_EVENT, onPlay, true);
    document.addEventListener('loadedmetadata', (e) => { if (e.target instanceof HTMLMediaElement && !current) changed(); }, true);
  },

  // The "player" is the media element itself.
  findPlayer(keep) {
    current = pickMedia(snapshot(), { current, keep, lastPlayed, vw: innerWidth, vh: innerHeight });
    return current;
  },
  findMedia: (p) => p,
  isAd: () => false,

  // Engaged: the user played it. Only then do the Shift hotkeys act on this page.
  engaged: (p) => !!p && p === lastPlayed,

  identify(p) {
    const d = p.duration;
    if (!(d > 0)) return { hold: true }; // the key needs the duration
    return { id: mediaKey(location.href, d), live: d === Infinity };
  },

  controlsTop: () => null,

  // The site's own seek bar, found by looking (re-checked every 2 s: players build controls late).
  progressBar(p) {
    const now = Date.now();
    if (p !== bar.media || (bar.el && !bar.el.isConnected) || now - bar.at > 2000) {
      bar.media = p;
      bar.el = findProgressBar(p);
      bar.at = now;
    }
    return bar.el;
  },
  navEvents: [],
};
