// Bandcamp: a plain <audio> in the page (the generic adapter finds it); the markers go on the
// inline player's progress bar.

import generic from './generic.js';

export default {
  ...generic,
  id: 'bandcamp',
  progressBar: () => document.querySelector('.inline_player .progbar_empty'),
};
