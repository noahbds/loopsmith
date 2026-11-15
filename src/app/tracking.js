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
      old.removeEventListener('play', A.onPlay);
    }
    S.video = v || null;
    if (v) {
      v.addEventListener('timeupdate', A.check);
      v.addEventListener('ended', A.onEnded);
      v.addEventListener('seeking', onSeeking);
      for (const t of MEDIA_EVENTS) v.addEventListener(t, onMediaEvent);
      for (const t of WAKE_EVENTS) v.addEventListener(t, A.wake);
      v.addEventListener('play', A.onPlay);
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
    A.cancelWait();
    S.undo = [];
    S.tap = null;
    autoDone = false;
    A.cancelEdits();
    A.hideTip();
    A.render();
  }

  function applyDuration(d) {
    const oldD = S.ranged ? S.duration : 0;
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

  return { scheduleSync, syncVideo };
}
