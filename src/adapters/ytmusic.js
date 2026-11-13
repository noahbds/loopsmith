// YouTube Music: the same player as YouTube (#movie_player, getVideoData, ads), but the video area
// is often hidden behind the album art and the controls live in a bar at the bottom of the window.
// Runs docked bottom-right, above that bar, with the loop markers drawn over its progress bar.
// Loops are shared with YouTube (same video ids).
//
// YouTube Music moves on to the next track in the queue slightly before the real end, and doesn't
// always notice seeks made on the <video> element behind its back. So loops turn around well
// before the end of the track, and seeks go through the player's own seekTo().

import youtube from './youtube.js';

function seekViaPlayer(t) {
  const root = document.documentElement;
  root.removeAttribute('data-ysl-seek-done');
  root.setAttribute('data-ysl-seek', String(t));
  document.dispatchEvent(new CustomEvent('ysl:yt-seek'));
  const done = root.hasAttribute('data-ysl-seek-done');
  root.removeAttribute('data-ysl-seek-done');
  root.removeAttribute('data-ysl-seek');
  return done;
}

export default {
  ...youtube,
  id: 'ytmusic',
  legacyStoreKey: undefined, // version 1 never ran here
  floating: true,
  dockOnly: true,
  dockInset: 72, // ytmusic-player-bar
  endGuard: 1.5,
  engaged: () => true,
  findPlayer: () => document.getElementById('movie_player'),
  buttonHost: undefined,
  progressBar: () => document.querySelector('ytmusic-player-bar #progress-bar #progressContainer') || document.querySelector('ytmusic-player-bar #progress-bar'),
  controlsTop: () => null,

  seek(v, t) {
    if (!seekViaPlayer(t)) v.currentTime = t; // no page-world helper answered: seek the element
  },
};
