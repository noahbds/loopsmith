// The shared state and small helpers every other part of the app builds on.

import { MAX_COUNT, MAX_SETS, PALETTE, BETWEEN, ENDS } from '../core/constants.js';
import { clamp, fmt } from '../core/util.js';
import * as E from '../core/engine.js';
import * as V from '../core/view.js';

// Before 1.4 one "when done" choice covered both: continue = play / play, next = jump / pause,
// pause = play / pause; and playing the set again was a separate number of rounds (1 = once).
function legacyEnd(prefs) {
  if (prefs.setsForever === true || Number(prefs.sets) > 1) return 'repeat';
  return prefs.after === 'next' || prefs.after === 'pause' ? 'pause' : 'play';
}

// The settings as stored, read back with every value checked.
function readPrefs(prefs) {
  return {
    count: clamp(Math.round(Number(prefs.count)) || 5, 1, MAX_COUNT),
    infinite: prefs.infinite === true,
    between: BETWEEN.includes(prefs.between) ? prefs.between : prefs.after === 'next' ? 'jump' : 'play',
    end: ENDS.includes(prefs.end) ? prefs.end : legacyEnd(prefs),
    strip: prefs.strip !== false,   // show the small strip while looping with the editor closed
    fine: prefs.fine === true,      // times to hundredths of a second
    hintSeen: prefs.hintSeen === true,
    sets: clamp(Math.round(Number(prefs.sets)) || 2, 2, MAX_SETS), // rounds when the set plays again
    setsForever: prefs.setsForever === true,
    autoOn: prefs.autoOn === true,  // turn looping on by itself when media with saved loops loads
    autoStart: prefs.autoStart === true, // ...and play from the first loop's start
    pos: prefs.pos && typeof prefs.pos === 'object' ? prefs.pos : {}, // dragged offset of the panel, per site
  };
}

export function createCore(adapter, store) {
  // Defaults for new loops + the settings for all loops. Kept in step with other tabs (see app.js).
  const P = readPrefs(store.getPrefs());

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
    round: 1,        // which time through the whole set of loops this run is on
    tap: null,       // tap to mark: the time of the last mark (the start of the section being tapped)
    undo: [],        // snapshots of the loops before a delete or clear, newest last
    active: false,   // looping is on: the loops that are switched on turn playback around
    lastT: null,     // previous playback position seen by the loop check
    open: false,
    sliding: false,  // a slider handle is held down
    zoom: false,     // the slider shows only part of the media (v0..v1)
    panned: false,   // the user moved the window by hand: don't snap it back to the loop
    v0: 0,
    v1: 0,
    laneW: 0,        // slider width in CSS pixels (measured when the panel is placed)
    dpr: 1,
    pos: { dx: 0, dy: 0 }, // how far the panel was dragged from its usual place
  };
  const saved = P.pos[adapter.id];
  if (saved && Number.isFinite(saved.dx) && Number.isFinite(saved.dy)) S.pos = { dx: saved.dx, dy: saved.dy };

  const ui = { field: {}, thumb: {}, chips: [], ghosts: [], marks: [], miniTicks: [] };
  // Floating mode (sites without a control bar to join): the panel, toast and a small loop button
  // sit in an overlay laid over the video, or docked bottom-right for audio and small videos.
  const floating = !!adapter.floating;
  // Whether the user has been playing this media (generic pages: only then do the hotkeys act).
  const engaged = (p) => (adapter.engaged ? adapter.engaged(p) : true);
  const focused = () => (ui.shadow && ui.shadow.activeElement) || document.activeElement;

  // The media can have loops (known length, not live); ready: and it has at least one.
  const mediaOk = () => !!S.video && S.ranged && !S.live;
  const ready = () => mediaOk() && S.loops.length > 0;
  const cur = () => S.loops[S.sel];
  const digits = () => (P.fine ? 2 : 1); // decimals of a second that times are kept to
  const fineStep = () => 10 ** -digits(); // the smallest step: 0.1 s, or 0.01 s in fine mode
  const fmtT = (sec) => fmt(sec, S.duration >= 3600, digits());
  // "Loop 2" (or its name); just "Loop" when there is only one.
  const loopLabel = (l) => l.name || (S.loops.length > 1 ? `Loop ${S.loops.indexOf(l) + 1}` : 'Loop');
  // Whether the set of loops plays again once the last loop is done.
  const moreRounds = () => P.end === 'repeat' && (P.setsForever || S.round < P.sets);
  // "Round 2/3" or "Round 2" (endless); empty when the set only plays once.
  const roundText = () => (P.end !== 'repeat' ? '' : P.setsForever ? ` · round ${S.round}` : ` · round ${S.round}/${P.sets}`);
  // What the loop engine needs to know for a step.
  const runOpts = (guard) => ({ duration: S.duration, guard, after: P.between === 'jump' ? 'next' : 'continue' });
  // The small strip shows while looping with the editor closed.
  const stripWanted = () => S.active && !S.open && P.strip && ready() && S.trusted;
  const { finished, skipped } = E;
  const describe = (l) => `${fmtT(l.a)} → ${fmtT(l.b)} · ${l.infinite ? '∞' : l.count + '×'}`;
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

  // Zoomed in on the selected loop, with room around it.
  function fitView() {
    const v = V.fitLoop(cur(), S.duration);
    S.v0 = v.v0;
    S.v1 = v.v1;
    S.panned = false;
  }

  // The window the user zoomed or panned to (whole media when it covers all of it).
  function setView(v) {
    S.v0 = v.v0;
    S.v1 = v.v1;
    S.zoom = !V.isFull(v.v0, v.v1, S.duration);
    S.panned = true;
  }

  const isAd = () => adapter.isAd(S.player);
  // "video" or "track", for messages.
  const mediaWord = () => (adapter.dockOnly || (S.video && S.video.tagName === 'AUDIO') ? 'track' : 'video');

  function rememberLoops() {
    if (!S.videoId || !S.ranged) return;
    // t: last change. No loops left: an empty entry stays, so loops saved under a nearby key
    // (see savedEntry in tracking.js) are not copied back in.
    store.put(S.videoId, { loops: E.serializeLoops(S.loops), t: Date.now() });
  }

  function rememberPrefs() {
    store.setPrefs({ count: P.count, infinite: P.infinite, between: P.between, end: P.end, autoOn: P.autoOn, autoStart: P.autoStart, strip: P.strip, fine: P.fine, hintSeen: P.hintSeen, pos: P.pos, sets: P.sets, setsForever: P.setsForever });
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
      between: P.between,
      end: P.end,
      rounds: P.end !== 'repeat' ? 1 : P.setsForever ? 'forever' : P.sets,
      autoOn: P.autoOn,
      autoStart: P.autoStart,
    };
  }

  const L = { barPlaced: false }; // layout facts other parts read (the markers are placed on a bar)

  // Another tab changed the settings: take them, so this tab never writes back old values.
  function reloadPrefs() {
    Object.assign(P, readPrefs(store.getPrefs()));
  }

  return { adapter, store, S, P, ui, L, floating, reloadPrefs, diagnostics, cur, describe, digits, fineStep, engaged, finished, fitView, setView, fmtT, focused, freeColor, fromFrac, isAd, loopLabel, mediaOk, mediaWord, moreRounds, newLoop, ready, rememberLoops, rememberPrefs, roundText, runOpts, skipped, stripWanted, toPct, viewEnd, viewStart };
}
