// Editing the loops: points, counts, adding, removing, selecting.

import { NEW_LOOP_LEN, MIN_LEN, FINE_MIN_LEN, MAX_LOOPS, MAX_COUNT, MAX_SETS, NAME_MAX, BETWEEN, ENDS } from '../core/constants.js';
import { clamp, roundT } from '../core/util.js';
import * as E from '../core/engine.js';
import * as V from '../core/view.js';

export function createEdit(A) {
  const { S, P, ui, cur, fitView, fmtT, freeColor, isAd, mediaOk, newLoop, ready, rememberLoops, rememberPrefs } = A;

  // Gives the selected loop a new start and end (saved only when they changed).
  function applyRange({ a, b }) {
    const l = cur();
    if (a !== l.a || b !== l.b) {
      l.a = a;
      l.b = b;
      S.lastT = null;
      rememberLoops();
    }
    A.render();
  }

  function setPoint(which, value, push) {
    if (!ready() || !isFinite(value)) return;
    applyRange(E.movePoint(cur(), which, value, push, S.duration, A.digits()));
  }

  // Moves the whole loop so it starts at `start` (dragging the bar), keeping its length.
  function moveWhole(start) {
    if (!ready()) return;
    applyRange(E.moveLoop(cur(), start, S.duration, A.digits()));
  }

  // With no loop yet, the first mark creates one: from here to the end (A), or from the start to here (B).
  function markNow(which) {
    A.syncVideo();
    if (!mediaOk() || !S.trusted || isAd()) {
      A.toast('Not available right now');
      return;
    }
    if (!S.loops.length) {
      pushLoop(newLoop(0, S.duration, freeColor()));
      showNew();
    }
    setPoint(which, S.video.currentTime, true);
    A.replay(ui.field[which].now, 'lsm-flash');
    if (!S.open) A.toast(`${which === 'a' ? 'Start' : 'End'} set to ${fmtT(cur()[which])}`);
  }

  function setCount(n) {
    if (!ready()) return;
    const l = cur();
    l.count = clamp(Math.round(n) || 1, 1, MAX_COUNT);
    l.infinite = false;
    P.count = l.count;
    P.infinite = false;
    A.settleRun();
    rememberPrefs();
    rememberLoops();
    A.render();
  }

  function setInfinite(on) {
    if (!ready()) return;
    cur().infinite = !!on;
    P.infinite = !!on;
    A.settleRun();
    rememberPrefs();
    rememberLoops();
    A.render();
  }

  const prefChanged = () => {
    rememberPrefs();
    A.render();
  };

  // How many times the whole set of loops plays (1 = once).
  function setSets(n) {
    P.sets = clamp(Math.round(n) || 2, 2, MAX_SETS);
    P.setsForever = false;
    prefChanged();
  }

  function setSetsForever(on) {
    P.setsForever = !!on;
    prefChanged();
  }

  // Times to hundredths of a second, for short loops and exact entry points.
  function setFine(on) {
    P.fine = !!on;
    prefChanged();
    A.toast(P.fine ? 'Times to hundredths of a second' : 'Times to tenths of a second');
  }

  // Whether the small strip shows while looping with the editor closed.
  function setStrip(on) {
    P.strip = !!on;
    prefChanged();
  }

  // The ✕ on the strip: it goes away, looping carries on, and the message can bring it back.
  function hideStrip() {
    setStrip(false);
    A.toast('Strip hidden. Looping goes on.', { label: 'Show', run: () => setStrip(true) });
  }

  // Between loops: play on to the next loop, or jump straight to it.
  function setBetween(v) {
    P.between = BETWEEN.includes(v) ? v : 'play';
    prefChanged();
  }

  // After the last loop: play on, pause, play the whole set again, or go to the next track.
  function setEnd(v) {
    P.end = ENDS.includes(v) ? v : 'play';
    prefChanged();
  }

  // When media with saved loops loads: 'wait', turn looping 'on', or 'start' from the first loop.
  function setAuto(v) {
    P.autoOn = v === 'on' || v === 'start';
    P.autoStart = v === 'start';
    prefChanged();
  }

  // A loop that is switched off stays in the list (and stays saved) but is never played.
  // Switching one back on only arms it: the video doesn't move.
  function toggleLoop() {
    if (!ready()) return;
    const l = cur();
    l.on = !l.on;
    l.done = 0;
    l.skip = false;
    A.settleRun();
    rememberLoops();
    A.render();
  }

  // The dot on a chip: switches that loop on or off.
  function toggleLoopAt(i) {
    if (!ready() || i < 0 || i >= S.loops.length) return;
    if (i !== S.sel) selectLoop(i);
    toggleLoop();
  }

  function setName(i, text) {
    const l = S.loops[i];
    if (!l) return;
    const name = String(text).trim().slice(0, NAME_MAX);
    if (name) l.name = name;
    else delete l.name;
    rememberLoops();
    A.render();
  }

  // Numbers the loops in the order they play (by start time). Can be undone.
  function sortLoops() {
    if (!ready()) return;
    const sorted = E.sortedByStart(S.loops);
    if (sorted.every((l, i) => l === S.loops[i])) {
      A.toast('Already in order');
      return;
    }
    snapshot();
    const keep = cur();
    S.loops = sorted;
    S.sel = S.loops.indexOf(keep);
    rememberLoops();
    A.render();
    A.toast('Loops numbered by start time', UNDO);
  }

  // The magnifier: zoom on the selected loop, or back to the whole media.
  function setZoom(on) {
    S.zoom = !!on && ready();
    if (S.zoom) fitView();
    A.render();
  }

  const fullView = () => ({ v0: 0, v1: S.duration });
  const currentView = () => (S.zoom ? { v0: S.v0, v1: S.v1 } : fullView());

  // Mouse wheel on the slider: zoom in (factor > 1) or out around the time under the pointer.
  function zoomView(factor, anchor) {
    if (!ready()) return;
    A.setView(V.zoomAt(currentView(), S.duration, factor, anchor));
    A.render();
  }

  // Slides the zoomed window by `dt` seconds.
  function panView(dt) {
    if (!ready() || !S.zoom) return;
    A.setView(V.panBy(currentView(), S.duration, dt));
    A.render();
  }

  // Centres the zoomed window on a time (a press on the overview strip).
  function centerView(t) {
    if (!ready() || !S.zoom) return;
    A.setView(V.centerOn(currentView(), S.duration, t));
    A.render();
  }

  const minLen = () => (P.fine ? FINE_MIN_LEN : MIN_LEN);

  // True (and says so) when no more loops can be added.
  function atMax() {
    if (S.loops.length < MAX_LOOPS) return false;
    A.toast(`${MAX_LOOPS} loops is the maximum`);
    return true;
  }

  // Adds a loop and selects it. Never endless: it would keep the ones after it from ever playing.
  function pushLoop(l) {
    l.infinite = false;
    S.loops.push(l);
    S.sel = S.loops.length - 1;
    A.hideTip();
  }

  // After a loop was added or marked: zoom on it, save, and flash its chip.
  function showNew() {
    if (S.zoom) fitView();
    rememberLoops();
    A.render();
    A.replay(ui.chips[S.sel].root, 'lsm-new');
  }

  // Start right after the end of the loop before this one (in play order).
  function chainStart() {
    if (!ready()) return;
    const { prev } = V.neighbours(S.loops, S.sel);
    if (prev) setPoint('a', prev.b, false);
  }

  // End right where the next loop starts.
  function chainEnd() {
    if (!ready()) return;
    const { next } = V.neighbours(S.loops, S.sel);
    if (next) setPoint('b', next.a, false);
  }

  // A new loop of the same length, starting where the selected one ends.
  // A loop over the whole media.
  function addWhole() {
    A.syncVideo();
    if (!mediaOk() || atMax()) return;
    pushLoop(newLoop(0, S.duration, freeColor()));
    showNew();
  }

  function addLoopAfter() {
    A.syncVideo();
    if (!ready() || atMax()) return;
    const l = cur();
    const d = S.duration;
    if (l.b >= d - minLen()) {
      A.toast('No room after this loop');
      return;
    }
    const len = Math.min(l.b - l.a, d - l.b);
    pushLoop(newLoop(l.b, roundT(l.b + len, A.digits()), freeColor()));
    showNew();
  }

  // Tap to mark: each press while playing ends the section that began at the previous press and
  // starts the next one. The first press only marks a start.
  function tapMark() {
    A.syncVideo();
    if (!mediaOk() || !S.trusted || isAd()) {
      A.toast('Not available right now');
      return;
    }
    const t = roundT(S.video.currentTime, A.digits());
    const from = S.tap;
    if (from == null || t < from + minLen()) {
      S.tap = t;
      A.toast(`Start ${fmtT(t)} · tap again to end the section`);
      return;
    }
    if (atMax()) return;
    const l = newLoop(from, t, freeColor());
    pushLoop(l);
    S.tap = t;
    showNew();
    A.toast(`${A.loopLabel(l)} · ${fmtT(l.a)} → ${fmtT(l.b)} · tap again for the next section`);
  }

  // Clicking the loop that is already selected jumps to its start.
  function selectLoop(i) {
    if (!ready() || i < 0 || i >= S.loops.length) return;
    if (i === S.sel) {
      if (S.trusted && !isAd()) A.seekTo(cur().a);
      return;
    }
    S.sel = i;
    A.hideTip();
    if (S.zoom) fitView();
    A.render();
  }

  // New loops start at the current playback position.
  function addLoop() {
    A.syncVideo();
    if (!mediaOk() || atMax()) return;
    const d = S.duration;
    const len = Math.min(NEW_LOOP_LEN, d);
    let a = S.trusted && !isAd() ? S.video.currentTime : cur() ? cur().b : 0;
    a = clamp(roundT(a, A.digits()), 0, Math.max(0, d - len));
    let b = roundT(a + len, A.digits());
    if (b > d - 0.1) b = d;
    pushLoop(newLoop(a, b, freeColor()));
    showNew();
  }

  /* Undo: what a delete or clear took away comes back. Kept per video, newest last. */

  function snapshot() {
    S.undo.push({ loops: E.serializeLoops(S.loops), sel: S.sel });
    if (S.undo.length > 20) S.undo.shift();
  }

  function undo() {
    const snap = S.undo.pop();
    const loops = snap && E.loopsFromSaved({ loops: snap.loops }, P);
    if (!loops || !S.ranged) {
      A.toast('Nothing to undo');
      return;
    }
    E.clampLoops(loops, S.duration);
    S.loops = loops;
    S.sel = clamp(snap.sel, 0, loops.length - 1);
    S.lastT = null;
    A.hideTip();
    if (S.zoom) fitView();
    A.settleRun();
    rememberLoops();
    A.render();
    A.toast('Undone');
  }

  const UNDO = { label: 'Undo', run: undo };

  // Deletes the selected loop. Can be undone.
  function removeLoop() {
    if (!ready()) return;
    const n = S.sel + 1;
    snapshot();
    S.loops.splice(S.sel, 1);
    S.sel = Math.max(0, Math.min(S.sel, S.loops.length - 1));
    A.hideTip();
    if (!S.loops.length) S.zoom = false;
    else if (S.zoom) fitView();
    A.settleRun();
    rememberLoops();
    A.render();
    A.toast(S.loops.length ? `Loop ${n} removed` : 'Loop removed', UNDO);
  }

  // Removes every loop (looping turns off). Can be undone.
  function clearAll() {
    if (!ready()) return;
    const had = S.loops.length;
    snapshot();
    S.loops = [];
    S.sel = 0;
    S.zoom = false;
    A.hideTip();
    A.settleRun();
    rememberLoops();
    A.render();
    A.toast(had > 1 ? 'All loops removed' : 'Loop removed', UNDO);
  }

  return { addLoop, addLoopAfter, addWhole, centerView, chainEnd, chainStart, clearAll, markNow, panView, tapMark, zoomView, moveWhole, removeLoop, undo, selectLoop, setAuto, setBetween, setEnd, setCount, setFine, setInfinite, setName, setPoint, sortLoops, setStrip, hideStrip, setSets, setSetsForever, setZoom, toggleLoopAt };
}
