// Video sites that play a plain <video> and only need to say where their progress bar is (for the
// loop markers), plus the odd site-specific detail. Everything else is the generic adapter:
// floating loop button over the video, loops saved per page and duration.

import generic from './generic.js';

const q = (sel) => () => document.querySelector(sel);

export const vimeo = {
  ...generic,
  id: 'vimeo',
  progressBar: q('.vp-progress'),
};

export const twitch = {
  ...generic,
  id: 'twitch',
  progressBar: q('.seekbar-bar'),
  // Pre-rolls and mid-rolls play in the same player; Twitch labels them.
  isAd: () => !!document.querySelector('[data-a-target="video-ad-label"], [data-a-target="video-ad-countdown"]'),
};

export const bilibili = {
  ...generic,
  id: 'bilibili',
  progressBar: q('.bpx-player-progress'),
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

// The player runs in a frame from geo.dailymotion.com; the generic adapter handles it there (the
// video id is in the frame's ?video= parameter). Its controls are out of reach, so the markers
// run along the bottom of the video.
export const dailymotion = { ...generic, id: 'dailymotion' };
