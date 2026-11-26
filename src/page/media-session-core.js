// Runs in the page's own JS world, at document start. Records the handlers the site gives the
// browser for media keys (navigator.mediaSession.setActionHandler):
// - 'nexttrack': called by "After the last: Next" via `lsm:next`
// - 'seekto': called via `lsm:seek` on players whose own UI state must hear seeks (plus MusicKit
//   on Apple Music, which also answers `lsm:am-ask` with the current song id).

export function installNextHook() {
  const root = document.documentElement;
  if (!root || root.hasAttribute('data-lsm-next')) return;
  root.setAttribute('data-lsm-next', '');

  const MS = window.MediaSession;
  let next = null;
  let seek = null;
  if (MS && typeof MS.prototype.setActionHandler === 'function') {
    const set = MS.prototype.setActionHandler;
    MS.prototype.setActionHandler = function (action, handler) {
      try {
        if (action === 'nexttrack') next = typeof handler === 'function' ? handler : null;
        else if (action === 'seekto') seek = typeof handler === 'function' ? handler : null;
      } catch (_) { /* never get in the way of the site */ }
      return set.apply(this, arguments);
    };
  }

  document.addEventListener('lsm:next', () => {
    try {
      const mk = window.MusicKit && typeof window.MusicKit.getInstance === 'function' ? window.MusicKit.getInstance() : null;
      if (mk && typeof mk.skipToNextItem === 'function') {
        mk.skipToNextItem();
        root.setAttribute('data-lsm-next-done', '');
        return;
      }
    } catch (_) { /* fall back to MediaSession */ }
    if (!next) return;
    try {
      next.call(navigator.mediaSession, { action: 'nexttrack' });
      root.setAttribute('data-lsm-next-done', '');
    } catch (_) { /* the content script falls back to the site's next button */ }
  });

  document.addEventListener('lsm:seek', () => {
    const t = Number(root.getAttribute('data-lsm-seek'));
    root.removeAttribute('data-lsm-seek');
    if (!Number.isFinite(t)) return;
    try {
      const mk = window.MusicKit && typeof window.MusicKit.getInstance === 'function' ? window.MusicKit.getInstance() : null;
      if (mk && typeof mk.seekToTime === 'function') {
        mk.seekToTime(t);
        root.setAttribute('data-lsm-seek-done', '');
        return;
      }
    } catch (_) { /* try MediaSession seekto */ }
    if (!seek) return;
    try {
      seek.call(navigator.mediaSession, { action: 'seekto', seekTime: t, fastSeek: false });
      root.setAttribute('data-lsm-seek-done', '');
    } catch (_) { /* fall back to setting currentTime directly */ }
  });

  document.addEventListener('lsm:am-ask', () => {
    let out = '';
    try {
      const mk = window.MusicKit && typeof window.MusicKit.getInstance === 'function' ? window.MusicKit.getInstance() : null;
      const item = mk && mk.nowPlayingItem;
      if (item && item.id) out = JSON.stringify({ id: String(item.id) });
    } catch (_) { /* MusicKit not ready */ }
    root.setAttribute('data-lsm-am', out);
  });
}
