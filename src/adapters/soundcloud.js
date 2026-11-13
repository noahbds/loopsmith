// SoundCloud: a single-page app whose audio is never put in the page (src/page/media-hook.js moves
// it into a hidden box). Loops are saved per track, read from the "now playing" bar at the bottom,
// since the page you're on often isn't the track that plays.

import generic from './generic.js';

function trackPath() {
  const a = document.querySelector('.playbackSoundBadge__titleLink');
  const href = a && a.getAttribute('href');
  return href ? href.split('?')[0] : null;
}

export default {
  ...generic,
  id: 'soundcloud',
  keyPrefix: 'sc',
  dockOnly: true,
  dockInset: 56, // the player bar
  progressBar: () => document.querySelector('.playbackTimeline__progressBackground'),
  engaged: () => true,

  // The media playing (or last played) in the hidden box.
  findPlayer(keep) {
    return generic.findPlayer(keep);
  },

  identify(p) {
    const d = p.duration;
    const track = trackPath();
    if (!(d > 0) || !track) return { hold: true };
    return { id: track, live: d === Infinity };
  },
};
