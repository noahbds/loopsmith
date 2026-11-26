// SoundCloud: a single-page app whose audio is never put in the page (src/page/media-hook.js moves
// it into a hidden box). Loops are saved per track, read from the "now playing" bar at the bottom,
// since the page you're on often isn't the track that plays.

import generic from './generic.js';
import { press } from './press.js';

function trackPath() {
  const a = document.querySelector('.playbackSoundBadge__titleLink');
  const href = a && a.getAttribute('href');
  return href ? href.split('?')[0] : null;
}

export default {
  ...generic,
  id: 'soundcloud',
  keyPrefix: 'sc',
  shouldRun: () => window.top === window.self,
  dockOnly: true,
  dockInset: 56, // the player bar
  progressBar: () => document.querySelector('.playbackTimeline__progressBackground'),
  nextTrack: () => press('.playControls__elements .playControls__next'),
  // After shuffle and repeat, before the timeline.
  barSlot() {
    const t = document.querySelector('.playControls__elements > .playControls__timeline');
    return t ? { host: t.parentElement, before: t } : null;
  },
  // Its icons are images: the button takes the colour of its clock (light or dark theme).
  barTint: () => document.querySelector('.playbackTimeline__duration'),
  engaged: () => true,
  waitingText: 'Press play to load the track, then set your loops.',

  identify(p) {
    const d = p.duration;
    const track = trackPath();
    if (!(d > 0) || !track) return { hold: true };
    return { id: track, live: d === Infinity };
  },
};
