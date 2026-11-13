// Following the video: which media is loaded, its duration, and whether it can be looped.

import { MIN_LEN } from '../core/constants.js';
import { clamp } from '../core/util.js';
import * as E from '../core/engine.js';

export function createTracking(A) {
  const { S, P, adapter, store, isAd, isDefaultSet, newLoop } = A;

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
    S.peaks = null;
    A.cancelEdits();
    A.hideTip();
    A.render();
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
    A.render();
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

  return { MEDIA_EVENTS, WAKE_EVENTS, applyDuration, bindVideo, onMediaEvent, onSeeking, scheduleSync, switchVideo, syncVideo };
}
