// Running the loops: turning playback around, arming and stopping, and the frame scheduling.

import * as E from '../core/engine.js';

export function createRun(A) {
  const { S, P, ui, adapter, cur, describe, isAd, moreRounds, ready, rememberLoops, skipped } = A;

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

  /* A pause before playing: the gap between repetitions, or the count-in before a loop starts. */

  function cancelWait() {
    if (S.waiting) clearTimeout(S.waiting.timer);
    S.waiting = null;
  }

  // Looping stops while the video is held between two plays: the music goes on instead of staying
  // silent (the pause was ours). A count-in that is cancelled leaves the video where it was.
  function stopWaiting() {
    const gap = S.waiting && S.waiting.kind === 'gap';
    cancelWait();
    if (gap) play();
  }

  function resume() {
    S.waiting = null;
    if (S.active) play();
  }

  // Waits `sec` seconds (the video is paused) and plays on.
  function pauseFor(sec) {
    const v = S.video;
    if (!v || v.paused || !(sec > 0)) return;
    cancelWait();
    const w = { kind: 'gap', until: Date.now() + sec * 1000, timer: 0, left: 0 };
    w.timer = setTimeout(resume, sec * 1000);
    S.waiting = w;
    v.pause();
  }

  // A short tick (the count-in). Its own audio context: it never touches the media.
  let beepCtx = null;
  function beep(freq) {
    try {
      beepCtx = beepCtx || new AudioContext();
      if (beepCtx.state === 'suspended') beepCtx.resume();
      const o = beepCtx.createOscillator();
      const g = beepCtx.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, beepCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, beepCtx.currentTime + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, beepCtx.currentTime + 0.09);
      o.connect(g).connect(beepCtx.destination);
      o.start();
      o.stop(beepCtx.currentTime + 0.1);
    } catch (_) { /* no audio available */ }
  }

  // Counts in (with ticks) from the loop start, then plays. False when the count-in is off.
  function startCountIn() {
    const v = S.video;
    const sec = P.countIn;
    if (!v || !(sec > 0)) return false;
    cancelWait();
    v.pause();
    let left = sec;
    const w = { kind: 'count', until: Date.now() + sec * 1000, timer: 0, left };
    S.waiting = w;
    const tick = () => {
      if (S.waiting !== w) return;
      if (left <= 0) {
        resume();
        return;
      }
      w.left = left;
      if (P.tick) beep(left === 1 ? 1320 : 880);
      left -= 1;
      w.timer = setTimeout(tick, 1000);
    };
    tick();
    return true;
  }

  // The user pressed play during a pause: they don't want to wait.
  function onPlay() {
    if (S.waiting && Date.now() < S.waiting.until - 150) cancelWait();
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

  // Loops are markers on the timeline: when playback runs into the end of the loop whose turn it is
  // (the one it is in that started first), it goes back to that loop's start while plays are left.
  // Seeking by hand never counts.
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
    if (prev === null || t <= prev || t - prev > Math.max(2, v.playbackRate * 2)) {
      return;
    }
    const step = E.advance(S.loops, prev, t, { duration: S.duration, guard: turnGuard(), after: P.after });
    if (!step) {
      return;
    }
    if (step.finish) {
      finishOrAgain();
      return;
    }
    if (step.seek != null) seekTo(step.seek);
    A.render();
    if (step.repeat) {
      A.replay(ui.badge, 'lsm-pop');
      if (P.gap > 0) pauseFor(P.gap);
    }
  }

  // The last loop is done: play the whole set again if more rounds are wanted, else finish.
  function finishOrAgain() {
    if (!moreRounds()) {
      finishRun();
      return;
    }
    const first = E.restartSet(S.loops);
    if (!first) {
      finishRun();
      return;
    }
    S.round += 1;
    S.lastT = null;
    seekTo(first.a);
    if (S.video && (S.video.paused || S.video.ended)) play();
    A.render();
    A.replay(ui.badge, 'lsm-pop');
    if (!S.open) A.toast(`Round ${S.round}${P.setsForever ? '' : ` of ${P.sets}`}`);
  }

  // Looping off: every count starts over and any pause is dropped (`resume`: the paused video plays on).
  function endRun(resume) {
    S.active = false;
    S.lastT = null;
    S.round = 1;
    E.resetRun(S.loops);
    if (resume) stopWaiting();
    else cancelWait();
  }

  function finishRun() {
    const on = S.loops.filter((l) => l.on);
    const single = on.length === 1 ? on[0] : null;
    const rounds = S.round;
    endRun(false);
    if (P.after !== 'continue' && S.video && !S.video.paused) S.video.pause();
    A.render();
    A.toast(rounds > 1 ? `Loops finished · ${rounds} rounds` : single ? `Loop finished · played ${single.count}×` : 'Loops finished', { label: 'Run again', run: runAgain });
  }

  // The video reached its very end before the regular check caught it: as if playback had just
  // run into the turn-around point of a loop that goes to the end.
  function onEnded() {
    if (!S.active || !S.trusted || !S.ranged || isAd()) return;
    const guard = turnGuard();
    const step = E.advance(S.loops, S.duration - guard - 0.05, S.duration, { duration: S.duration, guard, after: P.after });
    if (!step || step.seek == null) {
      finishOrAgain();
      return;
    }
    seekTo(step.seek);
    play();
    A.render();
    if (step.repeat) A.replay(ui.badge, 'lsm-pop');
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
    S.round = 1;
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
      if (!startCountIn() && (v.paused || v.ended)) play();
    }
    A.render();
    wake();
    if (!S.open) A.toast(`${S.loops.length > 1 ? `Loop ${S.sel + 1}` : 'Loop'} · ${describe(cur())}`);
  }

  function stopRun() {
    if (!S.active) return;
    endRun(true);
    A.render();
    if (!S.open) A.toast('Looping off');
  }

  // The loop the skip / previous / restart actions work on: the one in charge at the playhead.
  const inCharge = () => (S.trusted && S.video ? loopAt(S.video.currentTime) : null);

  // Carries out what an engine action decided: seek, show which loop is now in play, say what happened.
  function follow(step, { play: andPlay = false, countIn = false, say = '' } = {}) {
    if (step.finish) {
      finishOrAgain();
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
    if (andPlay && S.video && !(countIn && startCountIn()) && (S.video.paused || S.video.ended)) play();
    A.render();
    wake();
    if (step.repeat || step.restart) A.replay(ui.badge, 'lsm-pop');
    if (say) A.toast(say);
  }

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
        say = step && step.next ? `${A.loopLabel(step.next)} · ${describe(step.next)}` : 'Loop skipped';
        break;
      case 'prev':
        step = E.prevLoop(S.loops, target, t);
        say = step && step.prev ? `Back to ${A.loopLabel(step.prev)}` : 'Restarted';
        miss = 'Nothing before this';
        break;
      case 'restart':
        step = E.restartRep(target);
        say = 'Restarted';
        break;
      case 'goto':
        step = E.gotoLoop(S.loops[arg]);
        if (step) say = `${A.loopLabel(step.goto)} · ${describe(step.goto)}`;
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
    if (step && S.trusted && !isAd()) follow(step, { play: true, countIn: true });
    else A.render();
  }

  // After an edit during a run: if nothing is left to play, looping turns itself off.
  function settleRun() {
    if (S.active && !S.loops.some((l) => !skipped(l))) endRun(true);
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
    const guard = turnGuard();
    const l = loopAt(t, guard);
    return !!l && loopEnd(l, guard) - t <= TURN_LEAD * (v.playbackRate || 1);
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

  return { onPlay, cancelWait, armRun, navigate, check, kick, loopAt, loopEnd, nextLoop, onEnded, seekTo, settleRun, startLoop, stopRun, turnGuard, wake };
}
