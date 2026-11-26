// Asks the page-world hook (src/page/media-session-core.js) to call the site's "next track"
// media-key handler. Synchronous: the hook answers through an attribute on <html> before
// dispatchEvent returns. False when there is no hook or the site never set a handler.

export function pressNextKey() {
  const root = document.documentElement;
  if (!root) return false;
  root.removeAttribute('data-lsm-next-done');
  document.dispatchEvent(new CustomEvent('lsm:next'));
  const done = root.hasAttribute('data-lsm-next-done');
  root.removeAttribute('data-lsm-next-done');
  return done;
}
