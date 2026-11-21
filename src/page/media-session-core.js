// Runs in the page's own JS world, at document start. Records the handler the site gives the
// browser for the "next track" media key (navigator.mediaSession.setActionHandler('nexttrack', …)):
// the one the keyboard's ⏭ key, the system's media controls and headphones call. "After the last:
// Next" calls it too, so the site moves on exactly as it would for that key (its queue, playlist
// or autoplay), whatever its buttons look like. The content script asks with an `lsm:next` event;
// `data-lsm-next-done` on <html> says the handler was there and was called.

export function installNextHook() {
  const root = document.documentElement;
  if (!root || root.hasAttribute('data-lsm-next')) return;
  root.setAttribute('data-lsm-next', '');

  const MS = window.MediaSession;
  if (!MS || typeof MS.prototype.setActionHandler !== 'function') return;
  const set = MS.prototype.setActionHandler;
  let next = null;
  MS.prototype.setActionHandler = function (action, handler) {
    try {
      if (action === 'nexttrack') next = typeof handler === 'function' ? handler : null;
    } catch (_) { /* never get in the way of the site */ }
    return set.apply(this, arguments);
  };

  document.addEventListener('lsm:next', () => {
    if (!next) return;
    try {
      next.call(navigator.mediaSession, { action: 'nexttrack' });
      root.setAttribute('data-lsm-next-done', '');
    } catch (_) { /* the content script falls back to the site's next button */ }
  });
}
