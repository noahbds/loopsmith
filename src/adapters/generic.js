// Any page with an HTML5 <video> or <audio>: course sites, embeds (Video.js, JW Player, Wistia…),
// Plex/Jellyfin, news sites, self-hosted media. There's no site control bar to join, so the app
// runs in floating mode: a small loop button over the video (or docked bottom-right for audio),
// and the loop markers live in the panel only.
//
// Not covered yet: media inside shadow roots and media that isn't in the DOM (SoundCloud);
// see docs/MULTI_SITE_PLAN.md, phases 2 and 3.

import { mediaKey, pickMedia } from '../core/mediakey.js';

let lastPlayed = null;
let current = null;

function snapshot() {
  const items = [];
  for (const m of document.querySelectorAll('video, audio')) {
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
    for (const m of document.querySelectorAll('video, audio')) if (!m.paused) lastPlayed = m;
    const onPlay = (e) => {
      const m = e.target;
      if (!(m instanceof HTMLMediaElement) || m === lastPlayed) return;
      lastPlayed = m;
      changed();
    };
    document.addEventListener('play', onPlay, true);
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
  navEvents: [],
};
