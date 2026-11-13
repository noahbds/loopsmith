// Spotify Web Player (open.spotify.com). DRM audio in a media element Spotify never puts in the
// page; src/page/media-hook.js moves it into a hidden box so it can be watched. Loops are saved per
// track, read from the "now playing" widget.
//
// Seeking: Spotify keeps its own idea of the position, so the first choice is to seek the way a
// user would, through its own progress bar (an <input type="range"> behind the custom slider).
// If that doesn't move playback (Spotify changed something), the adapter notices and switches to
// setting the media element's position directly for the rest of the session.
//
// Not testable in browsers without Widevine (DRM): see docs/MULTI_SITE_PLAN.md, section 4.9.

import generic from './generic.js';

const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
let mode = 'bar'; // 'bar' or 'element'

const WIDGET = '[data-testid="now-playing-widget"]';

// What is playing: the track / episode id from the "now playing" widget, or, for items without
// such a link (music videos, some podcasts), their title and artist as the media session shows them.
function nowPlaying() {
  for (const a of document.querySelectorAll(`${WIDGET} a[href], [data-testid="context-item-link"][href]`)) {
    const m = /\/(track|episode)\/([A-Za-z0-9]+)/.exec(a.getAttribute('href') || '');
    if (m) return `${m[1] === 'track' ? '' : 'ep:'}${m[2]}`;
  }
  let title = '';
  let artist = '';
  try {
    const md = navigator.mediaSession && navigator.mediaSession.metadata;
    if (md) {
      title = md.title || '';
      artist = md.artist || '';
    }
  } catch (_) { /* not readable here */ }
  if (!title) {
    const w = document.querySelector(WIDGET);
    title = (w && w.querySelector('[data-testid="context-item-info-title"]')?.textContent) || '';
    artist = (w && w.querySelector('[data-testid="context-item-info-subtitles"]')?.textContent) || '';
  }
  return title ? `t:${title.trim()}|${artist.trim()}`.slice(0, 200) : null;
}

// Free-tier ads say so in the widget (or in the media session).
const AD = /^(advertisement|publicit[ée]|anuncio|werbung|pubblicit[àa]|reclame|reklama|annonce)\b/i;
function adPlaying() {
  const w = document.querySelector(WIDGET);
  const text = w ? w.innerText.trim() : '';
  let title = '';
  try { title = navigator.mediaSession?.metadata?.title || ''; } catch (_) { /* ignore */ }
  return AD.test(text) || AD.test(title);
}

function progressInput() {
  return document.querySelector('[data-testid="playback-progressbar"] input[type="range"]');
}

export default {
  ...generic,
  id: 'spotify',
  keyPrefix: 'sp',
  dockOnly: true,
  dockInset: 80, // the now-playing bar
  engaged: () => true,

  isAd: () => adPlaying(),

  identify(p) {
    const d = p.duration;
    const id = nowPlaying();
    if (!(d > 0) || !id) return { hold: true };
    // Title-based ids also carry the duration, so two different items never share loops.
    return { id: id.startsWith('t:') ? `${id}#${Math.round(d)}` : id, live: false };
  },

  progressBar: () => document.querySelector('[data-testid="playback-progressbar"]'),
  endGuard: 1.5,

  seek(v, t) {
    const input = progressInput();
    const max = input ? Number(input.max) : 0;
    if (mode === 'bar' && input && max > 0 && !input.disabled) {
      const scale = max > v.duration * 10 ? 1000 : 1; // the bar counts milliseconds
      setValue.call(input, String(Math.round(t * scale)));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      // Self-check: if playback didn't follow, seek the element directly from now on.
      setTimeout(() => {
        if (!v.seeking && Math.abs(v.currentTime - t) > 2.5) {
          mode = 'element';
          v.currentTime = t;
        }
      }, 900);
      return;
    }
    v.currentTime = t;
  },
};
