// YouTube Music: the same player as YouTube (#movie_player, getVideoData, ads), but the video area
// is often hidden behind the album art and the controls live in a bar at the bottom of the window.
// Runs docked bottom-right, above that bar, with the loop markers drawn over its progress bar.
// Loops are shared with YouTube (same video ids).
//
// YouTube Music moves on to the next track in the queue slightly before the real end, and doesn't
// always notice seeks made on the <video> element behind its back. So loops turn around well
// before the end of the track, and seeks go through the player's own seekTo().

import youtube from './youtube.js';
import { press } from './press.js';

function seekViaPlayer(t) {
  const root = document.documentElement;
  root.removeAttribute('data-lsm-seek-done');
  root.setAttribute('data-lsm-seek', String(t));
  document.dispatchEvent(new CustomEvent('lsm:yt-seek'));
  const done = root.hasAttribute('data-lsm-seek-done');
  root.removeAttribute('data-lsm-seek-done');
  root.removeAttribute('data-lsm-seek');
  return done;
}

export default {
  ...youtube,
  id: 'ytmusic',
  floating: true,
  dockOnly: true,
  dockInset: 72, // ytmusic-player-bar
  endGuard: 1.5,
  // Not inherited: the old store only exists on youtube.com, and running the one-time migration
  // here would mark it done (the flag is shared) before youtube.com could copy anything.
  legacyStoreKey: undefined,
  engaged: () => true,
  buttonHost: undefined,
  // The bottom bar was redesigned in 2026 (ytmusic-miniplayer); the old one is kept as a fallback.
  progressBar: () => document.querySelector('ytmusic-miniplayer .ytMusicMiniPlayerProgressBar')
    || document.querySelector('ytmusic-player-bar #progress-bar #progressContainer')
    || document.querySelector('ytmusic-player-bar #progress-bar'),
  controlsTop: () => null,
  nextTrack: () => youtube.nextTrack() || press('ytmusic-player-bar .next-button button') || press('ytmusic-player-bar .next-button'),
  // Before the like / dislike buttons: the one group of the bottom bar that never collapses.
  barSlot() {
    const g = document.querySelector('ytmusic-player-bar .middle-controls-buttons');
    return g ? { host: g, before: g.firstChild } : null;
  },

  seek(v, t) {
    if (!seekViaPlayer(t)) v.currentTime = t; // no page-world helper answered: seek the element
  },

  mediaUrl(_p, videoId) {
    return videoId && videoId.startsWith('yt:') ? `https://music.youtube.com/watch?v=${videoId.slice(3)}` : '';
  },
};
