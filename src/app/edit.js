// Editing the loops: points, counts, adding, removing, selecting.

import { NEW_LOOP_LEN, MIN_LEN, FINE_MIN_LEN, MAX_LOOPS, MAX_COUNT, MAX_SETS, NAME_MAX, AFTER } from '../core/constants.js';
import { clamp, roundT } from '../core/util.js';
import * as E from '../core/engine.js';
import * as V from '../core/view.js';
import { clampRate, readRamp, RATE_STEP, MAX_GAP, MAX_COUNT_IN } from '../core/practice.js';

export function createEdit(A) {
  const { S, P, ui, cur, fitView, fmtT, freeColor, isAd, isDefaultSet, newLoop, ready, rememberLoops, rememberPrefs } = A;

  function setPoint(which, value, push) {
    if (!ready() || !isFinite(value)) return;
    const l = cur();
    const { a, b } = E.movePoint(l, which, value, push, S.duration, A.digits());
    if (a !== l.a || b !== l.b) {
      l.a = a;
      l.b = b;
      S.lastT = null;
      rememberLoops();
    }
    A.render();
  }

  // Moves the whole loop so it starts at `start` (dragging the bar), keeping its length.
  function moveWhole(start) {
    if (!ready()) return;
    const l = cur();
    const { a, b } = E.moveLoop(l, start, S.duration, A.digits());
    if (a !== l.a || b !== l.b) {
      l.a = a;
      l.b = b;
      S.lastT = null;
      rememberLoops();
    }
    A.render();
  }

  function markNow(which) {
    A.syncVideo();
    if (!ready() || !S.trusted || isAd()) {
      A.toast('Not available right now');
      return;
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

  // How many times the whole set of loops plays (1 = once).
  function setSets(n) {
    P.sets = clamp(Math.round(n) || 1, 1, MAX_SETS);
    P.setsForever = false;
    rememberPrefs();
    A.render();
  }

  function setSetsForever(on) {
    P.setsForever = !!on;
    rememberPrefs();
    A.render();
  }

  // Times to hundredths of a second, for short loops and exact entry points.
  function setFine(on) {
    P.fine = !!on;
    rememberPrefs();
    A.render();
    A.toast(P.fine ? 'Times to hundredths of a second' : 'Times to tenths of a second');
  }

  /* Practice: speed per loop, the ramp, the gap between repetitions, the count-in. */

  // Puts the selected loop's speed in force now if it is the one playing.
  function applyRateNow() {
    S.rateLoop = null;
    A.wake();
  }

  // One step (5%) up or down from the loop's speed, or from the player's own when it has none.
  function stepRate(dir) {
    if (!ready()) return;
    const l = cur();
    const from = Number.isFinite(l.rate) ? l.rate : (S.video && S.video.playbackRate) || 1;
    l.rate = clampRate(from + dir * RATE_STEP);
    P.rate = l.rate;
    rememberPrefs();
    rememberLoops();
    applyRateNow();
    A.render();
  }

  // The loop goes back to the player's own speed.
  function clearRate() {
    if (!ready()) return;
    delete cur().rate;
    P.rate = null;
    rememberPrefs();
    rememberLoops();
    if (S.active) A.restoreRate();
    A.render();
  }

  function setRamp(patch) {
    P.ramp = readRamp({ ...P.ramp, ...patch });
    rememberPrefs();
    applyRateNow();
    A.render();
  }

  function setGap(sec) {
    P.gap = Math.min(MAX_GAP, Math.max(0, Math.round(sec * 2) / 2));
    rememberPrefs();
    A.render();
  }

  function setCountIn(sec) {
    P.countIn = Math.min(MAX_COUNT_IN, Math.max(0, Math.round(sec)));
    rememberPrefs();
    A.render();
  }

  function setTick(on) {
    P.tick = !!on;
    rememberPrefs();
    A.render();
  }

  function togglePractice() {
    P.practiceOpen = !P.practiceOpen;
    rememberPrefs();
    A.render();
  }

  // The waveform behind the slider.
  function setWave(on) {
    P.wave = !!on;
    rememberPrefs();
    A.render();
  }

  // Whether the small strip shows while looping with the editor closed.
  function setStrip(on) {
    P.strip = !!on;
    rememberPrefs();
    A.render();
  }

  function setAfter(v) {
    P.after = AFTER.includes(v) ? v : 'continue';
    rememberPrefs();
    A.render();
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
  function addLoopAfter() {
    syncAndCheck();
    if (!ready()) return;
    if (S.loops.length >= MAX_LOOPS) {
      A.toast(`${MAX_LOOPS} loops is the maximum`);
      return;
    }
    const l = cur();
    const d = S.duration;
    if (l.b >= d - minLen()) {
      A.toast('No room after this loop');
      return;
    }
    const len = Math.min(l.b - l.a, d - l.b);
    const added = newLoop(l.b, roundT(l.b + len, A.digits()), freeColor());
    added.infinite = false;
    S.loops.push(added);
    S.sel = S.loops.length - 1;
    A.hideTip();
    if (S.zoom) fitView();
    rememberLoops();
    A.render();
    A.replay(ui.chips[S.sel].root, 'lsm-new');
  }

  const syncAndCheck = () => A.syncVideo();

  // Tap to mark: each press while playing ends the section that began at the previous press and
  // starts the next one. The first press only marks a start.
  function tapMark() {
    A.syncVideo();
    if (!ready() || !S.trusted || isAd()) {
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
    let l;
    if (isDefaultSet()) {
      l = cur();
      l.a = from;
      l.b = t;
    } else {
      if (S.loops.length >= MAX_LOOPS) {
        A.toast(`${MAX_LOOPS} loops is the maximum`);
        return;
      }
      l = newLoop(from, t, freeColor());
      l.infinite = false;
      S.loops.push(l);
      S.sel = S.loops.length - 1;
    }
    S.tap = t;
    if (S.zoom) fitView();
    rememberLoops();
    A.render();
    A.replay(ui.chips[S.sel].root, 'lsm-new');
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
    if (!ready()) return;
    if (S.loops.length >= MAX_LOOPS) {
      A.toast(`${MAX_LOOPS} loops is the maximum`);
      return;
    }
    const d = S.duration;
    const len = Math.min(NEW_LOOP_LEN, d);
    let a = S.trusted && !isAd() ? S.video.currentTime : cur().b;
    a = clamp(roundT(a, A.digits()), 0, Math.max(0, d - len));
    let b = roundT(a + len, A.digits());
    if (b > d - 0.1) b = d;
    const added = newLoop(a, b, freeColor());
    added.infinite = false; // an endless loop would keep the ones after it from ever playing
    S.loops.push(added);
    S.sel = S.loops.length - 1;
    A.hideTip();
    if (S.zoom) fitView();
    rememberLoops();
    A.render();
    A.replay(ui.chips[S.sel].root, 'lsm-new');
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

  const UNDO = { label: 'Undo', run: () => undo() };

  // Deletes the selected loop. The last one left goes back to the whole video.
  function removeLoop() {
    if (!ready()) return;
    if (S.loops.length === 1) {
      clearAll();
      return;
    }
    const n = S.sel + 1;
    snapshot();
    S.loops.splice(S.sel, 1);
    S.sel = Math.min(S.sel, S.loops.length - 1);
    A.hideTip();
    if (S.zoom) fitView();
    A.settleRun();
    rememberLoops();
    A.render();
    A.toast(`Loop ${n} removed`, UNDO);
  }

  function resetAll() {
    S.active = false;
    S.lastT = null;
    S.zoom = false;
    S.sel = 0;
    A.hideTip();
    if (S.ranged) {
      S.loops = [newLoop(0, S.duration, 0)];
      rememberLoops();
    }
    A.render();
  }

  // Removes every loop (back to the whole video, looping off). Can be undone.
  function clearAll() {
    if (!ready()) return;
    const had = S.loops.length;
    snapshot();
    resetAll();
    A.toast(had > 1 ? 'All loops removed' : 'Loop reset', UNDO);
  }

  return { addLoop, addLoopAfter, centerView, chainEnd, chainStart, clearAll, markNow, panView, tapMark, zoomView, moveWhole, removeLoop, resetAll, undo, selectLoop, setAfter, setCount, setFine, setInfinite, setName, setPoint, sortLoops, setStrip, setWave, stepRate, clearRate, setRamp, setGap, setCountIn, setTick, togglePractice, setSets, setSetsForever, setZoom, toggleLoop, toggleLoopAt };
}
