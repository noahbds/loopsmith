// Running the loops: turning playback around, arming and stopping, and the frame scheduling.

import * as E from '../core/engine.js';

export function createRun(A) {
  const { S, P, ui, adapter, cur, describe, isAd, ready, rememberLoops, skipped } = A;

  function play() {
    const v = S.video;
    if (!v) return;
    try {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* ignore */ }
  }

  function seekTo(t) {
    const v = S.video;
    if (!v) return;
    S.lastT = null;
    try {
      // Some players (Spotify) must seek through their own controls to stay in step.
      if (adapter.seek) adapter.seek(v, t, S.player);
      else v.currentTime = t;
    } catch (_) { /* ignore */ }
  }

  // A loop that runs to the end of the video turns around this much early, so the player
  // never reaches "ended" (which would trigger autoplay). Hidden tabs only get coarse timing.
  function turnGuard() {
    const rate = (S.video && S.video.playbackRate) || 1;
    const base = document.hidden ? 0.1 + 0.3 * rate : 0.25;
    // Music sites move on to the next track a little before the real end (gapless playback).
    return Math.max(base, adapter.endGuard || 0);
  }

  const loopEnd = (l, guard = turnGuard()) => E.loopEnd(l, S.duration, guard);
  const loopAt = (t, guard = turnGuard()) => E.loopAt(S.loops, t, S.duration, guard);
  const nextLoop = (t) => E.nextLoop(S.loops, t);

  // Loops are markers on the timeline: when playback runs into the end of one that is switched on
  // and still has repeats left, it goes back to that loop's start. Seeking by hand never counts.
  function check() {
    if (S.dirty || location.href !== S.href) A.syncVideo();
    const v = S.video;
    if (!S.active || !v) return;
    if (!S.trusted || !S.ranged || isAd() || v.readyState < 1 || v.seeking || !(v.duration > 0)) {
      S.lastT = null;
      return;
    }
    if (Math.abs(v.duration - S.duration) > 0.5) { // different media than expected: re-identify first
      S.dirty = true;
      S.lastT = null;
      return;
    }
    const t = v.currentTime;
    const prev = S.lastT;
    S.lastT = t;
    // Seeks reset lastT (onSeeking), so anything left is forward playback; the bound is a sanity check.
    if (prev === null || t <= prev || t - prev > Math.max(2, v.playbackRate * 2)) return;
    const step = E.advance(S.loops, prev, t, { duration: S.duration, guard: turnGuard(), after: P.after });
    if (!step) return;
    if (step.finish) {
      finishRun();
      return;
    }
    if (step.seek != null) seekTo(step.seek);
    A.render();
    if (step.repeat) A.replay(ui.badge, 'lsm-pop');
  }

  // Counts one play for each loop that just ended; goes back to the start of the
  // first one (inner loops first) that still has plays left.
  function turnAround(crossed, fromEnded) {
    const l = E.countCrossed(crossed);
    if (!l) return false;
    seekTo(l.a);
    if (fromEnded) play();
    A.render();
    A.replay(ui.badge, 'lsm-pop');
    return true;
  }

  function finishRun() {
    const on = S.loops.filter((l) => l.on);
    const single = on.length === 1 ? on[0] : null;
    S.active = false;
    S.lastT = null;
    E.resetRun(S.loops);
    if (P.after !== 'continue' && S.video && !S.video.paused) S.video.pause();
    A.render();
    A.toast(single ? `Loop finished · played ${single.count}×` : 'Loops finished', { label: 'Run again', run: runAgain });
  }

  // The video reached its very end before the regular check caught it.
  function onEnded() {
    if (!S.active || !S.trusted || !S.ranged || isAd()) return;
    const tail = S.loops.filter((l) => !skipped(l) && l.b >= S.duration - 1);
    if (tail.length && turnAround(tail, true)) return;
    finishRun();
  }

  // Turns looping on, every count starting over. At least one loop has to be switched on:
  // the selected one is, when `needSel` asks for it or when none are.
  function arm(needSel) {
    A.commitEdits();
    A.syncVideo();
    if (!ready()) {
      A.toast(S.live ? 'Live streams can’t be looped' : 'The video isn’t ready yet');
      return false;
    }
    if ((needSel || !S.loops.some((l) => l.on)) && !cur().on) {
      cur().on = true;
      rememberLoops();
    }
    E.resetRun(S.loops);
    S.active = true;
    S.lastT = null;
    return true;
  }

  // Enabling: looping is on from here, but playback is left alone. The loops act
  // when the playhead runs into them.
  function armRun() {
    if (!arm(false)) return;
    A.render();
    wake();
    if (!S.open) {
      const on = S.loops.filter((l) => l.on);
      A.toast(on.length > 1 ? `Looping ${on.length} sections` : `Looping ${describe(on[0])}`);
    }
  }

  // Starting: plays the selected loop from its beginning (which needs looping to be on).
  function startLoop() {
    if (!arm(true)) return;
    const v = S.video;
    if (S.trusted && !isAd()) {
      seekTo(cur().a);
      if (v.paused || v.ended) play();
    }
    A.render();
    wake();
    if (!S.open) A.toast(`${S.loops.length > 1 ? `Loop ${S.sel + 1}` : 'Loop'} · ${describe(cur())}`);
  }

  function stopRun() {
    if (!S.active) return;
    S.active = false;
    S.lastT = null;
    E.resetRun(S.loops);
    A.render();
    if (!S.open) A.toast('Looping off');
  }

  // The loop the skip / previous / restart actions work on: the one in charge at the playhead.
  const inCharge = () => (S.trusted && S.video ? loopAt(S.video.currentTime) : null);

  // Carries out what an engine action decided: seek, show which loop is now in play, say what happened.
  function follow(step, { play: andPlay = false, say = '' } = {}) {
    if (step.finish) {
      finishRun();
      return;
    }
    if (step.seek != null) seekTo(step.seek);
    const l = step.repeat || step.next || step.prev || step.goto || step.restart || null;
    if (l) {
      const i = S.loops.indexOf(l);
      if (i >= 0 && i !== S.sel) {
        S.sel = i;
        A.hideTip();
        if (S.zoom) A.fitView();
      }
    }
    if (andPlay && S.video && (S.video.paused || S.video.ended)) play();
    A.render();
    wake();
    if (step.repeat || step.restart) A.replay(ui.badge, 'lsm-pop');
    if (say) A.toast(say);
  }

  const loopNo = (l) => (S.loops.length > 1 ? `Loop ${S.loops.indexOf(l) + 1}` : 'Loop');

  // Skip a repetition or a loop, go back, restart, or jump to loop `arg` (an index). Looping is
  // turned on first if it is off, since these act on the run.
  function navigate(kind, arg) {
    A.commitEdits();
    A.syncVideo();
    if (!ready() || !S.trusted || isAd()) {
      A.toast('Not available right now');
      return;
    }
    if (!S.active && !arm(false)) return;
    const t = S.video.currentTime;
    const opts = { duration: S.duration, guard: turnGuard(), after: P.after };
    const target = inCharge();
    let step = null;
    let say = '';
    let miss = 'Not inside a loop';
    switch (kind) {
      case 'skipRep':
        step = E.skipRep(S.loops, target, opts);
        say = 'Repetition skipped';
        break;
      case 'skipLoop':
        step = E.skipLoop(S.loops, target, t, opts);
        say = step && step.next ? `${loopNo(step.next)} · ${describe(step.next)}` : 'Loop skipped';
        break;
      case 'prev':
        step = E.prevLoop(S.loops, target, t);
        say = step && step.prev ? `Back to ${loopNo(step.prev).toLowerCase()}` : 'Restarted';
        miss = 'Nothing before this';
        break;
      case 'restart':
        step = E.restartRep(target);
        say = 'Restarted';
        break;
      case 'goto':
        step = E.gotoLoop(S.loops[arg]);
        if (step) say = `${loopNo(step.goto)} · ${describe(step.goto)}`;
        miss = `No loop ${Number(arg) + 1}`;
        break;
    }
    if (!step) {
      A.toast(miss);
      return;
    }
    if (kind === 'goto') rememberLoops(); // it may have switched the loop on
    follow(step, { play: kind === 'goto', say: S.open && kind !== 'goto' ? '' : say });
  }

  // From the top: every count starts over, playback goes to the first loop that is switched on.
  function runAgain() {
    if (!arm(false)) return;
    const first = S.loops.filter((l) => l.on).sort((x, y) => x.a - y.a)[0];
    const step = E.gotoLoop(first);
    if (step && S.trusted && !isAd()) follow(step, { play: true });
    else A.render();
  }

  // After an edit during a run: if nothing is left to play, looping turns itself off.
  function settleRun() {
    if (S.active && !S.loops.some((l) => !skipped(l))) {
      S.active = false;
      E.resetRun(S.loops);
    }
  }

  const IDLE_MS = 250;
  const TURN_LEAD = 0.75; // seconds of real time before a loop's end at which frames take over
  let raf = 0;
  let idle = 0;

  function wantsFrames() {
    const v = S.video;
    if (!v || v.paused || v.ended || document.hidden) return false;
    if (S.open || A.stripWanted()) return true;
    if (!S.active) return false;
    const t = v.currentTime;
    const lead = TURN_LEAD * (v.playbackRate || 1);
    const guard = turnGuard();
    for (const l of S.loops) {
      if (skipped(l)) continue;
      const left = loopEnd(l, guard) - t;
      if (left >= 0 && left <= lead) return true;
    }
    return false;
  }

  function kick() {
    if (raf || idle || !(S.active || S.open)) return;
    if (wantsFrames()) raf = requestAnimationFrame(frame);
    else idle = setTimeout(frame, IDLE_MS);
  }

  function frame() {
    raf = 0;
    idle = 0;
    check();
    A.renderLive();
    kick();
  }

  // Something changed (play, pause, seek, panel opened…): don't wait for the slow timer.
  function wake() {
    if (raf || !(S.active || S.open)) return;
    clearTimeout(idle);
    frame();
  }

  return { IDLE_MS, TURN_LEAD, arm, armRun, navigate, runAgain, check, finishRun, frame, kick, loopAt, loopEnd, nextLoop, onEnded, play, seekTo, settleRun, startLoop, stopRun, turnAround, turnGuard, wake, wantsFrames };
}
