// Running the loops: turning playback around, arming and stopping, and the frame scheduling.

import * as E from '../core/engine.js';
import { pressNextKey } from '../core/nextkey.js';

export function createRun(A) {
  const { S, P, ui, adapter, cur, describe, isAd, moreRounds, ready, rememberLoops, runOpts, skipped } = A;

  // Plays the media if it is paused (or has ended).
  function play() {
    const v = S.video;
    if (!v || !(v.paused || v.ended)) return;
    try {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* ignore */ }
  }

  // When Loopsmith itself last seeked. Its seeks go to a loop's start, so where the playhead lands
  // right after one never makes a loop "partly played" (the player may still report the old
  // position for a moment, which would stop that loop's plays from counting).
  let ownSeekAt = 0;
  let lastCheckAt = 0;

  function seekTo(t) {
    const v = S.video;
    if (!v) return;
    S.lastT = null;
    S.heldT = null;
    lastCheckAt = 0;
    ownSeekAt = Date.now();
    try {
      // Some players (YouTube Music, MusicKit sites) must seek through their own API to stay in step.
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

  // How far forward (seconds of media) the playhead may hop and still be the same pass.
  const HOP = 1.5;

  // Loops are markers on the timeline: when playback runs into the end of the loop whose turn it is
  // (the one it is in that started first), it goes back to that loop's start while plays are left.
  // Seeking by hand never counts as reaching the end; seeking within the loop that is playing
  // doesn't stop that pass from counting (see E.enter).
  function check() {
    if (S.dirty || location.href !== S.href) A.syncVideo();
    const v = S.video;
    if (!S.active || !v) return;
    if (!S.trusted || !S.ranged || isAd() || v.readyState < 1 || v.seeking || !(v.duration > 0)) {
      hold();
      return;
    }
    if (Math.abs(v.duration - S.duration) > 0.5) { // different media than expected: re-identify first
      S.dirty = true;
      S.lastT = null;
      return;
    }
    const now = Date.now();
    const elapsed = lastCheckAt ? now - lastCheckAt : 0;
    lastCheckAt = now;
    const t = v.currentTime;
    let prev = S.lastT;
    S.lastT = t;
    if (prev === null) {
      const held = S.heldT;
      S.heldT = null;
      const hopLimit = E.maxAdvance(v.playbackRate || 1, elapsed, document.hidden);
      if (held !== null && t >= held - 0.3 && t - held < Math.max(HOP * (v.playbackRate || 1), document.hidden ? hopLimit : 0)) {
        // Only a small hop forward from where it was (the player skipping a gap in its buffer, a
        // moment the media wasn't ready or couldn't be identified): still the same pass.
        prev = held;
      } else {
        // The playhead just landed here (a seek, or looping was just turned on): a loop it landed
        // in after its start, from outside it, is only partly played this time.
        if (now - ownSeekAt > 1500) E.enter(S.loops, t, S.duration, turnGuard(), held);
        return;
      }
    }
    // Seeks reset lastT (onSeeking), so anything left is forward playback; hidden tabs allow throttled timer intervals.
    if (t <= prev || t - prev > E.maxAdvance(v.playbackRate || 1, elapsed, document.hidden)) {
      return;
    }
    const step = E.advance(S.loops, prev, t, runOpts(turnGuard()));
    if (step) turn(step);
  }

  // Playback ran into the end of a loop: carry out what the engine decided.
  function turn(step, andPlay = false) {
    if (step.finish) {
      finishOrAgain();
      return;
    }
    if (step.seek != null) seekTo(step.seek);
    if (andPlay) play();
    followTurn();
    A.render();
    if (step.repeat) A.replay(ui.badge, 'lsm-pop');
  }

  // The check loses sight of the playhead (a seek it didn't make, the media not ready, an ad, the
  // media not identified yet): where it last was is kept, so a small hop forward from there still
  // counts as playback (see check). Spotify in Firefox hops like this during playback; treating
  // each hop as a jump into the loop made every pass "partly played", so none ever counted.
  function hold() {
    if (S.lastT !== null) S.heldT = S.lastT;
    S.lastT = null;
    lastCheckAt = 0;
  }

  // The editor follows the run: when another loop gets the turn, it becomes the selected loop
  // (unless something is being edited or dragged right then).
  let turnSeen = null;
  function followTurn() {
    const v = S.video;
    if (!S.active || !v || !S.trusted || S.sliding || A.editing()) return;
    const l = loopAt(v.currentTime);
    if (!l || l === turnSeen) return;
    turnSeen = l;
    const i = S.loops.indexOf(l);
    if (i < 0 || i === S.sel) return;
    S.sel = i;
    A.hideTip();
    if (S.zoom) A.fitView();
    A.render();
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
    play();
    A.render();
    A.replay(ui.badge, 'lsm-pop');
    if (!S.open) A.toast(`Round ${S.round}${P.setsForever ? '' : ` of ${P.sets}`}`);
  }

  // Looping off: every count starts over.
  function endRun() {
    S.active = false;
    S.lastT = null;
    S.round = 1;
    E.resetRun(S.loops);
  }

  function finishRun() {
    const on = S.loops.filter((l) => l.on);
    const single = on.length === 1 ? on[0] : null;
    const played = single ? single.done : 0; // fewer than its count when it was skipped
    const rounds = S.round;
    const word = A.mediaWord();
    endRun();
    if (P.end === 'next') {
      A.render();
      nextMedia();
      A.toast(`Loops finished · next ${word}`);
      return;
    }
    if (P.end !== 'play' && S.video && !S.video.paused) S.video.pause();
    A.render();
    A.toast(rounds > 1 ? `Loops finished · ${rounds} rounds` : single && played ? `Loop finished · played ${played}×` : single ? 'Loop finished' : 'Loops finished', { label: 'Run again', run: runAgain });
  }

  // "After the last: Next", best first: what the site does for the ⏭ media key, its own next
  // button, or else the end of the media, where the site's autoplay (if any) takes over.
  function nextMedia() {
    let pressed = false;
    try { pressed = pressNextKey() || !!(adapter.nextTrack && adapter.nextTrack(S.player)); } catch (_) { /* the site changed */ }
    if (pressed || !S.video || !(S.duration > 0)) return;
    seekTo(Math.max(0, S.duration - 0.05));
    play();
  }

  // The video reached its very end before the regular check caught it: as if playback had just
  // run into the turn-around point of a loop that goes to the end.
  function onEnded() {
    if (!S.active || !S.trusted || !S.ranged || isAd()) return;
    const guard = turnGuard();
    const step = E.advance(S.loops, S.duration - guard - 0.05, S.duration, runOpts(guard));
    if (!step || step.seek == null) finishOrAgain();
    else turn(step, true);
  }

  // Turns looping on, every count starting over. At least one loop has to be switched on:
  // the selected one is, when `needSel` asks for it or when none are.
  function arm(needSel) {
    A.commitEdits();
    A.syncVideo();
    if (!ready()) {
      A.toast(S.live ? 'Live streams can’t be looped' : A.mediaOk() ? 'Create a loop first' : `The ${A.mediaWord()} isn’t ready yet`);
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
    S.heldT = null;
    turnSeen = null;
    return true;
  }

  // Enabling: looping is on from here, but playback is left alone. The loops act
  // when the playhead runs into them.
  // `saved`: turned on by itself because the media came with saved loops.
  function armRun(saved = false) {
    // Saved loops and "start from the first loop": play from there instead of where the media is.
    if (saved && P.autoStart) {
      startFirst(true);
      return;
    }
    if (!arm(false)) return;
    A.render();
    wake();
    if (!S.open) {
      const on = S.loops.filter((l) => l.on);
      const what = on.length > 1 ? `Looping ${on.length} sections` : `Looping ${describe(on[0])}`;
      A.toast(saved ? `${what} (saved loops)` : what, saved ? { label: 'Turn off', run: stopRun } : undefined);
    }
  }

  // Starting: plays the selected loop from its beginning (which needs looping to be on).
  function startLoop() {
    if (!arm(true)) return;
    E.giveTurn(S.loops, cur());
    if (S.trusted && !isAd()) {
      seekTo(cur().a);
      play();
    }
    A.render();
    wake();
    if (!S.open) A.toast(`${A.loopLabel(cur())} · ${describe(cur())}`);
  }

  function stopRun() {
    if (!S.active) return;
    endRun();
    A.render();
    if (!S.open) A.toast('Looping off');
  }

  // The loop the skip / previous / restart actions work on: the one in charge at the playhead.
  const inCharge = () => (S.trusted && S.video ? loopAt(S.video.currentTime) : null);

  // Carries out what an engine action decided: seek, show which loop is now in play, say what happened.
  function follow(step, { play: andPlay = false, say = '' } = {}) {
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
    if (andPlay) play();
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
    const opts = runOpts(turnGuard());
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
        step = E.gotoLoop(S.loops[arg], S.loops);
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
    startFirst(false);
  }

  // Looping on, every count starting over, playing from the first loop (in play order) that is on.
  function startFirst(saved) {
    if (!arm(false)) return;
    const first = E.playOrder(S.loops.filter((l) => l.on))[0];
    const step = E.gotoLoop(first, S.loops);
    if (!step || !S.trusted || isAd()) {
      A.render();
      return;
    }
    follow(step, { play: true });
    if (saved && !S.open) A.toast(`From ${A.loopLabel(first)} · ${describe(first)} (saved loops)`, { label: 'Turn off', run: stopRun });
  }

  // After an edit during a run: if nothing is left to play, looping turns itself off.
  function settleRun() {
    if (S.active && !S.loops.some((l) => !skipped(l))) endRun();
  }

  const IDLE_MS = 250;
  // Within this much real time of the turn-around point, a timer is set for that very moment, so
  // a repetition turns around on time (to a few ms) instead of on the next frame or idle tick,
  // and no animation frames run just to watch for it.
  const TURN_AHEAD_MS = IDLE_MS + 100;
  let raf = 0;
  let idle = 0;
  let turnTimer = 0;

  // Frames only while something on screen moves with the playhead.
  function wantsFrames() {
    const v = S.video;
    return !!v && !v.paused && !v.ended && !document.hidden && (S.open || A.stripWanted());
  }

  // Aims a timer at the end of the loop whose turn it is, when that end is close.
  function armTurn() {
    clearTimeout(turnTimer);
    turnTimer = 0;
    const v = S.video;
    if (!S.active || !S.trusted || !v || v.paused || v.ended || v.seeking || v.readyState < 3) return;
    const rate = v.playbackRate || 1;
    const guard = turnGuard();
    const t = v.currentTime;
    const l = loopAt(t, guard);
    if (!l) return;
    const ms = ((loopEnd(l, guard) - t) / rate) * 1000;
    if (ms > TURN_AHEAD_MS) return;
    // At least a few ms: right at the end, the position may not have moved on since the last check.
    turnTimer = setTimeout(onTurnTimer, Math.max(4, ms));
  }

  function onTurnTimer() {
    turnTimer = 0;
    check();
    armTurn();
  }

  function kick() {
    if (!raf && !idle && (S.active || S.open)) {
      if (wantsFrames()) raf = requestAnimationFrame(frame);
      else idle = setTimeout(frame, IDLE_MS);
    }
    armTurn();
  }

  function frame() {
    raf = 0;
    idle = 0;
    check();
    followTurn();
    A.renderLive();
    kick();
  }

  // The media's own position updates (also while the tab is hidden and no frames run).
  function onTimeUpdate() {
    check();
    armTurn();
  }

  // Something changed (play, pause, seek, panel opened…): don't wait for the slow timer.
  function wake() {
    if (raf || !(S.active || S.open)) {
      armTurn();
      return;
    }
    clearTimeout(idle);
    frame();
  }

  return { armRun, navigate, hold, kick, loopAt, loopEnd, nextLoop, onEnded, onTimeUpdate, seekTo, settleRun, startLoop, stopRun, turnGuard, wake };
}
