// Everything that is specific to YouTube. The app only talks to the site through an adapter.
//
// Adapter contract:
//   id, keyPrefix        name, and the prefix of saved-loop keys ("yt" -> "yt:<video id>")
//   legacyStoreKey       optional localStorage key of a pre-2.0 store to migrate from
//   shouldRun()          false in frames that never hold a player worth attaching to
//   findPlayer()         element that contains the media; the panel and toast are mounted in it
//   findMedia(player)    the HTMLMediaElement to control
//   isAd(player)         an ad is playing in place of the real media
//   identify(player, ad) { hold } while unsure which media is loaded, otherwise { id, live }
//   buttonHost(player)   where the toolbar button goes; buttonClass: extra class for it
//   barSlot(player)      floating adapters: { host, before } in the site's control bar where the
//                        loop button goes (styled by .lsm-bar-<id>), or null to float it
//   barTint()            optional: element whose text colour the in-bar button takes
//   nextTrack(player)    optional: press the site's next button; false if there is none to press
//   progressBar(player)  where loop markers are drawn, or null
//   controlsTop(player)  top edge (px, viewport) of the player's bottom controls, or null
//   navEvents            extra document events after which the player must be re-checked

import { press } from './press.js';

const ANSWER = 'data-lsm-yt';

// In Chrome the page's own JS (player.getVideoData) is only reachable from a script running in
// the page world (src/page/youtube.js). It answers synchronously through a DOM attribute.
function askPage() {
  const root = document.documentElement;
  root.removeAttribute(ANSWER);
  document.dispatchEvent(new CustomEvent('lsm:yt-ask'));
  if (!root.hasAttribute(ANSWER)) return undefined; // no page-world helper here
  const raw = root.getAttribute(ANSWER);
  root.removeAttribute(ANSWER);
  try { return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
}

// What the player itself says is loaded. Without the page-world helper: Firefox content scripts
// reach the page's own methods through wrappedJSObject.
function apiData(p) {
  const fromPage = askPage();
  if (fromPage !== undefined) return fromPage;
  try {
    const raw = (p && p.wrappedJSObject) || p;
    if (raw && typeof raw.getVideoData === 'function') {
      const d = raw.getVideoData();
      if (d) return { id: d.video_id ? String(d.video_id) : null, live: d.isLive === true };
    }
  } catch (_) { /* player not initialised yet */ }
  return null;
}

function idFromUrl() {
  if (/^\/embed\//.test(location.pathname)) return null; // embedded playlists change video without changing URL
  if (location.pathname === '/watch') return new URLSearchParams(location.search).get('v') || null;
  const m = /^\/(?:live|shorts)\/([\w-]{6,})/.exec(location.pathname);
  return m ? m[1] : null;
}

// Asks the page-world helper to call the player's own nextVideo() (see src/page/youtube.js).
function nextViaPlayer() {
  const root = document.documentElement;
  root.removeAttribute('data-lsm-yt-next-done');
  document.dispatchEvent(new CustomEvent('lsm:yt-next'));
  const done = root.hasAttribute('data-lsm-yt-next-done');
  root.removeAttribute('data-lsm-yt-next-done');
  return done;
}

let splitAt = 0; // when the URL and the player started disagreeing about the video

// Shorts play in their own player; the regular one stays in the page, hidden.
const onShorts = () => location.pathname.startsWith('/shorts/');

export default {
  id: 'youtube',
  keyPrefix: 'yt',
  legacyStoreKey: 'ysl:v1',

  // Only the main page and embedded players have a player worth attaching to.
  shouldRun: () => window.top === window.self || /^\/embed\//.test(location.pathname),

  findPlayer: () => document.getElementById(onShorts() ? 'shorts-player' : 'movie_player'),
  findMedia: (p) => p.querySelector('video.html5-main-video') || p.querySelector('video'),
  isAd: (p) => !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')),

  identify(p, ad) {
    const data = ad ? null : apiData(p); // during an ad the player may report the ad's own id
    const api = data ? data.id : null;
    const url = idFromUrl();
    const live = !!(data && data.live);
    if (url && api && url !== api) {
      // Mid-navigation (or an ad that isn't flagged yet): hold until both agree, but not forever.
      const now = Date.now();
      if (!splitAt) splitAt = now;
      if (now - splitAt < 4000) return { hold: true };
      return { id: api, live };
    }
    splitAt = 0;
    return { id: api || url, live };
  },

  buttonClass: 'ytp-button',
  // Shorts have no control bar: the button sits in the player's top corner instead (see layout.js).
  buttonHost: (p) => p.querySelector('.ytp-right-controls-left') || p.querySelector('.ytp-right-controls') || (onShorts() ? p : null),
  progressBar: (p) => p.querySelector('.ytp-progress-bar'),
  // The next video of the playlist, or the one autoplay would pick (Shorts: none, see nextMedia).
  // YouTube doesn't always handle the ⏭ media key, and hides its next button on some pages.
  nextTrack: () => !onShorts() && (nextViaPlayer() || press('#movie_player .ytp-next-button')),
  controlsTop(p) {
    const chrome = p.querySelector('.ytp-chrome-bottom');
    if (!chrome) return null;
    const r = chrome.getBoundingClientRect();
    return r.height > 0 ? r.top : null;
  },

  navEvents: ['yt-navigate-start', 'yt-navigate-finish', 'yt-page-data-updated', 'yt-player-updated'],
};
