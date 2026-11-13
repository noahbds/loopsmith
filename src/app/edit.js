// Editing the loops: points, counts, adding, removing, selecting.

import { NEW_LOOP_LEN, MAX_LOOPS, MAX_COUNT, AFTER } from '../core/constants.js';
import { clamp, round1 } from '../core/util.js';
import * as E from '../core/engine.js';

export function createEdit(A) {
  const { S, P, ui, cur, fitView, fmtT, freeColor, isAd, newLoop, ready, rememberLoops, rememberPrefs } = A;

  function setPoint(which, value, push) {
    if (!ready() || !isFinite(value)) return;
    const l = cur();
    const { a, b } = E.movePoint(l, which, value, push, S.duration);
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
    A.settleRun();
    rememberLoops();
    A.render();
  }

  function setZoom(on) {
    S.zoom = !!on && ready();
    if (S.zoom) fitView();
    A.render();
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
    a = clamp(round1(a), 0, Math.max(0, d - len));
    let b = round1(a + len);
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

  function removeLoop() {
    if (!ready()) return;
    if (S.loops.length === 1) {
      resetAll();
      return;
    }
    S.loops.splice(S.sel, 1);
    S.sel = Math.min(S.sel, S.loops.length - 1);
    A.hideTip();
    if (S.zoom) fitView();
    A.settleRun();
    rememberLoops();
    A.render();
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

  return { addLoop, markNow, removeLoop, resetAll, selectLoop, setAfter, setCount, setInfinite, setPoint, setZoom, toggleLoop };
}
