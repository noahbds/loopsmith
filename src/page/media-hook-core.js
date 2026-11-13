// Runs in the page's own JS world, at document start. Two jobs, both on play():
// - media the player keeps out of the page (SoundCloud, Spotify: `new Audio()` that is never
//   inserted) is moved into a hidden <loopsmith-media> box at the end of the document, so the
//   content script can find it. Inserting a media element never pauses it.
// - a composed `loopsmith-play` event is fired from the element, which (unlike `play`) crosses
//   shadow-root boundaries.
// Nothing else is touched.

export function installMediaHook() {
  const root = document.documentElement;
  if (!root || root.hasAttribute('data-lsm-hook')) return;
  root.setAttribute('data-lsm-hook', '');

  const P = HTMLMediaElement.prototype;
  const play = P.play;
  let box = null;

  function adopt(m) {
    if (m.isConnected) return;
    if (!box || !box.isConnected) {
      box = document.createElement('loopsmith-media');
      box.hidden = true;
      box.style.setProperty('display', 'none', 'important');
      // Outside <body>: frameworks that re-render the body never remove it (removal would pause).
      document.documentElement.appendChild(box);
    }
    // Media adopted earlier that is paused now is presumably finished with: let it go.
    // (Taking out a paused element changes nothing for it.)
    for (const old of [...box.children]) if (old !== m && old.paused) old.remove();
    box.appendChild(m);
  }

  P.play = function () {
    try {
      adopt(this);
      // `play` events don't leave shadow roots; this one does, so the content script sees media
      // inside web-component players too.
      this.dispatchEvent(new CustomEvent('loopsmith-play', { bubbles: true, composed: true }));
    } catch (_) { /* never get in the way of playback */ }
    return play.apply(this, arguments);
  };
}
