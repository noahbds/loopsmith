// Video sites that play a plain <video> and only need to say where their progress bar is (for the
// loop markers) and where the loop button goes in their control bar, plus the odd site-specific
// detail. Everything else is the generic adapter (loops saved per page and duration).

import generic from './generic.js';

const q = (sel) => () => document.querySelector(sel);
// The loop button goes first in this group of the site's control bar.
const firstIn = (sel) => () => {
  const g = document.querySelector(sel);
  return g ? { host: g, before: g.firstChild } : null;
};

export const vimeo = {
  ...generic,
  id: 'vimeo',
  progressBar: q('.vp-progress'),
  // First of the buttons right of the progress bar (volume, captions, settings…).
  barSlot: firstIn('[class*="ControlBarButtonsAndMenus_module_collapsibleContent"]'),
  // Shared across vimeo.com/<id> and player.vimeo.com/video/<id>.
  identify(p) {
    const d = p.duration;
    if (!(d > 0)) return { hold: true };
    const m = /^(?:\/video)?\/(\d+)/.exec(location.pathname);
    if (m) return { id: `vimeo:${m[1]}`, live: d === Infinity };
    return generic.identify(p);
  },
  nearKeys(key) {
    if (!key.startsWith('web:vimeo:')) return generic.nearKeys(key);
    const v = document.querySelector('video');
    const old = v && v.duration > 0 ? generic.identify(v).id : null;
    return old ? [`web:${old}`, ...generic.nearKeys(`web:${old}`)] : [];
  },
};

export const twitch = {
  ...generic,
  id: 'twitch',
  progressBar: q('.seekbar-bar'),
  barSlot: firstIn('.player-controls__right-control-group'),
  // Pre-rolls and mid-rolls play in the same player; Twitch labels them.
  isAd: () => !!document.querySelector('[data-a-target="video-ad-label"], [data-a-target="video-ad-countdown"]'),
};

export const bilibili = {
  ...generic,
  id: 'bilibili',
  progressBar: q('.bpx-player-progress'),
  barSlot: firstIn('.bpx-player-control-bottom-right'),
  // Saved per video (BV id) and part (?p=), whatever language prefix the URL has.
  identify(p) {
    const d = p.duration;
    const bv = /\/video\/(BV\w+)/.exec(location.pathname);
    if (!(d > 0)) return { hold: true };
    if (!bv) return generic.identify(p);
    const part = new URLSearchParams(location.search).get('p');
    return { id: `bilibili:${bv[1]}${part && part !== '1' ? `?p=${part}` : ''}`, live: d === Infinity };
  },
};

// The player runs in a frame from geo.dailymotion.com; the generic adapter handles it there. Its
// controls are out of reach, so the markers run along the bottom of the video and the loop button
// floats over it.
//
// Loops are saved per video id. The frame's address doesn't always carry it (`?video=`), so the
// video page (www.dailymotion.com/video/<id>) hands it down to the player frame.
const DM_MSG = 'loopsmith:dm-video';
let dmId = null; // the id the video page sent down
let dmWait = 0; // when this frame started waiting for it

export const dailymotion = {
  ...generic,
  id: 'dailymotion',

  // Runs in every frame, media or not (see boot.js).
  helper() {
    if (window.top === window.self) {
      if (location.hostname !== 'www.dailymotion.com') return;
      setInterval(() => {
        const m = /^\/video\/([a-z0-9]+)/i.exec(location.pathname);
        if (!m) return;
        for (const f of document.querySelectorAll('iframe[src*="geo.dailymotion.com"]')) {
          try { f.contentWindow.postMessage({ type: DM_MSG, id: m[1] }, 'https://geo.dailymotion.com'); } catch (_) { /* frame gone */ }
        }
      }, 1000);
    } else {
      window.addEventListener('message', (e) => {
        if (e.origin === 'https://www.dailymotion.com' && e.data && e.data.type === DM_MSG && typeof e.data.id === 'string') {
          dmId = e.data.id.slice(0, 40);
        }
      });
    }
  },

  identify(p) {
    const d = p.duration;
    if (!(d > 0)) return { hold: true };
    const id = new URLSearchParams(location.search).get('video') || dmId;
    if (id) return { id: `dailymotion:${id}`, live: d === Infinity };
    // Inside Dailymotion's own pages but the id hasn't arrived yet: wait a little (it comes every
    // second from a video page; other pages never send it).
    if (document.referrer.startsWith('https://www.dailymotion.com/')) {
      if (!dmWait) dmWait = Date.now();
      if (Date.now() - dmWait < 3000) return { hold: true };
    }
    return generic.identify(p);
  },
};
