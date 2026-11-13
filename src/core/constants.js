export const MIN_LEN = 0.5; // shortest section, in seconds
export const NEW_LOOP_LEN = 30;
export const MAX_LOOPS = 12;
export const MAX_COUNT = 999;
export const MAX_SAVED = 1000; // media items with saved loops, across all sites
export const PALETTE = ['62,166,255', '255,183,77', '110,231,163', '255,126,182', '179,157,255', '77,208,225']; // r,g,b

// What happens when a loop has played out: keep playing, jump straight to the next loop, or pause at the end.
export const AFTER = ['continue', 'next', 'pause'];
