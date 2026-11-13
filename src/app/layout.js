// Where things sit: the panel, the floating overlay, the markers, and mounting into the site.

import { visibleArea } from '../core/mediakey.js';
import { shown } from '../core/findbar.js';
import { clamp } from '../core/util.js';

export function createLayout(A) {
  const { S, P, ui, adapter, floating, L, engaged, focused, rememberPrefs } = A;

  function place() {
    const p = S.player;
    if (!p) return;
    const pr = (floating ? ui.host : p).getBoundingClientRect();
    const top = adapter.controlsTop(p);
    let bottom = top == null ? 62 : Math.max(12, Math.round(pr.bottom - top + 8));
    if (floating && dock) bottom = 68; // above the docked loop button
    ui.panel.style.bottom = bottom + 'px';
    ui.strip.style.bottom = bottom + 'px';
    // Over a video the loop button sits at the top right: keep the panel clear of it (it scrolls instead).
    const topRoom = floating && !dock ? 58 : 10;
    ui.panel.style.maxHeight = Math.max(120, Math.round(pr.height - bottom - topRoom)) + 'px';
    S.laneW = ui.lane.clientWidth;
    S.dpr = window.devicePixelRatio || 1;
    clampPos(pr);
  }

  // The panel or the strip, whichever is showing.
  const visibleBox = () => (S.open ? ui.panel : ui.strip.classList.contains('lsm-open') ? ui.strip : null);

  // The panel and the strip share one dragged offset.
  function applyPos() {
    for (const box of [ui.panel, ui.strip]) {
      box.style.setProperty('--dx', S.pos.dx + 'px');
      box.style.setProperty('--dy', S.pos.dy + 'px');
    }
  }

  // Brings the panel back inside the player if the window or the player got smaller than where it was left.
  function clampPos(pr) {
    const box = visibleBox();
    if (!box) return;
    const r = box.getBoundingClientRect();
    if (!r.width || !r.height) return;
    let ddx = 0;
    let ddy = 0;
    if (r.left < pr.left) ddx = pr.left - r.left;
    else if (r.right > pr.right) ddx = pr.right - r.right;
    if (r.top < pr.top) ddy = pr.top - r.top;
    else if (r.bottom > pr.bottom) ddy = pr.bottom - r.bottom;
    if (ddx || ddy) {
      S.pos = { dx: S.pos.dx + ddx, dy: S.pos.dy + ddy };
      applyPos();
    }
  }

  // Dragging `handle` moves `box` (the panel or the strip) inside the player. The offset is
  // remembered for the site; double-clicking the handle puts the panel back.
  function bindDrag(handle, box) {
    let drag = null;
    const area = () => (floating ? ui.host : S.player).getBoundingClientRect();
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !S.player) return;
      const r = box.getBoundingClientRect();
      const a = area();
      drag = {
        id: e.pointerId, x: e.clientX, y: e.clientY, dx: S.pos.dx, dy: S.pos.dy,
        lo: { x: S.pos.dx + a.left - r.left, y: S.pos.dy + a.top - r.top },
        hi: { x: S.pos.dx + a.right - r.right, y: S.pos.dy + a.bottom - r.bottom },
      };
      try { handle.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      handle.classList.add('lsm-grab');
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { lo, hi } = drag;
      S.pos = {
        dx: clamp(drag.dx + e.clientX - drag.x, Math.min(lo.x, hi.x), Math.max(lo.x, hi.x)),
        dy: clamp(drag.dy + e.clientY - drag.y, Math.min(lo.y, hi.y), Math.max(lo.y, hi.y)),
      };
      applyPos();
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      handle.classList.remove('lsm-grab');
      remember();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('dblclick', () => {
      S.pos = { dx: 0, dy: 0 };
      applyPos();
      remember();
    });
  }

  function remember() {
    if (S.pos.dx === 0 && S.pos.dy === 0) delete P.pos[adapter.id];
    else P.pos[adapter.id] = { dx: Math.round(S.pos.dx), dy: Math.round(S.pos.dy) };
    rememberPrefs();
  }

  function openPanel() {
    ensure();
    A.syncVideo();
    S.open = true;
    applyPos();
    place();
    A.render();
    ui.panel.classList.add('lsm-open');
    A.wake();
  }

  function closePanel() {
    A.commitEdits();
    const hadFocus = ui.panel.contains(focused());
    S.open = false;
    A.hideTip();
    ui.panel.classList.remove('lsm-open');
    A.render();
    if (hadFocus) ui.btn.focus({ preventScroll: true });
  }

  const resizeWatch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (visibleBox()) place(); }) : null;

  // Floating mode: the overlay follows the media. Big enough and mostly on screen: laid over the
  // video. Otherwise (audio, small or scrolled-away video): docked to the bottom-right corner.
  let dock = false;
  let hoverUntil = 0;
  let hoverTimer = 0;
  const box = { l: '', t: '', w: '', h: '', pill: '' };

  function layoutHost() {
    if (!floating) return;
    const p = S.player && S.player.isConnected ? S.player : null;
    // Music sites keep their button even before anything has played: the audio only appears then.
    if (!p && !adapter.dockOnly) {
      if (ui.host.isConnected) ui.host.remove();
      return;
    }
    const fs = document.fullscreenElement;
    const parent = fs && !(fs instanceof HTMLMediaElement) ? fs : document.body || document.documentElement;
    if (ui.host.parentNode !== parent) parent.appendChild(ui.host);
    const r = p ? p.getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const over = !adapter.dockOnly && !!p && p.tagName === 'VIDEO' && r.width >= 360 && r.height >= 220 && visibleArea(r, vw, vh) >= 0.5 * r.width * r.height;
    const next = over
      ? { l: Math.round(r.left) + 'px', t: Math.round(r.top) + 'px', w: Math.round(r.width) + 'px', h: Math.round(r.height) + 'px' }
      : { l: '0px', t: '0px', w: vw + 'px', h: Math.max(200, vh - (adapter.dockInset || 0)) + 'px' }; // above the site's player bar
    for (const [k, prop] of [['l', 'left'], ['t', 'top'], ['w', 'width'], ['h', 'height']]) {
      if (box[k] !== next[k]) {
        box[k] = next[k];
        ui.host.style.setProperty(prop, next[k], 'important');
      }
    }
    placeMarks(over ? r : null);
    // Keep the loop button in the visible part of a video scrolled partly above the window.
    const pillTop = over && r.top < 0 ? Math.round(10 - r.top) + 'px' : '10px';
    if (box.pill !== pillTop) {
      box.pill = pillTop;
      ui.host.style.setProperty('--lsm-pill-top', pillTop);
    }
    if (dock !== !over) {
      dock = !over;
      ui.host.classList.toggle('lsm-dock', dock);
      if (S.open) place();
    }
    updatePill();
  }

  // Floating mode: the markers are drawn over the site's own progress bar when the adapter knows
  // where it is, otherwise along the bottom edge of the video (generic pages), or not at all (audio).
  const markRect = { l: '', t: '', w: '' };

  function placeMarks(videoRect) {
    let bar = null;
    try { bar = adapter.progressBar ? adapter.progressBar(S.player) : null; } catch (_) { /* ignore */ }
    const br = bar && bar.getBoundingClientRect();
    let next = null;
    if (br && br.width > 20 && br.bottom > 0 && br.top < window.innerHeight) {
      // On the bar, and only while the site shows its controls (like YouTube's own markers).
      next = shown(bar) ? { l: br.left, t: br.top + br.height / 2 - 2, w: br.width } : null;
    } else if (videoRect) {
      next = { l: videoRect.left + 12, t: videoRect.bottom - 4, w: videoRect.width - 24 };
    }
    const placed = !!next;
    if (next) {
      for (const [k, prop, v] of [['l', 'left', next.l], ['t', 'top', next.t], ['w', 'width', next.w]]) {
        const px = Math.round(v) + 'px';
        if (markRect[k] !== px) {
          markRect[k] = px;
          ui.markBox.style.setProperty(prop, px);
        }
      }
    }
    if (placed !== L.barPlaced) {
      L.barPlaced = placed;
      A.render();
    }
  }

  // Over a video the button shows while the pointer is on it; docked, once the media has been played.
  function updatePill() {
    if (!floating) return;
    const p = S.player;
    const show = S.open || S.active || adapter.dockOnly
      || (dock ? !!p && (engaged(p) || (!!S.video && !S.video.paused)) : Date.now() < hoverUntil);
    ui.btn.classList.toggle('lsm-show', show);
  }

  let moveQueued = false;
  function onPointerMove(e) {
    if (moveQueued || !S.player) return;
    moveQueued = true;
    const x = e.clientX;
    const y = e.clientY;
    requestAnimationFrame(() => {
      moveQueued = false;
      if (dock || !S.player) return;
      const r = S.player.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        hoverUntil = Date.now() + 2500;
        clearTimeout(hoverTimer);
        // Players show their controls on mouse moves and hide them a moment later: the markers follow.
        hoverTimer = setTimeout(() => { updatePill(); queueLayout(); }, 2600);
        queueLayout();
      }
      updatePill();
    });
  }

  let layoutQueued = false;
  function queueLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => {
      layoutQueued = false;
      layoutHost();
      if (visibleBox()) place();
    });
  }

  // Sites like YouTube are single-page apps and rebuild parts of the player; re-attach whatever went missing.
  function ensure() {
    const p = adapter.findPlayer(S.active || S.open);
    if (!p) {
      if (floating && adapter.dockOnly) layoutHost();
      else if (floating && S.player && !S.player.isConnected) {
        if (S.open) closePanel();
        layoutHost();
      }
      return;
    }
    if (p !== S.player) {
      S.player = p;
      S.dirty = true;
      if (resizeWatch) {
        resizeWatch.disconnect();
        resizeWatch.observe(p);
      }
    }
    if (floating) {
      layoutHost();
      return;
    }
    if (ui.host.parentNode !== p) p.appendChild(ui.host);
    const host = adapter.buttonHost(p);
    if (host && ui.btn.parentNode !== host) host.insertBefore(ui.btn, host.firstChild);
    const bar = adapter.progressBar(p);
    if (bar && ui.markBox.parentNode !== bar) bar.appendChild(ui.markBox);
  }

  return { applyPos, bindDrag, box, closePanel, ensure, layoutHost, markRect, onPointerMove, openPanel, place, placeMarks, queueLayout, resizeWatch, updatePill };
}
