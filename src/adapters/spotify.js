// Spotify Web Player (open.spotify.com). DRM audio in a media element Spotify never puts in the
// page; src/page/media-hook.js moves it into a hidden box so it can be watched. Loops are saved per
// track, read from the "now playing" widget.
//
// Seeking the media element directly keeps Spotify's own position and progress bar in step
// (checked 2026-11-13; seeking through its progress bar works too, but only to the nearest ms it
// was given, so the element is used). Needs a browser with Widevine (DRM) to play at all.

import generic from './generic.js';

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

export default {
  ...generic,
  id: 'spotify',
  keyPrefix: 'sp',
  dockOnly: true,
  dockInset: 80, // the now-playing bar
  engaged: () => true,
  waitingText: 'Press play to load the track, then set your loops.',

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

  // The audio is the media the hook moved into its box. Track "Canvas" backgrounds are short
  // looping <video>s that also call play(): never pick those.
  findPlayer(keep) {
    const boxed = [...document.querySelectorAll('loopsmith-media video, loopsmith-media audio')].filter((m) => m.duration > 0);
    return boxed.find((m) => !m.paused) || boxed[boxed.length - 1] || null;
  },
};
