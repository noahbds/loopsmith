// Running the loops: turning playback around, arming and stopping, and the frame scheduling.

import * as E from '../core/engine.js';
import { pressNextKey } from '../core/nextkey.js';

export function createRun(A) {
  const { S, P, ui, adapter, cur, describe, isAd, moreRounds, ready, rememberLoops, runOpts, skipped } = A;

  function play() {
    const v = S.video;
    if (!v) return;
    try {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* ignore */ }
  }

  // When Loopsmith itself last seeked. Its seeks go to a loop's start, so where the playhead lands
  // right after one never makes a loop "partly played" (the player may still report the old
  // position for a moment, which would stop that loop's plays from counting).
  let ownSeekAt = 0;

  function seekTo(t) {
    const v = S.video;
    if (!v) return;
    S.lastT = null;
    S.heldT = null;
    ownSeekAt = Date.now();
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
    const t = v.currentTime;
    let prev = S.lastT;
    S.lastT = t;
    if (prev === null) {
      const held = S.heldT;
      S.heldT = null;
      if (held !== null && t >= held - 0.3 && t - held < HOP * (v.playbackRate || 1)) {
        // Only a small hop forward from where it was (the player skipping a gap in its buffer, a
        // moment the media wasn't ready or couldn't be identified): still the same pass.
        prev = held;
      } else {
        // The playhead just landed here (a seek, or looping was just turned on): a loop it landed
        // in after its start, from outside it, is only partly played this time.
        if (Date.now() - ownSeekAt > 1500) E.enter(S.loops, t, S.duration, turnGuard(), held);
        return;
      }
    }
    // Seeks reset lastT (onSeeking), so anything left is forward playback; the bound is a sanity check.
    if (t <= prev || t - prev > Math.max(2, v.playbackRate * 2)) {
      return;
    }
    const step = E.advance(S.loops, prev, t, runOpts(turnGuard()));
    if (!step) {
      return;
    }
    if (step.finish) {
      finishOrAgain();
      return;
    }
    if (step.seek != null) seekTo(step.seek);
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
    if (S.video && (S.video.paused || S.video.ended)) play();
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
    const v = S.video;
    if (S.trusted && !isAd()) {
      seekTo(cur().a);
      if (v.paused || v.ended) play();
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
    if (andPlay && S.video && (S.video.paused || S.video.ended)) play();
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
    followTurn();
    A.renderLive();
    kick();
  }

  // Something changed (play, pause, seek, panel opened…): don't wait for the slow timer.
  function wake() {
    if (raf || !(S.active || S.open)) return;
    clearTimeout(idle);
    frame();
  }

  return { armRun, navigate, check, hold, kick, loopAt, loopEnd, nextLoop, onEnded, seekTo, settleRun, startLoop, stopRun, turnGuard, wake };
}
