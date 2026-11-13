// The loop player: state, playback control, the panel and the hotkeys. Site specifics come from
// the adapter (src/adapters/), saved data from the store (src/core/store.js), and the loop rules
// from src/core/engine.js.

import { MIN_LEN, NEW_LOOP_LEN, MAX_LOOPS, MAX_COUNT, PALETTE, AFTER } from './core/constants.js';
import { clamp, round1, fmt, parseTime, segments } from './core/util.js';
import * as E from './core/engine.js';
import { visibleArea } from './core/mediakey.js';
import { el, icon, I, setText, setAttr, setStyle, pct } from './ui/dom.js';
import { LIGHT_CSS, SHADOW_CSS } from './ui/styles.js';

export function start(adapter, store) {
  /* ------------------------------------------------------------------ */
  /* State                                                              */
  /* ------------------------------------------------------------------ */

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
  let shadow = null;
  const focused = () => (shadow && shadow.activeElement) || document.activeElement;

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

  /* ------------------------------------------------------------------ */
  /* Video tracking                                                     */
  /* ------------------------------------------------------------------ */

  const MEDIA_EVENTS = ['loadstart', 'emptied', 'loadedmetadata', 'durationchange'];
  const WAKE_EVENTS = ['play', 'playing', 'pause', 'seeked', 'ratechange'];
  let syncTimer = 0;

  function scheduleSync() {
    if (syncTimer) return;
    syncTimer = setTimeout(() => {
      syncTimer = 0;
      if (S.dirty) syncVideo();
    }, 0);
  }

  function onMediaEvent() {
    S.dirty = true;
    scheduleSync();
  }

  // A seek (by the user or by us) is never "playback running into the end of a loop".
  function onSeeking() {
    S.lastT = null;
    wake();
  }

  function bindVideo(v) {
    const old = S.video;
    if (old) {
      old.removeEventListener('timeupdate', check);
      old.removeEventListener('ended', onEnded);
      old.removeEventListener('seeking', onSeeking);
      for (const t of MEDIA_EVENTS) old.removeEventListener(t, onMediaEvent);
      for (const t of WAKE_EVENTS) old.removeEventListener(t, wake);
    }
    S.video = v || null;
    if (v) {
      v.addEventListener('timeupdate', check);
      v.addEventListener('ended', onEnded);
      v.addEventListener('seeking', onSeeking);
      for (const t of MEDIA_EVENTS) v.addEventListener(t, onMediaEvent);
      for (const t of WAKE_EVENTS) v.addEventListener(t, wake);
    }
  }

  function switchVideo(id) {
    S.videoId = id;
    S.active = false;
    S.lastT = null;
    S.duration = 0;
    S.ranged = false;
    S.live = false;
    S.zoom = false;
    S.loops = [];
    S.sel = 0;
    cancelEdits();
    hideTip();
    render();
  }

  function applyDuration(d) {
    const wasDefault = !S.ranged || isDefaultSet();
    const saved = E.loopsFromSaved(S.videoId ? store.get(S.videoId) : null, P);
    S.duration = d;
    S.ranged = d >= MIN_LEN * 2;
    if (!S.ranged) {
      S.active = false;
      S.loops = [];
    } else {
      if (saved) {
        // Same loops as before (only the duration was corrected): keep the run's progress.
        if (saved.length === S.loops.length) saved.forEach((l, i) => { l.done = S.loops[i].done; });
        S.loops = saved;
      } else if (wasDefault) {
        if (S.loops.length === 1) {
          S.loops[0].a = 0;
          S.loops[0].b = d;
        } else {
          S.loops = [newLoop(0, d, 0)];
        }
      }
      E.clampLoops(S.loops, d);
      S.sel = clamp(S.sel, 0, S.loops.length - 1);
    }
    render();
  }

  // Works out which video is loaded and whether its metadata is usable.
  function syncVideo() {
    S.dirty = false;
    S.href = location.href;
    const p = S.player;
    if (!p) return;
    const v = adapter.findMedia(p);
    if (v !== S.video) bindVideo(v);
    if (!v) return;

    const ad = isAd();
    const who = adapter.identify(p, ad);
    if (who.hold) {
      S.trusted = false;
      return;
    }
    const key = who.id ? `${adapter.keyPrefix}:${who.id}` : null;
    if (key && key !== S.videoId) switchVideo(key);
    S.trusted = !ad;
    if (ad) return;

    const d = v.duration;
    if (who.live || d === Infinity) {
      if (!S.live) {
        S.live = true;
        S.ranged = false;
        S.active = false;
        S.loops = [];
        render();
      }
      return;
    }
    if (!(d > 0) || v.readyState < 1) return;
    S.live = false;
    if (!S.ranged || Math.abs(d - S.duration) > 0.05) applyDuration(d);
  }

  /* ------------------------------------------------------------------ */
  /* Loop engine                                                        */
  /* ------------------------------------------------------------------ */

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
    if (S.dirty || location.href !== S.href) syncVideo();
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
    const guard = turnGuard();
    const crossed = E.crossedLoops(S.loops, prev, t, S.duration, guard);
    if (!crossed || turnAround(crossed, false)) return;
    // Those loops have played out. Carry on if another one is still ahead.
    if (E.anyAhead(S.loops, t, S.duration, guard)) {
      if (P.after === 'next' && !loopAt(t, guard)) {
        const next = nextLoop(t); // skip whatever lies between the loops
        if (next) seekTo(next.a);
      }
      render();
    } else {
      finishRun();
    }
  }

  // Counts one play for each loop that just ended; goes back to the start of the
  // first one (inner loops first) that still has plays left.
  function turnAround(crossed, fromEnded) {
    const l = E.countCrossed(crossed);
    if (!l) return false;
    seekTo(l.a);
    if (fromEnded) play();
    render();
    replay(ui.badge, 'ysl-pop');
    return true;
  }

  function finishRun() {
    const on = S.loops.filter((l) => l.on);
    const single = on.length === 1 ? on[0] : null;
    S.active = false;
    S.lastT = null;
    for (const l of S.loops) l.done = 0;
    if (P.after !== 'continue' && S.video && !S.video.paused) S.video.pause();
    render();
    toast(single ? `Loop finished · played ${single.count}×` : 'Loops finished');
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
    commitEdits();
    syncVideo();
    if (!ready()) {
      toast(S.live ? 'Live streams can’t be looped' : 'The video isn’t ready yet');
      return false;
    }
    if ((needSel || !S.loops.some((l) => l.on)) && !cur().on) {
      cur().on = true;
      rememberLoops();
    }
    for (const l of S.loops) l.done = 0;
    S.active = true;
    S.lastT = null;
    return true;
  }

  // Enabling: looping is on from here, but playback is left alone. The loops act
  // when the playhead runs into them.
  function armRun() {
    if (!arm(false)) return;
    render();
    wake();
    if (!S.open) {
      const on = S.loops.filter((l) => l.on);
      toast(on.length > 1 ? `Looping ${on.length} sections` : `Looping ${describe(on[0])}`);
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
    render();
    wake();
    if (!S.open) toast(`${S.loops.length > 1 ? `Loop ${S.sel + 1}` : 'Loop'} · ${describe(cur())}`);
  }

  function stopRun() {
    if (!S.active) return;
    S.active = false;
    S.lastT = null;
    for (const l of S.loops) l.done = 0;
    render();
    if (!S.open) toast('Looping off');
  }

  // After an edit during a run: if nothing is left to play, looping turns itself off.
  function settleRun() {
    if (S.active && !S.loops.some((l) => !skipped(l))) {
      S.active = false;
      for (const l of S.loops) l.done = 0;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Editing                                                            */
  /* ------------------------------------------------------------------ */

  // push=true: the other point moves out of the way. push=false: this point stops against it.
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
    render();
  }

  function markNow(which) {
    syncVideo();
    if (!ready() || !S.trusted || isAd()) {
      toast('Not available right now');
      return;
    }
    setPoint(which, S.video.currentTime, true);
    replay(ui.field[which].now, 'ysl-flash');
    if (!S.open) toast(`${which === 'a' ? 'Start' : 'End'} set to ${fmtT(cur()[which])}`);
  }

  function setCount(n) {
    if (!ready()) return;
    const l = cur();
    l.count = clamp(Math.round(n) || 1, 1, MAX_COUNT);
    l.infinite = false;
    P.count = l.count;
    P.infinite = false;
    settleRun();
    rememberPrefs();
    rememberLoops();
    render();
  }

  function setInfinite(on) {
    if (!ready()) return;
    cur().infinite = !!on;
    P.infinite = !!on;
    settleRun();
    rememberPrefs();
    rememberLoops();
    render();
  }

  function setAfter(v) {
    P.after = AFTER.includes(v) ? v : 'continue';
    rememberPrefs();
    render();
  }

  // A loop that is switched off stays in the list (and stays saved) but is never played.
  // Switching one back on only arms it: the video doesn't move.
  function toggleLoop() {
    if (!ready()) return;
    const l = cur();
    l.on = !l.on;
    l.done = 0;
    settleRun();
    rememberLoops();
    render();
  }

  function setZoom(on) {
    S.zoom = !!on && ready();
    if (S.zoom) fitView();
    render();
  }

  // Clicking the loop that is already selected jumps to its start.
  function selectLoop(i) {
    if (!ready() || i < 0 || i >= S.loops.length) return;
    if (i === S.sel) {
      if (S.trusted && !isAd()) seekTo(cur().a);
      return;
    }
    S.sel = i;
    hideTip();
    if (S.zoom) fitView();
    render();
  }

  // New loops start at the current playback position.
  function addLoop() {
    syncVideo();
    if (!ready()) return;
    if (S.loops.length >= MAX_LOOPS) {
      toast(`${MAX_LOOPS} loops is the maximum`);
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
    hideTip();
    if (S.zoom) fitView();
    rememberLoops();
    render();
    replay(ui.chips[S.sel].root, 'ysl-new');
  }

  function removeLoop() {
    if (!ready()) return;
    if (S.loops.length === 1) {
      resetAll();
      return;
    }
    S.loops.splice(S.sel, 1);
    S.sel = Math.min(S.sel, S.loops.length - 1);
    hideTip();
    if (S.zoom) fitView();
    settleRun();
    rememberLoops();
    render();
  }

  function resetAll() {
    S.active = false;
    S.lastT = null;
    S.zoom = false;
    S.sel = 0;
    hideTip();
    if (S.ranged) {
      S.loops = [newLoop(0, S.duration, 0)];
      rememberLoops();
    }
    render();
  }

  /* ------------------------------------------------------------------ */
  /* Scheduling                                                         */
  /* ------------------------------------------------------------------ */

  // Per-frame work is only worth it while the picture is moving and either the panel is
  // showing the playhead or a loop is about to turn around. The rest of the time a slow
  // timer (plus the video's own events) keeps everything current.
  const IDLE_MS = 250;
  const TURN_LEAD = 0.75; // seconds of real time before a loop's end at which frames take over
  let raf = 0;
  let idle = 0;

  function wantsFrames() {
    const v = S.video;
    if (!v || v.paused || v.ended || document.hidden) return false;
    if (S.open) return true;
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
    renderLive();
    kick();
  }

  // Something changed (play, pause, seek, panel opened…): don't wait for the slow timer.
  function wake() {
    if (raf || !(S.active || S.open)) return;
    clearTimeout(idle);
    frame();
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                          */
  /* ------------------------------------------------------------------ */

  // What renderLive() last put on screen, so unchanged frames cost nothing.
  const live = { notice: null, stale: true, loop: null, next: null, done: -1, prog: -1, px: -1, out: null };

  // Cheap, frequent updates: playhead, run status, progress fill, transient notices.
  function renderLive() {
    const v = S.video;
    const ad = isAd();
    let notice = '';
    if (S.live) notice = 'Live streams can’t be looped.';
    else if (ad) notice = S.active ? 'Ad playing — the loops pick up right after.' : 'Ad playing…';
    else if (!S.ranged) notice = S.duration > 0 ? 'This video is too short to loop a section.' : 'Waiting for the video…';
    if (notice !== live.notice) {
      live.notice = notice;
      ui.notice.textContent = notice;
      ui.notice.classList.toggle('ysl-show', !!notice);
    }
    if (!v || !ready() || ad || !S.trusted) {
      if (S.active && live.stale) setText(ui.mainText, 'Turn off'); // no position to report yet
      return;
    }

    const t = v.currentTime;
    if (S.active) {
      const guard = turnGuard();
      const l = loopAt(t, guard);
      const next = l ? null : nextLoop(t);
      const done = l ? l.done : -1;
      if (live.stale || l !== live.loop || next !== live.next || done !== live.done) {
        live.stale = false;
        live.loop = l;
        live.next = next;
        live.done = done;
        const many = S.loops.length > 1;
        let text;
        let badge = '·';
        if (l) {
          const n = l.infinite ? `${l.done + 1} · ∞` : `${Math.min(l.done + 1, l.count)} / ${l.count}`;
          text = many ? `Loop ${S.loops.indexOf(l) + 1} · ${n}` : `Rep ${n}`;
          badge = l.infinite ? '∞' : String(Math.max(1, l.count - l.done));
        } else if (next) {
          text = many ? `Next: loop ${S.loops.indexOf(next) + 1}` : 'Loop ahead';
        } else {
          text = 'Past the loops';
        }
        ui.mainText.textContent = 'Turn off · ' + text;
        ui.badge.textContent = badge;
      }
      if (S.open) {
        const prog = l ? Math.round(clamp((t - l.a) / Math.max(0.01, loopEnd(l, guard) - l.a), 0, 1) * 500) : 0;
        if (prog !== live.prog) {
          live.prog = prog;
          ui.mainFill.style.transform = `scaleX(${prog / 500})`;
        }
      }
    }
    if (S.open) {
      const out = t < viewStart() - 0.05 || t > viewEnd() + 0.05;
      if (out !== live.out) {
        live.out = out;
        ui.play.hidden = out;
      }
      // Whole device pixels: on a long video the playhead only needs repainting about once a second.
      const px = Math.round((toPct(t) / 100) * S.laneW * S.dpr) / S.dpr;
      if (px !== live.px) {
        live.px = px;
        ui.play.style.transform = `translateX(${px}px)`;
      }
    }
  }

  let tipWhich = null;

  function showTip(which) {
    tipWhich = which;
    ui.tip.classList.add('ysl-show');
    renderTip();
  }

  function hideTip() {
    tipWhich = null;
    ui.tip.classList.remove('ysl-show');
  }

  function renderTip() {
    if (!tipWhich || !ready()) return;
    setText(ui.tip, fmtT(cur()[tipWhich]));
    setStyle(ui.lane, '--tip', pct(toPct(cur()[tipWhich])));
  }

  // Grows or shrinks a list of DOM nodes to `n` items.
  function resize(list, n, create) {
    while (list.length > n) {
      const gone = list.pop();
      (gone.root || gone).remove();
    }
    while (list.length < n) list.push(create());
  }

  function makeChip() {
    const num = el('b');
    const meta = el('span');
    const root = el('button', { class: 'ysl-chip', type: 'button' }, el('i'), num, meta);
    const chip = { root, num, meta };
    root.addEventListener('click', () => selectLoop(ui.chips.indexOf(chip)));
    ui.chipRow.insertBefore(root, ui.add);
    return chip;
  }

  function renderLoops(ok) {
    const loops = ok ? S.loops : [];
    const d = S.duration;
    const lanes = E.lanesOf(loops);
    const many = loops.length > 1;

    resize(ui.chips, loops.length, makeChip);
    resize(ui.ghosts, loops.length, () => ui.ghostBox.appendChild(el('div', { class: 'ysl-ghost' })));
    resize(ui.marks, loops.length, () => ui.markBox.appendChild(el('div', { class: 'ysl-mark' })));

    loops.forEach((l, i) => {
      const rgb = PALETTE[l.c];
      const selected = i === S.sel;
      const spent = S.active && l.on && exhausted(l);
      let meta;
      if (!l.on) meta = 'off';
      else if (!S.active) meta = l.infinite ? '∞' : `×${l.count}`;
      else if (spent) meta = '✓';
      else meta = l.infinite ? `${l.done + 1}·∞` : `${Math.min(l.done + 1, l.count)}/${l.count}`;

      const chip = ui.chips[i];
      setStyle(chip.root, '--cv', rgb);
      setAttr(chip.root, 'aria-pressed', String(selected));
      chip.root.classList.toggle('ysl-spent', spent);
      chip.root.classList.toggle('ysl-muted', !l.on);
      setAttr(chip.root, 'title', `Loop ${i + 1}: ${describe(l)}${l.on ? '' : ' · switched off'}\n${selected ? 'Click again to jump to its start' : 'Click to edit'}`);
      setText(chip.num, String(i + 1));
      setText(chip.meta, meta);

      const ghost = ui.ghosts[i];
      const shown = many && !selected && l.b > viewStart() && l.a < viewEnd();
      ghost.hidden = !shown;
      ghost.classList.toggle('ysl-muted', !l.on);
      if (shown) {
        const ga = toPct(l.a);
        setStyle(ghost, 'left', pct(ga));
        setStyle(ghost, 'width', pct(Math.max(0, toPct(l.b) - ga)));
        setStyle(ghost, '--cv', rgb);
        setStyle(ghost, '--lane', String(lanes[i] % 2));
      }

      const mark = ui.marks[i];
      setStyle(mark, 'left', pct((l.a / d) * 100));
      setStyle(mark, 'width', pct(((l.b - l.a) / d) * 100));
      setStyle(mark, '--cv', rgb);
      setStyle(mark, '--lane', String(Math.min(lanes[i], 3)));
      mark.classList.toggle('ysl-sel', selected || !many);
      mark.classList.toggle('ysl-spent', spent);
      mark.classList.toggle('ysl-muted', !l.on);
    });

    const which = many ? `loop ${S.sel + 1}` : 'this loop';
    const on = ok && cur().on;
    const trashTitle = many ? `Remove loop ${S.sel + 1}` : 'Reset this loop to the whole video';
    ui.add.hidden = !ok || loops.length >= MAX_LOOPS;
    ui.trash.hidden = !ok;
    setAttr(ui.trash, 'title', trashTitle);
    setAttr(ui.trash, 'aria-label', trashTitle);
    ui.power.hidden = !ok;
    setAttr(ui.power, 'aria-pressed', String(on));
    setAttr(ui.power, 'title', on ? `Switch ${which} off — it is kept, just not played` : `Switch ${which} back on`);
    setAttr(ui.power, 'aria-label', many ? `Loop ${S.sel + 1} switched on` : 'Loop switched on');
    const startTitle = `Play ${which} from its start`;
    setAttr(ui.start, 'title', `${startTitle}  (Shift+S)\nTurns looping on if it is off`);
    setAttr(ui.start, 'aria-label', startTitle);
    ui.markBox.hidden = !(ok && (S.active || !isDefaultSet()) && (!floating || barPlaced));
    ui.markBox.classList.toggle('ysl-live', S.active);
  }

  function render() {
    const ok = ready();
    const l = ok ? cur() : null;
    if (!ok) S.zoom = false;
    else if (S.zoom && !S.sliding && (l.a < S.v0 || l.b > S.v1)) fitView();
    const pa = ok ? toPct(l.a) : 0;
    const pb = ok ? toPct(l.b) : 100;

    ui.body.disabled = !ok;
    ui.panel.classList.toggle('ysl-off', !ok);
    ui.panel.classList.toggle('ysl-running', S.active);
    ui.panel.classList.toggle('ysl-muted', ok && !l.on);
    setStyle(ui.panel, '--acv', PALETTE[ok ? l.c : 0]);
    setStyle(ui.lane, '--a', pct(pa));
    setStyle(ui.lane, '--b', pct(pb));

    for (const w of ['a', 'b']) {
      const f = ui.field[w];
      const shown = ok ? fmtT(l[w]) : '';
      if (!f.editing && f.input.value !== shown) f.input.value = shown;
      const th = ui.thumb[w];
      th.tabIndex = ok ? 0 : -1;
      setAttr(th, 'aria-valuemax', String(Math.round(S.duration)));
      setAttr(th, 'aria-valuenow', ok ? String(round1(l[w])) : '0');
      setAttr(th, 'aria-valuetext', shown);
    }
    setText(ui.len, ok ? `Length ${fmt(l.b - l.a, false)}` : '');
    setText(ui.scaleStart, ok ? fmtT(viewStart()) : '0:00');
    setText(ui.scaleEnd, ok ? fmtT(viewEnd()) : '–:––');
    setAttr(ui.zoom, 'aria-pressed', String(S.zoom));
    renderTip();

    const inf = ok && l.infinite;
    const count = !ok ? '' : inf ? '∞' : String(l.count);
    if (!ui.countState.editing && ui.count.value !== count) ui.count.value = count;
    ui.count.readOnly = inf;
    setAttr(ui.inf, 'aria-pressed', String(inf));
    setAttr(ui.seg, 'data-v', P.after);
    ui.seg.classList.toggle('ysl-dim', ok && S.loops.every((x) => !x.on || x.infinite));
    for (const b of ui.segBtns) setAttr(b, 'aria-pressed', String(b.dataset.v === P.after));

    ui.main.classList.toggle('ysl-on', S.active);
    setAttr(ui.main, 'aria-pressed', String(S.active));
    live.stale = true; // the run status below is rebuilt by renderLive()
    if (!S.active) {
      live.prog = -1;
      ui.mainFill.style.transform = '';
      setText(ui.mainText, 'Turn looping on');
    }

    ui.btn.classList.toggle('ysl-active', S.active);
    setAttr(ui.btn, 'aria-expanded', String(S.open));
    setAttr(ui.btn, 'aria-pressed', String(S.active));
    updatePill();

    renderLoops(ok);
    renderLive();
  }

  function replay(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth; // restart the CSS animation
    node.classList.add(cls);
  }

  let toastTimer = 0;

  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add('ysl-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('ysl-show'), 1900);
  }

  /* ------------------------------------------------------------------ */
  /* Controls                                                           */
  /* ------------------------------------------------------------------ */

  // Press = one step, hold = repeat. Enter/Space work too.
  function holdRepeat(btn, fn) {
    let delay = 0;
    let repeat = 0;
    const stop = () => {
      clearTimeout(delay);
      clearInterval(repeat);
      delay = repeat = 0;
    };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      stop();
      fn(e);
      delay = setTimeout(() => {
        repeat = setInterval(() => {
          if (btn.matches(':disabled')) stop(); // the panel got disabled mid-hold: no pointerup will come
          else fn(e);
        }, 70);
      }, 380);
    });
    for (const t of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) btn.addEventListener(t, stop);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fn(e);
      }
    });
  }

  // Turns wheel/trackpad deltas into discrete steps.
  function wheelSteps(node, isArmed, fn) {
    let acc = 0;
    node.addEventListener('wheel', (e) => {
      if (!isArmed()) return;
      e.preventDefault();
      acc += (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 16 : 1);
      while (Math.abs(acc) >= 30) {
        const dir = acc < 0 ? 1 : -1;
        acc += dir * 30;
        fn(dir, e);
      }
    }, { passive: false });
  }

  function shake(node) {
    replay(node, 'ysl-shake');
  }

  // Applies whatever is half-typed in a field. Not every browser blurs an input
  // when a button is clicked (Firefox and Safari on macOS don't), so this is called explicitly.
  function commitEdits() {
    ui.field.a.commit();
    ui.field.b.commit();
    ui.commitCount();
  }

  // Throws away whatever is half-typed.
  function cancelEdits() {
    ui.field.a.editing = ui.field.b.editing = ui.countState.editing = false;
  }

  function makeField(which, label) {
    const f = { editing: false, stick: null };
    const id = 'ysl-time-' + which;
    const key = which.toUpperCase();
    f.input = el('input', {
      class: 'ysl-time', id, type: 'text', inputmode: 'text', autocomplete: 'off', spellcheck: 'false', maxlength: '14',
      title: 'Type a time: 9:00 · 1:02:03 · 90s · 9m30s\n↑ / ↓ adjust the part under the cursor',
    });
    const minus = el('button', { class: 'ysl-ib', type: 'button', 'aria-label': `${label} earlier`, title: '−1 s  (Shift: 10 s · Alt: 0.1 s)' }, icon(I.minus, 14));
    const plus = el('button', { class: 'ysl-ib', type: 'button', 'aria-label': `${label} later`, title: '+1 s  (Shift: 10 s · Alt: 0.1 s)' }, icon(I.plus, 14));
    f.now = el('button', { class: 'ysl-ib ysl-now', type: 'button', 'aria-label': `Set ${label.toLowerCase()} to the current time`, title: `Use the current time  (Shift+${key})` }, icon(I.now, 15));
    f.root = el('div', { class: 'ysl-field' },
      el('label', { class: 'ysl-label', for: id }, el('b', { class: 'ysl-tag', text: key }), label),
      el('div', { class: 'ysl-box' }, minus, f.input, plus, f.now));

    const revert = () => {
      f.editing = false;
      f.input.value = ready() ? fmtT(cur()[which]) : '';
    };

    const commit = () => {
      if (!f.editing) return true;
      const v = parseTime(f.input.value);
      if (v === null || !ready()) {
        revert();
        shake(f.root);
        return false;
      }
      f.editing = false;
      setPoint(which, v, true);
      return true;
    };
    f.commit = commit;

    const step = (dir, e) => {
      if (!ready()) return;
      if (f.editing) commit();
      setPoint(which, cur()[which] + dir * (e.altKey ? 0.1 : e.shiftKey ? 10 : 1), false);
    };

    // Steps the part of the timestamp under the cursor (hours, minutes, seconds, tenths).
    const caretStep = (dir, e) => {
      if (!ready()) return;
      if (f.editing && !commit()) return;
      const inp = f.input;
      const val = inp.value;
      const s = inp.selectionStart;
      const en = inp.selectionEnd;
      let unit = 1;
      if (f.stick && f.stick.val === val && f.stick.s === s && f.stick.e === en) {
        unit = f.stick.unit;
      } else if (s != null && !(s === 0 && en === val.length)) {
        const seg = segments(val).find((g) => s <= g.end);
        if (seg) unit = seg.unit;
      }
      const amount = e.altKey ? 0.1 : e.shiftKey ? unit * 10 : unit;
      setPoint(which, cur()[which] + dir * amount, false);
      const next = inp.value;
      const segs = segments(next);
      const seg = segs.find((g) => g.unit === unit) || segs.find((g) => g.unit === 1);
      if (seg && focused() === inp) {
        inp.setSelectionRange(seg.start, seg.end);
        f.stick = { val: next, s: seg.start, e: seg.end, unit };
      }
    };

    f.input.addEventListener('input', () => {
      f.editing = true;
      f.stick = null;
    });
    f.input.addEventListener('blur', () => {
      commit();
      f.stick = null;
    });
    f.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (commit()) f.input.select();
      } else if (e.key === 'Escape') {
        if (f.editing) { // first Escape cancels the edit, the next one closes the panel
          e.preventDefault();
          e.stopPropagation();
          revert();
          f.input.select();
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        caretStep(e.key === 'ArrowUp' ? 1 : -1, e);
      }
    });
    wheelSteps(f.input, () => focused() === f.input && ready(), caretStep);
    holdRepeat(minus, (e) => step(-1, e));
    holdRepeat(plus, (e) => step(1, e));
    f.now.addEventListener('click', () => {
      f.editing = false;
      markNow(which);
    });
    return f;
  }

  /* ---- Range slider (edits the loop only; it never moves the video) ---- */

  function bindSlider() {
    const track = ui.track;
    let drag = null;

    const laneFrac = (x) => {
      const r = ui.lane.getBoundingClientRect();
      return r.width > 0 ? clamp((x - r.left) / r.width, 0, 1) : 0;
    };

    const move = (e) => {
      if (!drag || e.pointerId !== drag.id || !ready()) return;
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.x0) < 3) return;
        drag.moved = true;
      }
      setPoint(drag.which, fromFrac(laneFrac(e.clientX - drag.off)), false);
    };

    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const d = drag;
      drag = null;
      try { track.releasePointerCapture(d.id); } catch (_) { /* already released */ }
      track.classList.remove('ysl-dragging');
      ui.thumb[d.which].classList.remove('ysl-grab');
      if (!ui.thumb[d.which].matches(':focus-visible')) hideTip();
      S.sliding = false;
      render();
    };

    track.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !ready() || drag) return;
      const l = cur();
      const th = e.target.closest ? e.target.closest('.ysl-thumb') : null;
      let which;
      let off = 0;
      const r = ui.lane.getBoundingClientRect();
      if (th) {
        which = th.dataset.which;
        off = e.clientX - (r.left + (toPct(l[which]) / 100) * r.width);
      } else {
        const t = fromFrac(laneFrac(e.clientX));
        which = Math.abs(t - l.a) <= Math.abs(t - l.b) ? 'a' : 'b';
      }
      drag = { which, id: e.pointerId, off, x0: e.clientX, moved: !th };
      S.sliding = true;
      try { track.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      track.classList.add('ysl-dragging');
      ui.thumb[which].classList.add('ysl-grab');
      ui.thumb[which].focus({ preventScroll: true });
      showTip(which);
      if (!th) move(e);
    });
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('lostpointercapture', end);

    for (const w of ['a', 'b']) {
      const th = ui.thumb[w];
      th.addEventListener('keydown', (e) => {
        if (!ready()) return;
        const unit = e.altKey ? 0.1 : e.shiftKey ? 10 : 1;
        const now = cur()[w];
        let target;
        switch (e.key) {
          case 'ArrowLeft': case 'ArrowDown': target = now - unit; break;
          case 'ArrowRight': case 'ArrowUp': target = now + unit; break;
          case 'PageDown': target = now - 60; break;
          case 'PageUp': target = now + 60; break;
          case 'Home': target = 0; break;
          case 'End': target = S.duration; break;
          default: return;
        }
        e.preventDefault();
        setPoint(w, target, false);
        showTip(w);
      });
      th.addEventListener('focus', () => { if (th.matches(':focus-visible')) showTip(w); });
      th.addEventListener('blur', () => { if (!drag) hideTip(); });
    }
  }

  /* ---- Panel ---- */

  function place() {
    const p = S.player;
    if (!p) return;
    const pr = (floating ? ui.host : p).getBoundingClientRect();
    const top = adapter.controlsTop(p);
    let bottom = top == null ? 62 : Math.max(12, Math.round(pr.bottom - top + 8));
    if (floating && dock) bottom = 68; // above the docked loop button
    ui.panel.style.bottom = bottom + 'px';
    ui.panel.style.maxHeight = Math.max(120, Math.round(pr.height - bottom - 10)) + 'px';
    S.laneW = ui.lane.clientWidth;
    S.dpr = window.devicePixelRatio || 1;
  }

  function openPanel() {
    ensure();
    syncVideo();
    S.open = true;
    place();
    render();
    ui.panel.classList.add('ysl-open');
    wake();
  }

  function closePanel() {
    commitEdits();
    const hadFocus = ui.panel.contains(focused());
    S.open = false;
    hideTip();
    ui.panel.classList.remove('ysl-open');
    render();
    if (hadFocus) ui.btn.focus({ preventScroll: true });
  }

  function buildUI() {
    ui.badge = el('span', { class: 'ysl-badge' });
    ui.btn = el('button', {
      class: floating ? 'ysl-pill' : `${adapter.buttonClass || ''} ysl-btn`.trim(), type: 'button', title: 'Section loop (Loopsmith)', 'aria-label': 'Section loop',
      'aria-haspopup': 'dialog', 'aria-expanded': 'false',
    }, icon(I.loop, floating ? 22 : 24), ui.badge);
    ui.btn.addEventListener('click', (e) => {
      if (floating) e.stopPropagation(); // not a click on the page
      if (S.open) closePanel();
      else openPanel();
    });

    ui.markBox = el('div', { class: floating ? 'ysl-marks ysl-float' : 'ysl-marks', hidden: true });
    ui.toast = el('div', { class: 'ysl-toast', role: 'status', 'aria-live': 'polite' });

    // Header: one chip per loop
    ui.add = el('button', { class: 'ysl-hb ysl-add', type: 'button', 'aria-label': 'Add a loop', title: 'Add a loop at the current time' }, icon(I.plus, 14));
    ui.add.addEventListener('click', addLoop);
    ui.chipRow = el('div', { class: 'ysl-chips', role: 'group', 'aria-label': 'Loops' }, ui.add);
    ui.trash = el('button', { class: 'ysl-hb', type: 'button' }, icon(I.trash, 15));
    ui.trash.addEventListener('click', removeLoop);
    ui.power = el('button', { class: 'ysl-hb ysl-power', type: 'button', 'aria-pressed': 'true' }, icon(I.power, 15));
    ui.power.addEventListener('click', toggleLoop);
    const close = el('button', { class: 'ysl-hb', type: 'button', 'aria-label': 'Close', title: 'Close' }, icon(I.close, 16));
    close.addEventListener('click', closePanel);
    const head = el('div', { class: 'ysl-head' }, ui.chipRow, ui.power, ui.trash, close);
    ui.notice = el('div', { class: 'ysl-notice', role: 'status' });

    // Slider
    ui.thumb.a = el('div', { class: 'ysl-thumb ysl-thumb-a', 'data-which': 'a', role: 'slider', tabindex: '0', 'aria-valuemin': '0', 'aria-label': 'Loop start', text: 'A' });
    ui.thumb.b = el('div', { class: 'ysl-thumb ysl-thumb-b', 'data-which': 'b', role: 'slider', tabindex: '0', 'aria-valuemin': '0', 'aria-label': 'Loop end', text: 'B' });
    ui.tip = el('div', { class: 'ysl-tip' });
    ui.ghostBox = el('div', { class: 'ysl-ghosts' });
    ui.play = el('div', { class: 'ysl-play' });
    ui.lane = el('div', { class: 'ysl-lane' },
      el('div', { class: 'ysl-rail' }), ui.ghostBox, el('div', { class: 'ysl-fill' }), ui.play,
      ui.thumb.a, ui.thumb.b, ui.tip);
    ui.track = el('div', { class: 'ysl-track', title: 'Drag A and B, or click to move the nearest one' }, ui.lane);
    ui.len = el('span', { class: 'ysl-len' });
    ui.scaleStart = el('span', { text: '0:00' });
    ui.scaleEnd = el('span');
    ui.zoom = el('button', { class: 'ysl-zoom', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Zoom the slider on this loop', title: 'Zoom the slider on this loop (finer dragging)' }, icon(I.zoom, 14));
    ui.zoom.addEventListener('click', () => setZoom(!S.zoom));
    const slider = el('div', { class: 'ysl-slider' }, ui.track,
      el('div', { class: 'ysl-scale' }, ui.scaleStart, el('span', { class: 'ysl-mid' }, ui.len, ui.zoom), ui.scaleEnd));

    // Timestamps
    ui.field.a = makeField('a', 'Start');
    ui.field.b = makeField('b', 'End');
    const fields = el('div', { class: 'ysl-row' }, ui.field.a.root, ui.field.b.root);

    // Repeat count
    ui.countState = { editing: false };
    ui.count = el('input', { class: 'ysl-num', id: 'ysl-count', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '3', title: 'How many times this loop plays' });
    const cMinus = el('button', { class: 'ysl-ib', type: 'button', 'aria-label': 'Fewer plays', title: 'Fewer  (Shift: 10)' }, icon(I.minus, 14));
    const cPlus = el('button', { class: 'ysl-ib', type: 'button', 'aria-label': 'More plays', title: 'More  (Shift: 10)' }, icon(I.plus, 14));
    ui.inf = el('button', { class: 'ysl-ib ysl-inf', type: 'button', 'aria-label': 'Repeat forever', 'aria-pressed': 'false', title: 'Repeat forever', text: '∞' });
    const countField = el('div', { class: 'ysl-field' },
      el('label', { class: 'ysl-label', for: 'ysl-count', text: 'Times to play' }),
      el('div', { class: 'ysl-box' }, cMinus, ui.count, cPlus, ui.inf));

    const commitCount = () => {
      if (!ui.countState.editing) return;
      ui.countState.editing = false;
      const n = parseInt(ui.count.value, 10);
      if (n >= 1 && ready()) {
        setCount(n);
      } else {
        render();
        shake(countField);
      }
    };
    const bumpCount = (dir, e) => {
      if (!ready()) return;
      commitCount();
      if (cur().infinite) setInfinite(false);
      else setCount(cur().count + dir * (e.shiftKey ? 10 : 1));
    };
    ui.commitCount = commitCount;
    holdRepeat(cMinus, (e) => bumpCount(-1, e));
    holdRepeat(cPlus, (e) => bumpCount(1, e));
    ui.inf.addEventListener('click', () => {
      if (!ready()) return;
      ui.countState.editing = false;
      setInfinite(!cur().infinite);
    });
    // Clicking the "∞" turns it back into a number (tabbing through must not change anything).
    ui.count.addEventListener('click', () => {
      if (ready() && cur().infinite) {
        setInfinite(false);
        ui.count.select();
      }
    });
    ui.count.addEventListener('focus', () => {
      setTimeout(() => { if (focused() === ui.count) ui.count.select(); }, 0);
    });
    ui.count.addEventListener('input', () => {
      const digits = ui.count.value.replace(/\D+/g, '').slice(0, 3);
      if (digits !== ui.count.value) ui.count.value = digits;
      ui.countState.editing = true;
    });
    ui.count.addEventListener('blur', commitCount);
    ui.count.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitCount();
        ui.count.select();
      } else if (e.key === 'Escape') {
        if (ui.countState.editing) {
          e.preventDefault();
          e.stopPropagation();
          ui.countState.editing = false;
          render();
          ui.count.select();
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        bumpCount(e.key === 'ArrowUp' ? 1 : -1, e);
        ui.count.select();
      }
    });
    wheelSteps(ui.count, () => focused() === ui.count, (dir, e) => {
      bumpCount(dir, e);
      ui.count.select();
    });

    // What happens after the last repetition
    ui.segBtns = [
      el('button', { type: 'button', 'data-v': 'continue', 'aria-pressed': 'true', text: 'Play on', title: 'When a loop is done, keep playing the video' }),
      el('button', { type: 'button', 'data-v': 'next', 'aria-pressed': 'false', text: 'Next loop', title: 'When a loop is done, jump straight to the next loop\n(pauses after the last one)' }),
      el('button', { type: 'button', 'data-v': 'pause', 'aria-pressed': 'false', text: 'Pause', title: 'Keep playing between loops, pause after the last one' }),
    ];
    for (const b of ui.segBtns) b.addEventListener('click', () => setAfter(b.dataset.v));
    ui.seg = el('div', { class: 'ysl-seg', role: 'group', 'aria-label': 'When done' }, ...ui.segBtns);
    const afterField = el('div', { class: 'ysl-field' }, el('div', { class: 'ysl-label', text: 'When done' }), ui.seg);
    const opts = el('div', { class: 'ysl-row ysl-opts' }, countField, afterField);

    // Actions
    // Turning looping on and starting a loop are separate: the first leaves the video where it is.
    ui.start = el('button', { class: 'ysl-start', type: 'button' }, icon(I.play, 18));
    ui.start.addEventListener('click', startLoop);
    ui.mainText = el('span', { text: 'Turn looping on' });
    ui.mainFill = el('span', { class: 'ysl-main-fill' });
    ui.main = el('button', { class: 'ysl-main', type: 'button', 'aria-pressed': 'false', title: 'Turn looping on / off  (Shift+R)\nThe video stays where it is' },
      ui.mainFill, icon(I.loop, 18, 'ysl-ic-idle'), icon(I.stop, 18, 'ysl-ic-stop'), ui.mainText);
    ui.main.addEventListener('click', () => (S.active ? stopRun() : armRun()));
    const reset = el('button', { class: 'ysl-reset', type: 'button', 'aria-label': 'Remove all loops', title: 'Remove all loops and start over' }, icon(I.reset, 18));
    reset.addEventListener('click', () => {
      cancelEdits();
      resetAll();
    });
    const actions = el('div', { class: 'ysl-actions' }, ui.start, ui.main, reset);

    ui.body = el('fieldset', { class: 'ysl-body' }, slider, fields, opts, actions);
    ui.panel = el('div', { class: 'ysl-panel', role: 'dialog', 'aria-label': 'Section loop' }, head, ui.notice, ui.body);

    // The panel and the toast live in a shadow root: the site's CSS can't reach them.
    // Open, so focus and composedPath() still see which field is being typed in.
    // A custom tag name: broad site selectors like `body > div` don't match it.
    ui.host = document.createElement('loopsmith-root');
    shadow = ui.host.attachShadow({ mode: 'open' });
    shadow.append(el('style', { text: SHADOW_CSS }), ui.panel, ui.toast);
    if (floating) {
      // Floating mode draws the markers in the overlay, laid over the site's progress bar.
      shadow.append(ui.btn, ui.markBox);
      const base = { position: 'fixed', display: 'block', margin: '0', padding: '0', border: '0', 'z-index': '2147483646', 'pointer-events': 'none', left: '0', top: '0', width: '0', height: '0' };
      for (const [k, v] of Object.entries(base)) ui.host.style.setProperty(k, v, 'important');
    }

    bindSlider();

    // A press anywhere outside a text field applies what was being typed first.
    ui.panel.addEventListener('pointerdown', (e) => {
      if (!e.target || e.target.tagName !== 'INPUT') commitEdits();
    }, true);

    // Keep the player from reacting to anything that happens inside the panel
    // (hotkeys while typing, click-to-pause, double-click fullscreen…).
    ui.panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePanel();
      }
    });
    const stop = (e) => e.stopPropagation();
    for (const t of ['keydown', 'keyup', 'keypress', 'click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu']) {
      ui.panel.addEventListener(t, stop);
    }
    for (const t of ['wheel', 'touchstart', 'touchend']) ui.panel.addEventListener(t, stop, { passive: true });
  }

  /* ------------------------------------------------------------------ */
  /* Mounting                                                           */
  /* ------------------------------------------------------------------ */

  const resizeWatch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (S.open) place(); }) : null;

  // Floating mode: the overlay follows the media. Big enough and mostly on screen: laid over the
  // video. Otherwise (audio, small or scrolled-away video): docked to the bottom-right corner.
  let dock = false;
  let hoverUntil = 0;
  let hoverTimer = 0;
  const box = { l: '', t: '', w: '', h: '' };

  function layoutHost() {
    if (!floating) return;
    const p = S.player;
    if (!p || !p.isConnected) {
      if (ui.host.isConnected) ui.host.remove();
      return;
    }
    const fs = document.fullscreenElement;
    const parent = fs && !(fs instanceof HTMLMediaElement) ? fs : document.body || document.documentElement;
    if (ui.host.parentNode !== parent) parent.appendChild(ui.host);
    const r = p.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const over = !adapter.dockOnly && p.tagName === 'VIDEO' && r.width >= 360 && r.height >= 220 && visibleArea(r, vw, vh) >= 0.5 * r.width * r.height;
    const next = over
      ? { l: Math.round(r.left) + 'px', t: Math.round(r.top) + 'px', w: Math.round(r.width) + 'px', h: Math.round(r.height) + 'px' }
      : { l: '0px', t: '0px', w: vw + 'px', h: Math.max(200, vh - (adapter.dockInset || 0)) + 'px' }; // above the site's player bar
    for (const [k, prop] of [['l', 'left'], ['t', 'top'], ['w', 'width'], ['h', 'height']]) {
      if (box[k] !== next[k]) {
        box[k] = next[k];
        ui.host.style.setProperty(prop, next[k], 'important');
      }
    }
    placeMarks(over ? r : null);
    if (dock !== !over) {
      dock = !over;
      ui.host.classList.toggle('ysl-dock', dock);
      if (S.open) place();
    }
    updatePill();
  }

  // Floating mode: the markers are drawn over the site's own progress bar when the adapter knows
  // where it is, otherwise along the bottom edge of the video (generic pages), or not at all (audio).
  let barPlaced = false;
  const markRect = { l: '', t: '', w: '' };

  function placeMarks(videoRect) {
    let bar = null;
    try { bar = adapter.progressBar ? adapter.progressBar(S.player) : null; } catch (_) { /* ignore */ }
    const br = bar && bar.getBoundingClientRect();
    let next = null;
    if (br && br.width > 20 && br.bottom > 0 && br.top < window.innerHeight) {
      next = { l: br.left, t: br.top + br.height / 2 - 2, w: br.width };
    } else if (videoRect) {
      next = { l: videoRect.left + 12, t: videoRect.bottom - 4, w: videoRect.width - 24 };
    }
    const placed = !!next;
    if (next) {
      for (const [k, prop, v] of [['l', 'left', next.l], ['t', 'top', next.t], ['w', 'width', next.w]]) {
        const px = Math.round(v) + 'px';
        if (markRect[k] !== px) {
          markRect[k] = px;
          ui.markBox.style.setProperty(prop, px);
        }
      }
    }
    if (placed !== barPlaced) {
      barPlaced = placed;
      render();
    }
  }

  // Over a video the button shows while the pointer is on it; docked, once the media has been played.
  function updatePill() {
    if (!floating) return;
    const p = S.player;
    const show = S.open || S.active || (dock ? !!p && (engaged(p) || (!!S.video && !S.video.paused)) : Date.now() < hoverUntil);
    ui.btn.classList.toggle('ysl-show', show);
  }

  let moveQueued = false;
  function onPointerMove(e) {
    if (moveQueued || !S.player) return;
    moveQueued = true;
    const x = e.clientX;
    const y = e.clientY;
    requestAnimationFrame(() => {
      moveQueued = false;
      if (dock || !S.player) return;
      const r = S.player.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        hoverUntil = Date.now() + 2500;
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(updatePill, 2600);
      }
      updatePill();
    });
  }

  let layoutQueued = false;
  function queueLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => {
      layoutQueued = false;
      layoutHost();
      if (S.open) place();
    });
  }

  // Sites like YouTube are single-page apps and rebuild parts of the player; re-attach whatever went missing.
  function ensure() {
    const p = adapter.findPlayer(S.active || S.open);
    if (!p) {
      if (floating && S.player && !S.player.isConnected) {
        if (S.open) closePanel();
        layoutHost();
      }
      return;
    }
    if (p !== S.player) {
      S.player = p;
      S.dirty = true;
      if (resizeWatch) {
        resizeWatch.disconnect();
        resizeWatch.observe(p);
      }
    }
    if (floating) {
      layoutHost();
      return;
    }
    if (ui.host.parentNode !== p) p.appendChild(ui.host);
    const host = adapter.buttonHost(p);
    if (host && ui.btn.parentNode !== host) host.insertBefore(ui.btn, host.firstChild);
    const bar = adapter.progressBar(p);
    if (bar && ui.markBox.parentNode !== bar) bar.appendChild(ui.markBox);
  }

  function isTyping(e) {
    const t = (e.composedPath && e.composedPath()[0]) || e.target;
    return !!t && t.nodeType === 1 && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
  }

  function onHotkey(e) {
    if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (isTyping(e)) return;
    const k = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : String(e.code || '').replace(/^Key/, '').toLowerCase();
    if (k !== 'a' && k !== 'b' && k !== 'r' && k !== 's') return;
    if (!S.player || !S.player.isConnected) return;
    // On an arbitrary page, only once the user has played that media (or opened the panel).
    if (floating ? !(S.open || engaged(S.player)) : !S.player.getClientRects().length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (k === 'r') {
      if (S.active) stopRun();
      else armRun();
    } else if (k === 's') {
      startLoop();
    } else {
      markNow(k);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  if (!floating) { // the button and the markers live in the site's own DOM
    const style = document.createElement('style');
    style.id = 'ysl-style';
    style.textContent = LIGHT_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  buildUI();
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
    else if (S.open) requestAnimationFrame(place);
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
}
