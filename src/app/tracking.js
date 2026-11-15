// Following the video: which media is loaded, its duration, and whether it can be looped.

import { MIN_LEN } from '../core/constants.js';
import { clamp } from '../core/util.js';
import * as E from '../core/engine.js';

export function createTracking(A) {
  const { S, P, adapter, store, isAd } = A;

  const MEDIA_EVENTS = ['loadstart', 'emptied', 'loadedmetadata', 'durationchange'];
  const WAKE_EVENTS = ['play', 'playing', 'pause', 'seeked', 'ratechange'];
  let syncTimer = 0;
  let autoDone = false; // looping was already turned on by itself for the media now loaded

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
    S.tap = null; // tap to mark: a section never spans a seek
    A.wake();
  }

  function bindVideo(v) {
    const old = S.video;
    if (old) {
      old.removeEventListener('timeupdate', A.check);
      old.removeEventListener('ended', A.onEnded);
      old.removeEventListener('seeking', onSeeking);
      for (const t of MEDIA_EVENTS) old.removeEventListener(t, onMediaEvent);
      for (const t of WAKE_EVENTS) old.removeEventListener(t, A.wake);
    }
    S.video = v || null;
    if (v) {
      v.addEventListener('timeupdate', A.check);
      v.addEventListener('ended', A.onEnded);
      v.addEventListener('seeking', onSeeking);
      for (const t of MEDIA_EVENTS) v.addEventListener(t, onMediaEvent);
      for (const t of WAKE_EVENTS) v.addEventListener(t, A.wake);
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
    S.undo = [];
    S.tap = null;
    autoDone = false;
    A.cancelEdits();
    A.hideTip();
    A.render();
  }

  // Loops read back from storage replace the ones in memory: the run's progress stays with them
  // when they are the same loops (same number of them).
  function keepRun(saved) {
    if (saved.length !== S.loops.length) return;
    saved.forEach((l, i) => {
      const old = S.loops[i];
      l.done = old.done;
      l.skip = old.skip;
      l.turn = old.turn;
      l.partial = old.partial;
    });
  }

  // The saved entry for the media. Some sites key loops by page and rounded duration: when that
  // shifted a little (an ad, a re-encode) or the key format changed, the loops saved under a nearby
  // key are copied over (never moved: they may belong to another track of the same page).
  function savedEntry() {
    if (!S.videoId) return null;
    const own = store.get(S.videoId);
    if (own || !adapter.nearKeys) return own;
    for (const k of adapter.nearKeys(S.videoId)) {
      const e = store.get(k);
      if (e) {
        store.put(S.videoId, { loops: e.loops, t: Date.now() });
        return store.get(S.videoId);
      }
    }
    return null;
  }

  function applyDuration(d) {
    const oldD = S.ranged ? S.duration : 0;
    const saved = E.loopsFromSaved(savedEntry(), P);
    if (saved) store.touch(S.videoId);
    S.duration = d;
    S.ranged = d >= MIN_LEN * 2;
    if (!S.ranged) {
      S.active = false;
      S.loops = [];
    } else {
      if (saved) {
        // Same loops as before (only the duration was corrected): keep the run's progress.
        keepRun(saved);
        S.loops = saved;
      }
      // The length was corrected: a loop that ran to the old end still runs to the end.
      if (oldD) for (const l of S.loops) if (Math.abs(l.b - oldD) < 0.05) l.b = d;
      E.clampLoops(S.loops, d);
      S.sel = clamp(S.sel, 0, Math.max(0, S.loops.length - 1));
      if (saved && P.autoOn && !autoDone) autoOn();
    }
    A.render();
  }

  // The media came with saved loops and the user wants looping on right away. Once per media
  // item: turning it off afterwards sticks until another one loads.
  function autoOn() {
    autoDone = true;
    const key = S.videoId;
    setTimeout(() => {
      if (S.videoId === key && !S.active && A.ready() && S.trusted) A.armRun(true);
    }, 0);
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
        A.render();
      }
      return;
    }
    if (!(d > 0) || v.readyState < 1) return;
    S.live = false;
    if (!S.ranged || Math.abs(d - S.duration) > 0.05) applyDuration(d);
  }

  // Another tab saved something: settings, or the loops of the media loaded here.
  function otherTab(keys) {
    if (keys.includes('prefs')) {
      A.reloadPrefs();
      A.render();
    }
    if (!S.videoId || !S.ranged || !keys.includes('m:' + S.videoId)) return;
    const saved = E.loopsFromSaved(store.get(S.videoId), P) || [];
    E.clampLoops(saved, S.duration);
    const same = JSON.stringify(E.serializeLoops(saved)) === JSON.stringify(E.serializeLoops(S.loops));
    if (same) return; // our own save coming back
    if (A.editing() || S.sliding) {
      A.toast('These loops were changed in another tab');
      return;
    }
    keepRun(saved);
    S.loops = saved;
    S.sel = clamp(S.sel, 0, Math.max(0, S.loops.length - 1));
    if (!S.loops.length) S.zoom = false;
    S.lastT = null;
    A.hideTip();
    A.settleRun();
    A.render();
    if (S.open) A.toast('Loops updated from another tab');
  }

  return { scheduleSync, syncVideo, otherTab };
}
