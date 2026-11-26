// Streaming music web players: Apple Music, Deezer, Tidal and Amazon Music.
//
// All four run with `src/page/media-hook.js` in the page world, which adopts out-of-DOM <audio>
// elements into <loopsmith-media>, crosses open shadow roots on play(), and records the site's
// MediaSession handlers (nexttrack / seekto) plus Apple Music's MusicKit instance when present.

import generic from './generic.js';
import { press } from './press.js';
import { allMedia } from '../core/deepmedia.js';
import { findControlSlot } from '../core/findbar.js';

// Picks the active audio/media element, ignoring short muted decorative canvas videos.
function findMusicMedia() {
  const boxed = [...document.querySelectorAll('loopsmith-media audio, loopsmith-media video')].filter((m) => m.duration > 0);
  const playingBoxed = boxed.find((m) => !m.paused);
  if (playingBoxed) return playingBoxed;
  const audios = allMedia().filter((m) => m.tagName === 'AUDIO' && m.duration > 0);
  return audios.find((m) => !m.paused) || boxed[boxed.length - 1] || audios[audios.length - 1] || null;
}

// Track identity from the standard MediaSession metadata, with duration so distinct edits stay separate.
function sessionTrackId(d) {
  try {
    const md = navigator.mediaSession && navigator.mediaSession.metadata;
    if (md && md.title) {
      return `t:${md.title.trim()}|${(md.artist || '').trim()}`.slice(0, 200) + `#${Math.round(d)}`;
    }
  } catch (_) { /* ignore */ }
  return null;
}

function seekViaSession(t) {
  const root = document.documentElement;
  root.removeAttribute('data-lsm-seek-done');
  root.setAttribute('data-lsm-seek', String(t));
  document.dispatchEvent(new CustomEvent('lsm:seek'));
  const done = root.hasAttribute('data-lsm-seek-done');
  root.removeAttribute('data-lsm-seek-done');
  root.removeAttribute('data-lsm-seek');
  return done;
}

function askAppleMusic() {
  const root = document.documentElement;
  root.removeAttribute('data-lsm-am');
  document.dispatchEvent(new CustomEvent('lsm:am-ask'));
  const raw = root.getAttribute('data-lsm-am');
  root.removeAttribute('data-lsm-am');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

// Queries inside `root` and open shadow roots (for web-component chrome).
function deepQuery(root, selector, depth = 0) {
  if (!root) return null;
  const direct = root.querySelector(selector);
  if (direct) return direct;
  if ('shadowRoot' in root && root.shadowRoot) {
    const hit = deepQuery(root.shadowRoot, selector, depth + 1);
    if (hit) return hit;
  }
  if (depth >= 3) return null;
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) {
      const hit = deepQuery(el.shadowRoot, selector, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

// Fallback slot finder inside a bottom player bar container (even before an <audio> element exists).
function barButtonSlot(barRoot) {
  if (!barRoot) return null;
  // Each box is looked at once: nested elements would otherwise be re-styled once per ancestor.
  const seen = new Set();
  for (const el of [barRoot, ...barRoot.querySelectorAll('*')]) {
    const root = el.shadowRoot || el;
    for (const box of [root, ...(root.querySelectorAll ? root.querySelectorAll('*') : [])]) {
      if (!(box instanceof Element) || seen.has(box)) continue;
      seen.add(box);
      const cs = getComputedStyle(box);
      if (!/^(inline-)?flex$/.test(cs.display) || cs.flexDirection.startsWith('column')) continue;
      const btns = [...box.children].filter((c) => !c.classList.contains('lsm-btn') && (c.tagName === 'BUTTON' || c.getAttribute('role') === 'button' || c.getAttribute('role') === 'switch'));
      if (btns.length >= 2) return { host: box, before: null, tint: btns[0] };
    }
  }
  return null;
}

const musicBase = {
  ...generic,
  shouldRun: () => window.top === window.self,
  dockOnly: true,
  dockInset: 88,
  endGuard: 1.5,
  engaged: () => true,
  waitingText: 'Press play to load the track, then set your loops.',
  findPlayer: findMusicMedia,
};

export const applemusic = {
  ...musicBase,
  id: 'applemusic',
  keyPrefix: 'am',

  identify(p) {
    const d = p.duration;
    if (!(d > 0)) return { hold: true };
    const mk = askAppleMusic();
    if (mk && mk.id) return { id: mk.id, live: false };
    const bar = document.querySelector('[data-testid="chrome-player"], amp-chrome-player') || document;
    const link = deepQuery(bar, 'a[href*="/song/"], a[href*="?i="], a[href*="&i="]');
    if (link) {
      const href = link.getAttribute('href') || '';
      const byParam = /[?&]i=(\d+)/.exec(href);
      if (byParam) return { id: byParam[1], live: false };
      const bySong = /\/song\/[^/]+\/(\d+)/.exec(href);
      if (bySong) return { id: bySong[1], live: false };
    }
    const sid = sessionTrackId(d);
    if (sid) return { id: sid, live: false };
    const lcd = document.querySelector('[data-testid="lcd-metadata"]');
    const text = lcd ? lcd.textContent.replace(/\s+/g, ' ').trim() : '';
    return text ? { id: `t:${text.slice(0, 180)}#${Math.round(d)}`, live: false } : { hold: true };
  },

  progressBar() {
    return document.querySelector('[data-testid="player-progress-container"], [data-testid="player-progress"], [data-testid="player-lcd-progress"]')
      || deepQuery(document.querySelector('amp-chrome-player'), '.playback-progress, input[type="range"], [role="slider"]');
  },

  nextTrack() {
    if (press('[data-testid="playback-control-item-skip"].next button, [data-testid="chrome-player"] .skip.next button')) return true;
    const btn = deepQuery(document.querySelector('amp-chrome-player'), 'button[data-testid="next-button"], .playback-controls__btn--next');
    if (btn) { btn.click(); return true; }
    return false;
  },

  // Inside the right-side action buttons of Apple Music's player pill (next to Queue and Volume,
  // where flex width expands freely without encroaching on the centre LCD), or right after Repeat.
  barSlot() {
    const actions = document.querySelector('[data-testid="chrome-player"] .action-buttons');
    if (actions) return { host: actions, before: actions.firstChild };
    const repeat = document.querySelector('[data-testid="playback-controls"] amp-playback-controls-repeat')
      || deepQuery(document.querySelector('amp-chrome-player'), 'button[data-testid="repeat-button"], .playback-controls__btn--repeat');
    return repeat && repeat.parentElement ? { host: repeat.parentElement, before: repeat.nextSibling } : null;
  },

  barTint: () => document.querySelector('[data-testid="up-next-button"], [data-testid="volume-button"]'),

  seek(v, t) {
    if (!seekViaSession(t)) v.currentTime = t;
  },
};

export const deezer = {
  ...musicBase,
  id: 'deezer',
  keyPrefix: 'dz',
  dockInset: 84,

  identify(p) {
    const d = p.duration;
    if (!(d > 0)) return { hold: true };
    for (const a of document.querySelectorAll('[data-testid="miniplayer_container"] a[href], .page-player a[href], [data-testid="page_player"] a[href], #page_player a[href]')) {
      const m = /\/track\/(\d+)/.exec(a.getAttribute('href') || '');
      if (m) return { id: m[1], live: false };
    }
    const sid = sessionTrackId(d);
    if (sid) return { id: sid, live: false };
    const title = document.querySelector('[data-testid="item_title"]')?.textContent?.trim() || '';
    const artist = document.querySelector('[data-testid="item_subtitle"]')?.textContent?.trim() || '';
    return title ? { id: `t:${title}|${artist}`.slice(0, 200) + `#${Math.round(d)}`, live: false } : { hold: true };
  },

  progressBar: () => document.querySelector('[data-testid="progress_bar"], [data-testid="player_progress_bar"], .page-player .slider-track-input, .page-player .slider-track, #page_player .slider-track'),
  nextTrack: () => press('[data-testid="next_track_button"], [data-testid="control_next_button"]'),
  // Right after Deezer's repeat button (`repeat_button_off` / `repeat_button_all` / `repeat_button_one`).
  barSlot() {
    const r = document.querySelector('[data-testid^="repeat_button"], .page-player [data-testid^="repeat_button"], #page_player [data-testid^="repeat_button"]');
    if (r && r.parentElement) return { host: r.parentElement, before: r.nextSibling };
    return barButtonSlot(document.querySelector('[data-testid="miniplayer_container"], .page-player, [data-testid="page_player"], #page_player'));
  },
  barTint: () => document.querySelector('[data-testid^="repeat_button"], [data-testid="next_track_button"], [data-testid="queue_list_button"]'),
};

export const tidal = {
  ...musicBase,
  id: 'tidal',
  keyPrefix: 'td',

  identify(p) {
    const d = p.duration;
    if (!(d > 0)) return { hold: true };
    for (const a of document.querySelectorAll('[data-test="new-now-playing"] a[href*="/track/"], #footerPlayer a[href*="/track/"], [data-test="footer-player"] a[href*="/track/"]')) {
      const m = /\/track\/(\d+)/.exec(a.getAttribute('href') || '');
      if (m) return { id: m[1], live: false };
    }
    const sid = sessionTrackId(d);
    return sid ? { id: sid, live: false } : { hold: true };
  },

  progressBar: () => document.querySelector('[data-test="progress-bar"], [data-test="new-now-playing"] [role="slider"], [data-test="new-now-playing"] input[type="range"], #footerPlayer [data-test="progress-bar"], #footerPlayer input[type="range"], #footerPlayer [role="slider"]'),
  nextTrack: () => press('[data-test="next"], [data-test="new-now-playing"] [data-test*="next"]'),
  barSlot(p) {
    const r = document.querySelector('[data-test="repeat"], [data-test="new-now-playing"] [data-test*="repeat"], #footerPlayer [data-test="repeat"]');
    if (r && r.parentElement) return { host: r.parentElement, before: r.nextSibling };
    return barButtonSlot(document.querySelector('[data-test="new-now-playing"], #footerPlayer, [data-test="footer-player"]')) || findControlSlot(p);
  },
  barTint: () => document.querySelector('[data-test="repeat"], [data-test="next"], [data-test="new-now-playing"] button, #footerPlayer button'),
};

export const amazonmusic = {
  ...musicBase,
  id: 'amazonmusic',
  keyPrefix: 'az',

  identify(p) {
    const d = p.duration;
    if (!(d > 0)) return { hold: true };
    for (const a of document.querySelectorAll('#transport a[href], music-horizontal-item a[href]')) {
      const href = a.getAttribute('href') || '';
      const asin = /[?&]trackAsin=([A-Z0-9]+)/i.exec(href) || /\/tracks\/([A-Z0-9]+)/i.exec(href);
      if (asin) return { id: asin[1], live: false };
    }
    const sid = sessionTrackId(d);
    return sid ? { id: sid, live: false } : { hold: true };
  },

  progressBar: () => deepQuery(document.querySelector('#transport') || document, 'input[type="range"], music-seekbar, [role="slider"]'),
  nextTrack() {
    const btn = deepQuery(document.querySelector('#transport'), 'music-button[icon-name*="next"], button[data-testid*="next"]');
    if (btn) { btn.click(); return true; }
    return false;
  },
  barSlot(p) {
    const r = deepQuery(document.querySelector('#transport'), 'music-button[icon-name*="repeat"], button[data-testid*="repeat"]');
    if (r && r.parentElement) return { host: r.parentElement, before: r.nextSibling };
    return barButtonSlot(document.querySelector('#transport')) || findControlSlot(p);
  },
  barTint: () => deepQuery(document.querySelector('#transport'), 'button, music-button'),
};
