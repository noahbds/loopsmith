// Finds a site's own progress (seek) bar for a media element, on sites without a dedicated adapter,
// so the loop markers can be drawn on it.
//
// Looks inside the player around the media (the nearest ancestors about the size of the video,
// across shadow roots) for, best first:
//   1. a slider (role="slider" or <input type="range">) whose maximum is the media's duration
//      (in seconds or milliseconds): that is the seek bar, whatever it looks like;
//   2. an element named like one (progress, seek, scrub, timeline) in its class, id or label.
// Candidates must be wide (at least 40 % of the video), thin, and sit over or just under the
// video. Volume sliders are left out.

const NAMED = /(progress|seek|scrub|timeline|time-?bar|playbar)/i;
const NOT = /(volume|vol-|sound|brightness|speed|rate|quality|buffer(ed)?-?only)/i;

const describe = (el) => [el.id, typeof el.className === 'string' ? el.className : el.getAttribute('class'),
  el.getAttribute('aria-label'), el.getAttribute('data-testid'), el.getAttribute('data-a-target')].filter(Boolean).join(' ');

// The player around the media: climbs while the ancestor stays about the size of the video
// (controls may sit just below it).
function playerOf(media, vr) {
  let node = media;
  let best = media.parentElement || media.getRootNode().host || null;
  for (let i = 0; i < 8 && node; i++) {
    node = node.parentElement || (node.getRootNode && node.getRootNode().host) || null;
    if (!node || node === document.body || node === document.documentElement) break;
    const r = node.getBoundingClientRect();
    if (r.width > vr.width * 1.35 + 40 || r.height > vr.height + 220) break;
    best = node;
  }
  return best;
}

function* elementsIn(root, depth = 0) {
  for (const el of root.querySelectorAll('*')) {
    yield el;
    if (el.shadowRoot && depth < 3) yield* elementsIn(el.shadowRoot, depth + 1);
  }
}

function sliderMax(el) {
  const v = el.tagName === 'INPUT' ? el.max : el.getAttribute('aria-valuemax');
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
}

export function findProgressBar(media) {
  if (!media || !media.isConnected) return null;
  const vr = media.getBoundingClientRect();
  if (vr.width < 120 || vr.height < 60) return null;
  const player = playerOf(media, vr);
  if (!player) return null;
  const d = media.duration;
  let best = null;
  let bestScore = 0;
  for (const el of elementsIn(player)) {
    if (el === media) continue;
    const r = el.getBoundingClientRect();
    if (r.width < vr.width * 0.4 || r.height <= 0 || r.height > 48) continue;
    if (r.top < vr.top - 10 || r.bottom > vr.bottom + 140) continue;
    const name = describe(el);
    if (NOT.test(name)) continue;
    const slider = (el.tagName === 'INPUT' && el.type === 'range') || el.getAttribute('role') === 'slider';
    let score = 0;
    if (slider && d > 0) {
      const max = sliderMax(el);
      if (Math.abs(max - d) < 2 || Math.abs(max / 1000 - d) < 2) score = 100;
      else if (max === 100 && !NAMED.test(name)) score = 0; // percent slider, could be anything
    }
    if (!score && NAMED.test(name)) score = 50;
    if (!score && slider) score = 20;
    if (!score) continue;
    score += (r.width / vr.width) * 10; // wider is likelier the main bar
    if (score > bestScore) {
      best = el;
      bestScore = score;
    }
  }
  return best;
}

// Whether an element is actually visible (players fade their controls out with opacity).
// Visibility is inherited but can be turned back on lower down, so only the element's own value
// counts; opacity multiplies down the tree, so every ancestor's counts.
export function shown(el) {
  if (getComputedStyle(el).visibility !== 'visible') return false;
  let o = 1;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement || (n.getRootNode && n.getRootNode().host) || null) {
    const cs = getComputedStyle(n);
    if (cs.display === 'none') return false;
    o *= parseFloat(cs.opacity);
    if (o < 0.1) return false;
  }
  return true;
}
