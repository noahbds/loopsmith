// The shared state and small helpers every other part of the app builds on.

import { MAX_COUNT, PALETTE, AFTER } from '../core/constants.js';
import { clamp, fmt } from '../core/util.js';
import * as E from '../core/engine.js';

export function createCore(adapter, store) {
  const prefs = store.getPrefs();

  // Defaults for new loops + the "when done" choice.
  const P = {
    count: clamp(Math.round(Number(prefs.count)) || 5, 1, MAX_COUNT),
    infinite: prefs.infinite === true,
    after: AFTER.includes(prefs.after) ? prefs.after : 'continue',
  };

  const S = {
    player: null,
    video: null,
    videoId: null,   // "<adapter prefix>:<id>", the key loops are saved under
    href: '',
    trusted: false,  // the media in <video> is the video this state describes
    dirty: true,     // identity/duration must be re-checked before acting
    duration: 0,
    ranged: false,   // the loops are valid for the current video
    live: false,
    loops: [],       // [{ a, b, count, infinite, on (not switched off), c (palette index), done (plays completed this run) }]
    sel: 0,          // loop shown in the editor
    active: false,   // looping is on: the loops that are switched on turn playback around
    lastT: null,     // previous playback position seen by the loop check
    open: false,
    sliding: false,  // a slider handle is held down
    zoom: false,     // the slider shows only the area around the selected loop
    v0: 0,
    v1: 0,
    laneW: 0,        // slider width in CSS pixels (measured when the panel is placed)
    dpr: 1,
  };

  const ui = { field: {}, thumb: {}, chips: [], ghosts: [], marks: [] };
  // Floating mode (sites without a control bar to join): the panel, toast and a small loop button
  // sit in an overlay laid over the video, or docked bottom-right for audio and small videos.
  const floating = !!adapter.floating;
  // Whether the user has been playing this media (generic pages: only then do the hotkeys act).
  const engaged = (p) => (adapter.engaged ? adapter.engaged(p) : true);
  const focused = () => (ui.shadow && ui.shadow.activeElement) || document.activeElement;

  const ready = () => !!S.video && S.ranged && !S.live && S.loops.length > 0;
  const cur = () => S.loops[S.sel];
  const fmtT = (sec) => fmt(sec, S.duration >= 3600);
  const { exhausted, skipped } = E;
  const describe = (l) => `${fmtT(l.a)} → ${fmtT(l.b)} · ${l.infinite ? '∞' : l.count + '×'}`;
  const isDefaultSet = () => E.isDefaultSet(S.loops, S.duration);
  const newLoop = (a, b, c) => E.newLoop(a, b, c, P);

  function freeColor() {
    for (let i = 0; i < PALETTE.length; i++) if (!S.loops.some((l) => l.c === i)) return i;
    return S.loops.length % PALETTE.length;
  }

  // The slider maps to the whole video, or to a window around the selected loop when zoomed in.
  const viewStart = () => (S.zoom ? S.v0 : 0);
  const viewEnd = () => (S.zoom ? S.v1 : S.duration);
  const fromFrac = (f) => viewStart() + f * (viewEnd() - viewStart());

  function toPct(t) {
    const span = viewEnd() - viewStart();
    return span > 0 ? clamp((t - viewStart()) / span, 0, 1) * 100 : 0;
  }

  function fitView() {
    const l = cur();
    const pad = Math.max((l.b - l.a) * 0.4, 3);
    S.v0 = Math.max(0, Math.floor((l.a - pad) * 10) / 10);
    S.v1 = Math.min(S.duration, Math.ceil((l.b + pad) * 10) / 10);
  }

  const isAd = () => adapter.isAd(S.player);

  function rememberLoops() {
    if (!S.videoId || !S.ranged) return;
    store.put(S.videoId, isDefaultSet() ? null : { loops: E.serializeLoops(S.loops), t: Date.now() });
  }

  function rememberPrefs() {
    store.setPrefs({ count: P.count, infinite: P.infinite, after: P.after });
  }

  // What a bug report needs to know about this page. Nothing here leaves the browser unless the
  // user copies it from the popup (see src/popup/popup.js).
  function diagnostics() {
    let ad = false;
    try { ad = !!S.player && isAd(); } catch (_) { /* adapter can't tell */ }
    return {
      adapter: adapter.id,
      mode: floating ? 'floating' : 'in-player',
      frame: window.top === window.self ? 'top' : 'iframe',
      hasPlayer: !!S.player,
      hasMedia: !!S.video,
      mediaKey: S.videoId,
      duration: Math.round(S.duration * 10) / 10,
      trusted: S.trusted,
      ranged: S.ranged,
      live: S.live,
      ad,
      loops: S.loops.length,
      running: S.active,
      after: P.after,
    };
  }

  const L = { barPlaced: false }; // layout facts other parts read (the markers are placed on a bar)

  return { adapter, store, S, P, ui, L, floating, diagnostics, cur, describe, engaged, exhausted, fitView, fmtT, focused, freeColor, fromFrac, isAd, isDefaultSet, newLoop, ready, rememberLoops, rememberPrefs, skipped, toPct, viewEnd, viewStart };
}
