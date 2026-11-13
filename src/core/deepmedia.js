// Finds <video>/<audio> elements, including those inside open shadow roots (web-component players
// such as Reddit's). Closed shadow roots stay out of reach, by design of the platform.

export const PLAY_EVENT = 'loopsmith-play'; // fired by the page-world hook, composed

const SHADOW_EVERY = 3000; // ms: walking every element for shadow roots is the costly part
let shadowCache = [];
let shadowAt = -Infinity;

function shadowMedia(root, depth, out) {
  for (const el of root.querySelectorAll('*')) {
    const sr = el.shadowRoot;
    if (!sr) continue;
    for (const m of sr.querySelectorAll('video, audio')) out.push(m);
    if (depth < 4) shadowMedia(sr, depth + 1, out);
  }
  return out;
}

// Light-DOM media is always fresh; media in shadow roots is re-scanned every few seconds.
export function allMedia() {
  const light = [...document.querySelectorAll('video, audio')];
  const now = Date.now();
  if (now - shadowAt > SHADOW_EVERY) {
    shadowAt = now;
    shadowCache = shadowMedia(document, 0, []);
  }
  const deep = shadowCache.filter((m) => m.isConnected);
  return deep.length ? light.concat(deep) : light;
}

// The media element an event came from, even across shadow boundaries (open ones).
export function mediaOf(e) {
  const path = e.composedPath ? e.composedPath() : [];
  const t = path[0] || e.target;
  return t instanceof HTMLMediaElement ? t : null;
}
