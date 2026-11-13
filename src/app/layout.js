// Where things sit: the panel, the floating overlay, the markers, and mounting into the site.

import { visibleArea } from '../core/mediakey.js';
import { shown } from '../core/findbar.js';

export function createLayout(A) {
  const { S, ui, adapter, floating, L, engaged, focused } = A;

  function place() {
    const p = S.player;
    if (!p) return;
    const pr = (floating ? ui.host : p).getBoundingClientRect();
    const top = adapter.controlsTop(p);
    let bottom = top == null ? 62 : Math.max(12, Math.round(pr.bottom - top + 8));
    if (floating && dock) bottom = 68; // above the docked loop button
    ui.panel.style.bottom = bottom + 'px';
    ui.panel.style.maxHeight = Math.max(120, Math.round(pr.height - bottom - 10)) + 'px';
    S.laneW = ui.lane.clientWidth;
    S.dpr = window.devicePixelRatio || 1;
  }

  function openPanel() {
    ensure();
    A.syncVideo();
    S.open = true;
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

  const resizeWatch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (S.open) place(); }) : null;

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
      if (S.open) place();
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

  return { box, closePanel, ensure, layoutHost, markRect, onPointerMove, openPanel, place, placeMarks, queueLayout, resizeWatch, updatePill };
}
