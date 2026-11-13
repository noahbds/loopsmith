// Runs in the page's own JS world (Chrome: content script with "world": "MAIN").
// Answers "which video does the player say is loaded?" and "seek to t" for the content script,
// which can't call the player's methods from its isolated world. Kept tiny on purpose.

(() => {
  const root = document.documentElement;
  if (root.hasAttribute('data-lsm-page')) return;
  root.setAttribute('data-lsm-page', '');

  document.addEventListener('lsm:yt-ask', () => {
    let out = '';
    try {
      const p = document.getElementById('movie_player');
      const d = p && typeof p.getVideoData === 'function' ? p.getVideoData() : null;
      if (d) out = JSON.stringify({ id: d.video_id ? String(d.video_id) : null, live: d.isLive === true });
    } catch (_) { /* player not initialised yet */ }
    root.setAttribute('data-lsm-yt', out);
  });

  // Seeks through the player's own API, so its state (queue, progress bar) stays in step.
  // The time comes in a DOM attribute: event details don't cross JS worlds reliably.
  document.addEventListener('lsm:yt-seek', () => {
    const t = Number(root.getAttribute('data-lsm-seek'));
    root.removeAttribute('data-lsm-seek');
    try {
      const p = document.getElementById('movie_player');
      if (p && typeof p.seekTo === 'function' && Number.isFinite(t)) {
        p.seekTo(t, true);
        root.setAttribute('data-lsm-seek-done', '');
      }
    } catch (_) { /* fall back to the element */ }
  });
})();
