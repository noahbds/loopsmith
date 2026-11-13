// Runs in the page's own JS world (Chrome: content script with "world": "MAIN").
// Answers "which video does the player say is loaded?" for the content script, which can't call
// the player's methods from its isolated world. Kept tiny on purpose: no state, no other access.

(() => {
  const root = document.documentElement;
  if (root.hasAttribute('data-ysl-page')) return;
  root.setAttribute('data-ysl-page', '');

  document.addEventListener('ysl:yt-ask', () => {
    let out = '';
    try {
      const p = document.getElementById('movie_player');
      const d = p && typeof p.getVideoData === 'function' ? p.getVideoData() : null;
      if (d) out = JSON.stringify({ id: d.video_id ? String(d.video_id) : null, live: d.isLive === true });
    } catch (_) { /* player not initialised yet */ }
    root.setAttribute('data-ysl-yt', out);
  });
})();
