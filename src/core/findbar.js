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
const BAR_CLS = /(control|toolbar|buttons|transport|actions|player-bar|playbar|bottom)/i;
const SKIP_GROUP = /(playlist|queue|chapter|menu|dialog|modal|popup|header|nav|sidebar|comment|share)/i;

/** @param {Element} el */
const describe = (el) => [el.id, typeof el.className === 'string' ? el.className : el.getAttribute('class'),
  el.getAttribute('aria-label'), el.getAttribute('data-testid'), el.getAttribute('data-a-target')].filter(Boolean).join(' ');

/** @param {Node} n @returns {Element | null} */
function hostOf(n) {
  const root = n.getRootNode ? n.getRootNode() : null;
  return root && 'host' in root ? /** @type {ShadowRoot} */ (root).host : null;
}

// The player around the media: climbs while the ancestor stays about the size of the video
// (controls may sit just below it).
/**
 * @param {Element} media
 * @param {DOMRect} vr
 * @returns {Element | null}
 */
function playerOf(media, vr) {
  /** @type {Element | null} */
  let node = media;
  /** @type {Element | null} */
  let best = media.parentElement || hostOf(media);
  for (let i = 0; i < 8 && node; i++) {
    node = node.parentElement || hostOf(node);
    if (!node || node === document.body || node === document.documentElement) break;
    const r = node.getBoundingClientRect();
    if (r.width > vr.width * 1.35 + 40 || r.height > vr.height + 220) break;
    best = node;
  }
  return best;
}

/**
 * @param {ParentNode} root
 * @param {number} [depth]
 * @returns {Generator<Element>}
 */
function* elementsIn(root, depth = 0) {
  for (const el of root.querySelectorAll('*')) {
    yield el;
    if (el.shadowRoot && depth < 3) yield* elementsIn(el.shadowRoot, depth + 1);
  }
}

/** @param {Element} el */
function sliderMax(el) {
  return parseFloat(el instanceof HTMLInputElement ? el.max : (el.getAttribute('aria-valuemax') || ''));
}

/**
 * @param {HTMLMediaElement | null} media
 * @returns {Element | null}
 */
export function findProgressBar(media) {
  if (!media || !media.isConnected) return null;
  const vr = media.getBoundingClientRect();
  if (vr.width < 120 || vr.height < 60) return null;
  const player = playerOf(media, vr);
  if (!player) return null;
  const d = media.duration;
  /** @type {Element | null} */
  let best = null;
  let bestScore = 0;
  for (const el of elementsIn(player)) {
    if (el === media) continue;
    const r = el.getBoundingClientRect();
    if (r.width < vr.width * 0.4 || r.height <= 0 || r.height > 48) continue;
    if (r.top < vr.top - 10 || r.bottom > vr.bottom + 140) continue;
    const name = describe(el);
    if (NOT.test(name)) continue;
    const slider = (el instanceof HTMLInputElement && el.type === 'range') || el.getAttribute('role') === 'slider';
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
/** @param {Element} el */
export function shown(el) {
  if (getComputedStyle(el).visibility !== 'visible') return false;
  let o = 1;
  /** @type {Element | null} */
  let n = el;
  while (n && n.nodeType === 1) {
    const cs = getComputedStyle(n);
    if (cs.display === 'none') return false;
    o *= parseFloat(cs.opacity);
    if (o < 0.1) return false;
    n = n.parentElement || hostOf(n);
  }
  return true;
}

/**
 * Finds a spot inside a custom HTML player's own control bar (on any website, including open
 * shadow roots) where the loop button can sit alongside the player's own icon buttons.
 * Returns null when the player uses native browser controls or has no multi-button bar.
 * @param {HTMLMediaElement | null} media
 * @returns {{ host: Element, before: Node | null, tint: Element } | null}
 */
export function findControlSlot(media) {
  if (!media || !media.isConnected) return null;
  const isVideo = media.tagName === 'VIDEO';
  const vr = media.getBoundingClientRect();
  if (isVideo && (vr.width < 240 || vr.height < 140)) return null;
  const player = playerOf(media, isVideo ? vr : new DOMRect(0, 0, window.innerWidth, 120));
  if (!player) return null;

  /** @type {{ host: Element, buttons: Element[], score: number } | null} */
  let best = null;

  for (const el of elementsIn(player)) {
    if (el === media || el.classList.contains('lsm-panel') || el.classList.contains('lsm-strip')) continue;
    const role = el.getAttribute('role') || '';
    if (/^(menu|tablist|listbox|dialog)$/.test(role)) continue;
    const name = describe(el);
    if (SKIP_GROUP.test(name)) continue;

    const cs = getComputedStyle(el);
    if (!/^(inline-)?flex$/.test(cs.display) || cs.flexDirection.startsWith('column')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 48 || r.height < 18 || r.height > 72) continue;
    if (isVideo && (r.top < vr.bottom - 96 || r.bottom > vr.bottom + 84 || r.left < vr.left - 20 || r.right > vr.right + 20)) continue;

    // Direct child buttons (excluding our own loop button) aligned on one horizontal row.
    const btns = [...el.children].filter((c) => {
      if (c.classList.contains('lsm-btn')) return false;
      const isBtn = c.tagName === 'BUTTON' || c.getAttribute('role') === 'button' || c.getAttribute('role') === 'switch';
      if (!isBtn) return false;
      const br = c.getBoundingClientRect();
      return br.width >= 16 && br.width <= 68 && br.height >= 16 && br.height <= 56;
    });
    if (btns.length < 2) continue;
    const y0 = btns[0].getBoundingClientRect().top;
    if (btns.some((b) => Math.abs(b.getBoundingClientRect().top - y0) > 14)) continue;

    let score = btns.length * 10;
    if (BAR_CLS.test(name)) score += 25;
    // Prefer right-hand control groups (next to volume / settings / fullscreen), like YouTube and Vimeo.
    if (isVideo && r.left >= vr.left + vr.width * 0.45) score += 20;
    if (!best || score > best.score) best = { host: el, buttons: btns, score };
  }

  if (!best) return null;
  const { host, buttons } = best;
  const last = buttons[buttons.length - 1];
  const lastLabel = describe(last);
  // In a full-width bar whose last button is fullscreen, sit just before fullscreen; in a right-hand group, sit first.
  const isRightGroup = isVideo && host.getBoundingClientRect().left >= vr.left + vr.width * 0.45;
  const before = isRightGroup ? host.firstChild : /fullscreen|plein|pantalla|vollbild/i.test(lastLabel) ? last : null;
  return { host, before, tint: buttons[0] };
}
