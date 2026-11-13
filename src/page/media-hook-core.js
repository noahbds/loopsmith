// Runs in the page's own JS world, at document start, on sites whose player keeps its <audio> /
// <video> out of the page (SoundCloud, Spotify: `new Audio()` that is never inserted). Such media
// can't be found by the content script, so when one starts playing it is moved into a hidden
// <loopsmith-media> box at the end of the document. Inserting a media element never pauses it.
// Nothing else is touched.

export function installMediaHook() {
  const root = document.documentElement;
  if (!root || root.hasAttribute('data-ysl-hook')) return;
  root.setAttribute('data-ysl-hook', '');

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
    try { adopt(this); } catch (_) { /* never get in the way of playback */ }
    return play.apply(this, arguments);
  };
}
