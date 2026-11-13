// The loop player. Site specifics come from the adapter (src/adapters/), saved data from the store
// (src/core/store.js), the loop rules from src/core/engine.js. This file only wires the parts in
// src/app/ together and starts them:
//   core.js      shared state and small helpers
//   tracking.js  which media is loaded, its duration
//   run.js       turning playback around, arm / stop, frame scheduling
//   edit.js      changing the loops
//   render.js    drawing the state
//   controls.js  building the panel and its events
//   layout.js    placement of the panel, overlay and markers; mounting into the site
//   hotkeys.js   keyboard shortcuts
//   wave.js      the waveform, built from what is heard while playing

import { LIGHT_CSS } from './ui/styles.js';
import { createCore } from './app/core.js';
import { createTracking } from './app/tracking.js';
import { createRun } from './app/run.js';
import { createEdit } from './app/edit.js';
import { createRender } from './app/render.js';
import { createControls } from './app/controls.js';
import { createLayout } from './app/layout.js';
import { createHotkeys } from './app/hotkeys.js';
import { createWave } from './app/wave.js';

export function start(adapter, store) {
  // Every part adds its functions to A and reaches the others through it, once all are created.
  const A = createCore(adapter, store);
  for (const make of [createTracking, createRun, createEdit, createRender, createControls, createLayout, createHotkeys, createWave]) {
    Object.assign(A, make(A));
  }
  const { S, floating } = A;
  const { buildUI, render, ensure, syncVideo, scheduleSync, wake, kick, onHotkey, queueLayout, onPointerMove, updatePill } = A;

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  if (!floating) { // the button and the markers live in the site's own DOM
    const style = document.createElement('style');
    style.id = 'lsm-style';
    style.textContent = LIGHT_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  buildUI();
  A.applyPos();
  render();
  ensure();
  syncVideo();

  // Safety net for whatever the site's events don't announce.
  setInterval(() => {
    if (document.hidden && !S.active) return; // nothing to keep current in a tab nobody is watching
    ensure();
    syncVideo();
    kick();
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    ensure();
    S.dirty = true;
    scheduleSync();
    wake();
  });

  for (const t of adapter.navEvents || []) {
    document.addEventListener(t, () => {
      ensure();
      S.dirty = true;
      scheduleSync();
    });
  }
  document.addEventListener('fullscreenchange', () => {
    if (floating) queueLayout();
    else if (S.open) requestAnimationFrame(A.place);
  });
  if (floating) {
    window.addEventListener('scroll', queueLayout, { capture: true, passive: true });
    window.addEventListener('resize', queueLayout, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
    for (const t of ['play', 'pause']) document.addEventListener(t, () => setTimeout(updatePill, 0), true);
  }
  if (adapter.init) {
    adapter.init(() => {
      ensure();
      S.dirty = true;
      scheduleSync();
    });
  }
  window.addEventListener('keydown', onHotkey, true);
  window.addEventListener('pagehide', () => { store.flush(); });

  return { diagnostics: A.diagnostics };
}
