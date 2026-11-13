export const MIN_LEN = 0.5; // shortest section, in seconds
export const FINE_MIN_LEN = 0.2; // ... when times are kept to hundredths (loops never turn around sooner than 0.2 s)
export const NAME_MAX = 24; // longest loop name
export const NEW_LOOP_LEN = 30;
export const MAX_LOOPS = 12;
export const MAX_COUNT = 999;
export const MAX_SETS = 99; // most times the whole set of loops can be played
export const MAX_SAVED = 1000; // media items with saved loops, across all sites
export const PALETTE = ['62,166,255', '255,183,77', '110,231,163', '255,126,182', '179,157,255', '77,208,225', '255,112,90', '198,229,84', '64,120,255', '38,198,160', '224,64,251', '214,196,150']; // r,g,b: 12, one per possible loop

// What happens when a loop has played out: keep playing, jump straight to the next loop, or pause at the end.
export const AFTER = ['continue', 'next', 'pause'];
