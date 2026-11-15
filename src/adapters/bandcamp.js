// Bandcamp: a plain <audio> in the page (the generic adapter finds it); the markers go on the
// inline player's progress bar. An album page plays every track in one player, so the track title
// is part of the key (two tracks of the same length never share loops).

import generic from './generic.js';

const trackTitle = () => {
  const t = document.querySelector('.inline_player .title');
  return t ? t.textContent.trim().slice(0, 80) : '';
};

export default {
  ...generic,
  id: 'bandcamp',
  progressBar: () => document.querySelector('.inline_player .progbar_empty'),

  identify(p) {
    const who = generic.identify(p);
    const title = who.id ? trackTitle() : '';
    return title ? { ...who, id: `${who.id}|${title}` } : who;
  },

  // Loops saved before the title was in the key (1.4.0 and older), then a duration one second off.
  nearKeys(key) {
    const bar = key.lastIndexOf('|');
    const plain = bar > 0 ? key.slice(0, bar) : key;
    const title = bar > 0 ? key.slice(bar) : '';
    return [...(title ? [plain] : []), ...generic.nearKeys(plain).map((k) => k + title)];
  },
};
