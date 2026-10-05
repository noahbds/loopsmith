// ==UserScript==
// @name         YouTube Section Loop (A-B repeat)
// @namespace    yt-section-loop
// @version      1.1
// @description  Repeat one or several sections of a YouTube video a chosen number of times. Drag the handles, type a timestamp, or grab the current time.
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

// This file is also the content script of the Firefox extension (firefox-extension/content.js).

(function () {
  'use strict';

  // Only the main page and embedded players have a player worth attaching to.
  if (window.top !== window.self && !/^\/embed\//.test(location.pathname)) return;
  // The marker lives in the DOM so the userscript and the extension never both attach to one page.
  if (document.documentElement.hasAttribute('data-ysl')) return;
  document.documentElement.setAttribute('data-ysl', '');

  const MIN_LEN = 0.5; // shortest section, in seconds
  const NEW_LOOP_LEN = 30;
  const MAX_LOOPS = 12;
  const MAX_COUNT = 999;
  const MAX_SAVED = 150;
  const STORE_KEY = 'ysl:v1';
  const PALETTE = ['62,166,255', '255,183,77', '110,231,163', '255,126,182', '179,157,255', '77,208,225']; // r,g,b

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const round1 = (x) => Math.round(x * 10) / 10;
  const pad2 = (n) => String(n).padStart(2, '0');
  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

  function fmt(sec, withHours) {
    const tenthsTotal = Math.max(0, Math.round(sec * 10));
    const whole = Math.floor(tenthsTotal / 10);
    const tenths = tenthsTotal % 10;
    const h = Math.floor(whole / 3600);
    const m = Math.floor((whole % 3600) / 60);
    const s = whole % 60;
    let out = h > 0 || withHours ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
    if (tenths) out += '.' + tenths;
    return out;
  }

  // Accepts 9:00, 1:02:03.5, 540, 90s, 9m30s, 1h2m, "9 30". Returns seconds or null.
  function parseTime(raw) {
    const s = String(raw).trim().toLowerCase().replace(/,/g, '.');
    if (!s) return null;
    const num = '(\\d+(?:\\.\\d+)?)';
    const units = new RegExp(`^(?:${num}\\s*h)?\\s*(?:${num}\\s*m(?:in)?)?\\s*(?:${num}\\s*s(?:ec)?)?$`).exec(s);
    if (units && (units[1] || units[2] || units[3])) {
      return (+units[1] || 0) * 3600 + (+units[2] || 0) * 60 + (+units[3] || 0);
    }
    const parts = s.split(/\s*:\s*|\s+/);
    if (parts.length > 3) return null;
    let total = 0;
    for (let i = 0; i < parts.length; i++) {
      const last = i === parts.length - 1;
      const p = parts[i] === '' && parts.length > 1 ? '0' : parts[i];
      if (!(last ? /^\d+(\.\d+)?$/ : /^\d+$/).test(p)) return null;
      total = total * 60 + Number(p);
    }
    return isFinite(total) ? total : null;
  }

  // Splits a formatted time into its editable parts: [{start, end, unit}]
  function segments(val) {
    const out = [];
    const parts = val.split(':');
    let pos = 0;
    parts.forEach((p, i) => {
      const unit = [1, 60, 3600][parts.length - 1 - i] || 3600;
      const dot = p.indexOf('.');
      if (i === parts.length - 1 && dot >= 0) {
        out.push({ start: pos, end: pos + dot, unit });
        out.push({ start: pos + dot + 1, end: pos + p.length, unit: 0.1 });
      } else {
        out.push({ start: pos, end: pos + p.length, unit });
      }
      pos += p.length + 1;
    });
    return out;
  }

  // DOM writes are skipped when the value is already there, so render() can be called freely.
  const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
  const setAttr = (node, name, value) => { if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
  const setStyle = (node, name, value) => { if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value); };
  const pct = (x) => +x.toFixed(3) + '%';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // No innerHTML anywhere: YouTube enforces Trusted Types.
  function el(tag, props, ...kids) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids) if (kid != null) node.append(kid);
    return node;
  }

  function icon(d, size, cls) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (cls) svg.setAttribute('class', cls);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
  }

  const I = {
    loop: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
    minus: 'M5 11h14v2H5z',
    plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
    close: 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z',
    play: 'M8 5v14l11-7z',
    stop: 'M6 6h12v12H6z',
    now: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A8.99 8.99 0 0 0 13 3.06V1h-2v2.06A8.99 8.99 0 0 0 3.06 11H1v2h2.06A8.99 8.99 0 0 0 11 20.94V23h2v-2.06A8.99 8.99 0 0 0 20.94 13H23v-2h-2.06zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z',
    zoom: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm.5-7H9v2H7v1h2v2h1v-2h2V9h-2z',
    trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4h-3.5z',
    reset: 'M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    power: 'M13 3h-2v10h2V3zm4.83 2.17-1.42 1.42A6.97 6.97 0 0 1 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17A8.96 8.96 0 0 0 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z',
  };

  /* ------------------------------------------------------------------ */
  /* Persistence (loops per video + preferences)                        */
  /* ------------------------------------------------------------------ */

  function readStore() {
    const base = { prefs: {}, videos: {} };
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY));
      if (raw && typeof raw === 'object') {
        if (raw.prefs && typeof raw.prefs === 'object') base.prefs = raw.prefs;
        if (raw.videos && typeof raw.videos === 'object') base.videos = raw.videos;
      }
    } catch (_) { /* storage blocked or corrupt: start clean */ }
    return base;
  }

  let store = readStore();
  const touchedVideos = new Set();
  let prefsTouched = false;
  let saveTimer = 0;

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushStore, 300);
  }

  // Re-reads before writing so several tabs don't erase each other's entries.
  function flushStore() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (!touchedVideos.size && !prefsTouched) return;
    const fresh = readStore();
    for (const id of touchedVideos) {
      if (store.videos[id]) fresh.videos[id] = store.videos[id];
      else delete fresh.videos[id];
    }
    if (prefsTouched) fresh.prefs = store.prefs;
    const ids = Object.keys(fresh.videos);
    if (ids.length > MAX_SAVED) {
      ids.sort((x, y) => ((fresh.videos[x] || {}).t || 0) - ((fresh.videos[y] || {}).t || 0));
      for (const id of ids.slice(0, ids.length - MAX_SAVED)) delete fresh.videos[id];
    }
    touchedVideos.clear();
    prefsTouched = false;
    store = fresh;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(fresh)); } catch (_) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ */
  /* State                                                              */
  /* ------------------------------------------------------------------ */

  // What happens when a loop has played out: keep playing, jump straight to the next loop, or pause at the end.
  const AFTER = ['continue', 'next', 'pause'];

  // Defaults for new loops + the "when done" choice.
  const P = {
    count: clamp(Math.round(Number(store.prefs.count)) || 5, 1, MAX_COUNT),
    infinite: store.prefs.infinite === true,
    after: AFTER.includes(store.prefs.after) ? store.prefs.after : 'continue',
  };

  const S = {
    player: null,
    video: null,
    videoId: null,
    href: '',
    splitAt: 0,      // when the URL and the player started disagreeing about the video
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

  const ready = () => !!S.video && S.ranged && !S.live && S.loops.length > 0;
  const cur = () => S.loops[S.sel];
  const fmtT = (sec) => fmt(sec, S.duration >= 3600);
  const exhausted = (l) => !l.infinite && l.done >= l.count;
  // Loops the engine passes over: switched off, or played out in this run.
  const skipped = (l) => !l.on || exhausted(l);
  const describe = (l) => `${fmtT(l.a)} → ${fmtT(l.b)} · ${l.infinite ? '∞' : l.count + '×'}`;
  // A single loop covering the whole video is the untouched default: nothing worth saving or marking.
  const isDefaultSet = () => S.loops.length === 1 && S.loops[0].a <= 0.001 && S.loops[0].b >= S.duration - 0.05;

  function newLoop(a, b, c) {
    return { a, b, c, count: P.count, infinite: P.infinite, on: true, done: 0 };
  }

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

  function isAd() {
    const p = S.player;
    return !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'));
  }

  // What the player itself says is loaded. In a Firefox content script the page's
  // own methods are only reachable through wrappedJSObject.
  function apiData() {
    const p = S.player;
    try {
      const raw = (p && p.wrappedJSObject) || p;
      if (raw && typeof raw.getVideoData === 'function') {
        const d = raw.getVideoData();
        if (d) return { id: d.video_id ? String(d.video_id) : null, live: d.isLive === true };
      }
    } catch (_) { /* player not initialised yet */ }
    return null;
  }

  function idFromUrl() {
    if (/^\/embed\//.test(location.pathname)) return null; // embedded playlists change video without changing URL
    if (location.pathname === '/watch') return new URLSearchParams(location.search).get('v') || null;
    const m = /^\/live\/([\w-]{6,})/.exec(location.pathname);
    return m ? m[1] : null;
  }

  function rememberLoops() {
    if (!S.videoId || !S.ranged) return;
    if (isDefaultSet()) {
      delete store.videos[S.videoId];
    } else {
      store.videos[S.videoId] = {
        loops: S.loops.map((l) => ({ a: l.a, b: l.b, n: l.count, inf: l.infinite, on: l.on, c: l.c })),
        t: Date.now(),
      };
    }
    touchedVideos.add(S.videoId);
    saveSoon();
  }

  function rememberPrefs() {
    store.prefs = { count: P.count, infinite: P.infinite, after: P.after };
    prefsTouched = true;
    saveSoon();
  }

  // Reads a stored entry back into loops, dropping anything malformed.
  function loopsFromSaved(saved, duration) {
    if (!saved || !Array.isArray(saved.loops)) return null;
    const cap = isNum(duration) && duration > 0 ? duration : Infinity;
    const out = [];
    for (const r of saved.loops) {
      if (!r || !isNum(r.a) || !isNum(r.b) || !(r.b > r.a) || r.a < 0) continue;
      // Clamp before materialising so callers don't briefly see an out-of-range loop.
      const a = clamp(r.a, 0, Math.max(0, cap - MIN_LEN));
      const b = clamp(r.b, a + MIN_LEN, cap);
      const l = newLoop(a, b, Number.isInteger(r.c) ? clamp(r.c, 0, PALETTE.length - 1) : out.length % PALETTE.length);
      if (isNum(r.n) && r.n >= 1) l.count = clamp(Math.round(r.n), 1, MAX_COUNT);
      if (typeof r.inf === 'boolean') l.infinite = r.inf;
      if (typeof r.on === 'boolean') l.on = r.on;
      out.push(l);
      if (out.length >= MAX_LOOPS) break;
    }
    return out.length ? out : null;
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
    const saved = loopsFromSaved(S.videoId ? store.videos[S.videoId] : null, d);
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
      for (const l of S.loops) {
        l.b = clamp(l.b, MIN_LEN, d);
        l.a = clamp(l.a, 0, l.b - MIN_LEN);
      }
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
    const v = p.querySelector('video.html5-main-video') || p.querySelector('video');
    if (v !== S.video) bindVideo(v);
    if (!v) return;

    const ad = isAd();
    const data = ad ? null : apiData(); // during an ad the player may report the ad's own id
    const api = data ? data.id : null;
    const url = idFromUrl();
    let id;
    if (url && api && url !== api) {
      // Mid-navigation (or an ad that isn't flagged yet): hold until both agree, but not forever.
      const now = Date.now();
      if (!S.splitAt) S.splitAt = now;
      if (now - S.splitAt < 4000) {
        S.trusted = false;
        return;
      }
      id = api;
    } else {
      S.splitAt = 0;
      id = api || url;
    }
    if (id && id !== S.videoId) switchVideo(id);
    S.trusted = !ad;
    if (ad) return;

    const d = v.duration;
    if ((data && data.live) || d === Infinity) {
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
    try { v.currentTime = t; } catch (_) { /* ignore */ }
  }

  // A loop that runs to the end of the video turns around this much early, so the player
  // never reaches "ended" (which would trigger autoplay). Hidden tabs only get coarse timing.
  function turnGuard() {
    const rate = (S.video && S.video.playbackRate) || 1;
    return document.hidden ? 0.1 + 0.3 * rate : Math.max(0.25, 0.2 * rate);
  }

  // Where a loop really turns around.
  function loopEnd(l, guard = turnGuard()) {
    return Math.max(l.a + 0.2, Math.min(l.b, S.duration - guard));
  }

  // The loop the playhead is in. When loops overlap, the one that started last (the inner one) wins.
  function loopAt(t, guard = turnGuard()) {
    let best = null;
    for (const l of S.loops) {
      if (skipped(l)) continue;
      if (t >= l.a - 0.3 && t < loopEnd(l, guard) && (!best || l.a > best.a)) best = l;
    }
    return best;
  }

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
    if (prev === null || t <= prev || t - prev > Math.max(1, v.playbackRate * 1.5)) return;
    const guard = turnGuard();
    let crossed = null;
    for (const l of S.loops) {
      if (skipped(l)) continue;
      const end = loopEnd(l, guard);
      if (prev < end && t >= end) (crossed || (crossed = [])).push(l);
    }
    if (!crossed || turnAround(crossed, false)) return;
    // Those loops have played out. Carry on if another one is still ahead.
    if (S.loops.some((l) => !skipped(l) && loopEnd(l, guard) > t)) {
      if (P.after === 'next' && !loopAt(t, guard)) {
        const next = nextLoop(t); // skip whatever lies between the loops
        if (next) seekTo(next.a);
      }
      render();
    } else {
      finishRun();
    }
  }

  // The closest loop that starts after `t` and still has plays left.
  function nextLoop(t) {
    let next = null;
    for (const l of S.loops) if (!skipped(l) && l.a > t && (!next || l.a < next.a)) next = l;
    return next;
  }

  // Counts one play for each loop that just ended; goes back to the start of the
  // first one (inner loops first) that still has plays left.
  function turnAround(crossed, fromEnded) {
    crossed.sort((x, y) => y.a - x.a);
    for (const l of crossed) {
      l.done += 1;
      if (!exhausted(l)) {
        seekTo(l.a);
        if (fromEnded) play();
        render();
        replay(ui.badge, 'ysl-pop');
        return true;
      }
    }
    return false;
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
    const v = S.video;
    if (!v || v.seeking) return;
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
    const d = S.duration;
    let a = l.a;
    let b = l.b;
    const len = Math.max(MIN_LEN, b - a);
    if (which === 'a') {
      a = clamp(round1(value), 0, d - MIN_LEN);
      if (a > b - MIN_LEN) {
        if (push) b = Math.min(d, a + len);
        else a = b - MIN_LEN;
      }
    } else {
      b = round1(value);
      if (b > d - 0.1) b = d;
      b = clamp(b, MIN_LEN, d);
      if (b < a + MIN_LEN) {
        if (push) a = Math.max(0, b - len);
        else b = Math.min(d, a + MIN_LEN);
      }
    }
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

  // Loops that overlap in time are drawn on separate rows.
  function lanesOf(loops) {
    const order = loops.map((_, i) => i).sort((x, y) => loops[x].a - loops[y].a);
    const ends = [];
    const out = new Array(loops.length).fill(0);
    for (const i of order) {
      let k = ends.findIndex((e) => e <= loops[i].a);
      if (k < 0) k = ends.length;
      ends[k] = loops[i].b;
      out[i] = k;
    }
    return out;
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
    const lanes = lanesOf(loops);
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
    ui.markBox.hidden = !(ok && (S.active || !isDefaultSet()));
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
    for (const f of [ui.field.a, ui.field.b, ui.count]) {
      if (document.activeElement === f) f.blur();
    }
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
      if (seg && document.activeElement === inp) {
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
    wheelSteps(f.input, () => document.activeElement === f.input && ready(), caretStep);
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
    const pr = p.getBoundingClientRect();
    const chrome = p.querySelector('.ytp-chrome-bottom');
    let bottom = 62;
    if (chrome) {
      const cr = chrome.getBoundingClientRect();
      if (cr.height > 0) bottom = Math.max(12, Math.round(pr.bottom - cr.top + 8));
    }
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
    const hadFocus = ui.panel.contains(document.activeElement);
    S.open = false;
    hideTip();
    ui.panel.classList.remove('ysl-open');
    render();
    if (hadFocus) ui.btn.focus({ preventScroll: true });
  }

  function buildUI() {
    ui.badge = el('span', { class: 'ysl-badge' });
    ui.btn = el('button', {
      class: 'ytp-button ysl-btn', type: 'button', title: 'Section loop', 'aria-label': 'Section loop',
      'aria-haspopup': 'dialog', 'aria-expanded': 'false',
    }, icon(I.loop, 24), ui.badge);
    ui.btn.addEventListener('click', () => (S.open ? closePanel() : openPanel()));

    ui.markBox = el('div', { class: 'ysl-marks', hidden: true });
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
      setTimeout(() => { if (document.activeElement === ui.count) ui.count.select(); }, 0);
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
    wheelSteps(ui.count, () => document.activeElement === ui.count, (dir, e) => {
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

  // YouTube is a single-page app and rebuilds parts of the player; re-attach whatever went missing.
  function ensure() {
    const p = document.getElementById('movie_player');
    if (!p) return;
    if (p !== S.player) {
      S.player = p;
      S.dirty = true;
      if (resizeWatch) {
        resizeWatch.disconnect();
        resizeWatch.observe(p);
      }
    }
    if (ui.panel.parentNode !== p) p.appendChild(ui.panel);
    if (ui.toast.parentNode !== p) p.appendChild(ui.toast);
    const host = p.querySelector('.ytp-right-controls-left') || p.querySelector('.ytp-right-controls');
    if (host && ui.btn.parentNode !== host) host.insertBefore(ui.btn, host.firstChild);
    const bar = p.querySelector('.ytp-progress-bar');
    if (bar && ui.markBox.parentNode !== bar) bar.appendChild(ui.markBox);
  }

  function isTyping(e) {
    const t = (e.composedPath && e.composedPath()[0]) || e.target;
    return !!t && t.nodeType === 1 && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
  }

  function onHotkey(e) {
    if (e.isComposing) return;
    if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (isTyping(e)) return;
    const k = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : String(e.code || '').replace(/^Key/, '').toLowerCase();
    if (k !== 'a' && k !== 'b' && k !== 'r' && k !== 's') return;
    if (!S.player || !S.player.isConnected || !S.player.getClientRects().length) return;
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

  const CSS = `
.ysl-btn{position:relative;display:inline-flex!important;align-items:center;justify-content:center;vertical-align:top}
.ysl-btn>svg{width:24px!important;height:24px!important;padding:0!important;flex:none;pointer-events:none;transition:color .2s,transform .25s cubic-bezier(.3,1.5,.5,1)}
.ysl-btn>svg path{fill:currentColor!important}
.ysl-btn[aria-expanded="true"]>svg{transform:scale(1.12)}
.ysl-btn.ysl-active>svg{color:#3ea6ff}
.ysl-badge{position:absolute;top:3px;right:5px;min-width:14px;height:14px;padding:0 3px;box-sizing:border-box;border-radius:7px;background:#3ea6ff;color:#06121f;font:700 9px/14px Roboto,Arial,sans-serif;text-align:center;transform:scale(0);transition:transform .2s cubic-bezier(.3,1.5,.5,1);pointer-events:none}
.ysl-btn.ysl-active .ysl-badge{transform:scale(1)}
.ysl-btn.ysl-active .ysl-badge.ysl-pop{animation:ysl-pop .4s}

.ysl-marks{position:absolute;left:0;right:0;top:0;height:100%;z-index:44;pointer-events:none}
.ysl-marks[hidden]{display:none}
.ysl-mark{position:absolute;top:calc(-7px - var(--lane,0) * 5px);height:3px;min-width:2px;border-radius:2px;background:rgb(var(--cv));opacity:.6;transition:opacity .2s,box-shadow .2s}
.ysl-mark::before,.ysl-mark::after{content:"";position:absolute;top:0;width:2px;height:calc(13px + var(--lane,0) * 5px);border-radius:1px;background:inherit}
.ysl-mark::before{left:0}
.ysl-mark::after{right:0}
.ysl-mark.ysl-sel{opacity:.95}
.ysl-marks.ysl-live .ysl-mark{opacity:1;box-shadow:0 0 6px rgba(var(--cv),.8)}
.ysl-marks.ysl-live .ysl-mark.ysl-spent{opacity:.35;box-shadow:none}
.ysl-mark.ysl-muted,.ysl-marks.ysl-live .ysl-mark.ysl-muted{opacity:.25;box-shadow:none}

.ysl-toast{position:absolute;left:50%;top:12%;z-index:2200;max-width:90%;box-sizing:border-box;padding:8px 14px;border-radius:999px;background:rgba(24,24,27,.94);color:#fff;font:600 13px/1.25 Roboto,Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transform:translate(-50%,-6px);pointer-events:none;transition:opacity .18s,transform .18s}
.ysl-toast.ysl-show{opacity:1;transform:translate(-50%,0)}

.ysl-panel{--acv:62,166,255;--ac:rgb(var(--acv));--ac-ink:#06121f;--line:rgba(255,255,255,.12);--mute:rgba(255,255,255,.64);
position:absolute;right:12px;bottom:62px;z-index:2200;width:344px;max-width:calc(100% - 24px);box-sizing:border-box;padding:10px 14px 14px;border-radius:14px;
background:rgba(24,24,27,.96);
box-shadow:0 12px 40px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.08);
color:#fff;font:400 13px/1.3 Roboto,"YouTube Noto",Arial,Helvetica,sans-serif;text-align:left;direction:ltr;cursor:default;-webkit-user-select:none;user-select:none;
overflow:hidden auto;overscroll-behavior:contain;scrollbar-width:thin;
opacity:0;visibility:hidden;pointer-events:none;transform:translateY(10px) scale(.97);transform-origin:100% 100%;
transition:opacity .16s ease,transform .22s cubic-bezier(.2,.9,.3,1.15),visibility 0s linear .22s}
.ysl-panel.ysl-open{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition-delay:0s}
.ysl-panel *,.ysl-panel *::before,.ysl-panel *::after{box-sizing:border-box}
.ysl-panel button{-webkit-appearance:none;appearance:none;display:inline-grid;place-items:center;margin:0;padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer}
.ysl-panel input{-webkit-appearance:none;appearance:none;min-width:0;margin:0;padding:0;border:0;border-radius:0;outline:0;background:none;box-shadow:none;color:inherit;font:inherit;-webkit-user-select:text;user-select:text;cursor:text}
.ysl-panel [hidden]{display:none!important}
.ysl-panel svg{display:block;pointer-events:none}
.ysl-panel svg path{fill:currentColor}
.ysl-panel :focus-visible{outline:2px solid var(--ac);outline-offset:1px}
.ysl-panel input:focus-visible{outline:0}

.ysl-panel .ysl-head{display:flex;align-items:flex-start;gap:4px;margin-bottom:8px}
.ysl-panel .ysl-chips{flex:1;display:flex;flex-wrap:wrap;gap:5px;min-width:0}
.ysl-panel .ysl-chip{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px 0 7px;border-radius:13px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px var(--line);color:var(--mute);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;transition:background .15s,box-shadow .15s,color .15s,opacity .15s,transform .08s}
.ysl-panel .ysl-chip i{width:8px;height:8px;border-radius:50%;background:rgb(var(--cv))}
.ysl-panel .ysl-chip b{color:#fff;font-weight:700}
.ysl-panel .ysl-chip:hover{background:rgba(255,255,255,.14)}
.ysl-panel .ysl-chip:active{transform:scale(.95)}
.ysl-panel .ysl-chip[aria-pressed="true"]{background:rgba(var(--cv),.2);box-shadow:inset 0 0 0 1.5px rgb(var(--cv));color:#fff}
.ysl-panel .ysl-chip.ysl-spent{opacity:.5}
.ysl-panel .ysl-chip.ysl-muted{opacity:.55}
.ysl-panel .ysl-chip.ysl-muted i{background:none;box-shadow:inset 0 0 0 1.5px rgb(var(--cv))}
.ysl-panel .ysl-chip.ysl-muted b{text-decoration:line-through}
.ysl-panel .ysl-chip.ysl-new{animation:ysl-in .28s cubic-bezier(.3,1.4,.5,1)}
.ysl-panel .ysl-hb{flex:none;width:26px;height:26px;border-radius:50%;color:var(--mute);transition:background .12s,color .12s,transform .08s}
.ysl-panel .ysl-hb:hover{background:rgba(255,255,255,.12);color:#fff}
.ysl-panel .ysl-hb:active{transform:scale(.9)}
.ysl-panel .ysl-add{box-shadow:inset 0 0 0 1px var(--line)}
.ysl-panel .ysl-power[aria-pressed="true"]{color:var(--ac)}
.ysl-panel .ysl-head>.ysl-hb:last-child{margin-right:-5px}

.ysl-panel .ysl-notice{display:none;margin-bottom:8px;padding:6px 10px;border-radius:8px;background:rgba(255,200,60,.14);color:#ffd874;font-size:12px}
.ysl-panel .ysl-notice.ysl-show{display:block}

.ysl-panel .ysl-body{display:grid;gap:10px;min-width:0;margin:0;padding:0;border:0;transition:opacity .2s}
.ysl-panel.ysl-off .ysl-body{opacity:.38;pointer-events:none}

.ysl-panel .ysl-track{position:relative;height:30px;cursor:pointer;touch-action:none}
.ysl-panel .ysl-lane{position:absolute;left:18px;right:18px;top:0;bottom:0;--a:0%;--b:100%;--tip:0%}
.ysl-panel .ysl-rail{position:absolute;left:-18px;right:-18px;top:50%;height:6px;margin-top:-3px;border-radius:3px;background:rgba(255,255,255,.16)}
.ysl-panel .ysl-ghost{position:absolute;top:calc(50% + 5px + var(--lane,0) * 4px);height:3px;min-width:2px;border-radius:2px;background:rgb(var(--cv));opacity:.8;pointer-events:none}
.ysl-panel .ysl-ghost.ysl-muted{opacity:.3}
.ysl-panel .ysl-fill{position:absolute;left:var(--a);width:calc(var(--b) - var(--a));top:50%;height:6px;margin-top:-3px;overflow:hidden;background:var(--ac);transition:background-color .2s,opacity .2s}
.ysl-panel.ysl-muted .ysl-fill{opacity:.35}
.ysl-panel.ysl-open.ysl-running .ysl-fill::after{content:"";position:absolute;left:0;top:0;width:100%;height:100%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.5),rgba(255,255,255,0));animation:ysl-flow 1.4s linear infinite}
.ysl-panel .ysl-play{position:absolute;left:0;top:7px;bottom:7px;width:2px;margin-left:-1px;border-radius:1px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.4);pointer-events:none}
.ysl-panel.ysl-off .ysl-play{display:none}
.ysl-panel .ysl-thumb{position:absolute;top:50%;display:grid;place-items:center;width:18px;height:26px;margin-top:-13px;background:#fff;color:#0f0f0f;font-size:10px;font-weight:800;line-height:1;cursor:ew-resize;touch-action:none;box-shadow:0 1px 4px rgba(0,0,0,.45);transition:background .15s,color .15s,box-shadow .15s}
.ysl-panel .ysl-thumb-a{left:var(--a);transform:translateX(-100%);border-radius:7px 2px 2px 7px}
.ysl-panel .ysl-thumb-b{left:var(--b);border-radius:2px 7px 7px 2px}
.ysl-panel .ysl-thumb:hover,.ysl-panel .ysl-thumb.ysl-grab,.ysl-panel .ysl-thumb:focus-visible{background:var(--ac);color:var(--ac-ink)}
.ysl-panel .ysl-thumb.ysl-grab{box-shadow:0 0 0 5px rgba(var(--acv),.28)}
.ysl-panel .ysl-tip{position:absolute;left:var(--tip);bottom:100%;padding:2px 7px;border-radius:6px;background:#fff;color:#0f0f0f;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;opacity:0;transform:translate(-50%,4px);pointer-events:none;transition:opacity .12s,transform .12s}
.ysl-panel .ysl-tip.ysl-show{opacity:1;transform:translate(-50%,0)}
.ysl-panel .ysl-scale{display:flex;align-items:center;justify-content:space-between;margin-top:1px;color:var(--mute);font-size:11px;font-variant-numeric:tabular-nums}
.ysl-panel .ysl-scale>span:first-child,.ysl-panel .ysl-scale>span:last-child{flex:1 1 0}
.ysl-panel .ysl-scale>span:last-child{text-align:right}
.ysl-panel .ysl-mid{display:flex;align-items:center;gap:5px}
.ysl-panel .ysl-len{color:#fff;font-weight:600}
.ysl-panel .ysl-zoom{width:20px;height:18px;border-radius:5px;color:var(--mute);transition:background .12s,color .12s}
.ysl-panel .ysl-zoom:hover{background:rgba(255,255,255,.14);color:#fff}
.ysl-panel .ysl-zoom[aria-pressed="true"],.ysl-panel .ysl-zoom[aria-pressed="true"]:hover{background:var(--ac);color:var(--ac-ink)}

.ysl-panel .ysl-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ysl-panel .ysl-opts{grid-template-columns:116px 1fr}
.ysl-panel .ysl-field{min-width:0}
.ysl-panel .ysl-label{display:flex;align-items:center;gap:6px;height:15px;margin-bottom:4px;color:var(--mute);font-size:10.5px;font-weight:600;letter-spacing:.6px;text-transform:uppercase}
.ysl-panel .ysl-tag{display:grid;place-items:center;width:15px;height:15px;border-radius:4px;background:rgba(255,255,255,.14);color:#fff;font-size:9.5px;font-weight:800;letter-spacing:0}
.ysl-panel .ysl-box{display:flex;align-items:center;height:34px;padding:0 3px;border-radius:9px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow .15s,background .15s}
.ysl-panel .ysl-box:hover{background:rgba(255,255,255,.11)}
.ysl-panel .ysl-box:focus-within{background:rgba(var(--acv),.1);box-shadow:inset 0 0 0 1.5px var(--ac)}
.ysl-panel .ysl-time,.ysl-panel .ysl-num{flex:1 1 0;width:0;height:100%;text-align:center;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.2px}
.ysl-panel .ysl-num[readonly]{font-size:17px;cursor:pointer}
.ysl-panel .ysl-ib{flex:none;width:22px;height:26px;border-radius:6px;color:var(--mute);transition:background .12s,color .12s,transform .08s}
.ysl-panel .ysl-ib:hover{background:rgba(255,255,255,.14);color:#fff}
.ysl-panel .ysl-ib:active{transform:scale(.88)}
.ysl-panel .ysl-now{width:24px;color:var(--ac)}
.ysl-panel .ysl-now:hover{color:var(--ac)}
.ysl-panel .ysl-now.ysl-flash{animation:ysl-ping .45s}
.ysl-panel .ysl-inf{width:26px;margin-left:2px;font-size:16px;font-weight:700;line-height:1}
.ysl-panel .ysl-inf[aria-pressed="true"],.ysl-panel .ysl-inf[aria-pressed="true"]:hover{background:var(--ac);color:var(--ac-ink)}
.ysl-panel .ysl-shake{animation:ysl-shake .32s}
.ysl-panel .ysl-shake .ysl-box{box-shadow:inset 0 0 0 1.5px #ff6b6b}

.ysl-panel .ysl-seg{position:relative;display:grid;grid-template-columns:repeat(3,1fr);height:34px;padding:3px;border-radius:9px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px var(--line);transition:opacity .2s}
.ysl-panel .ysl-seg::before{content:"";position:absolute;top:3px;bottom:3px;left:3px;width:calc((100% - 6px) / 3);border-radius:6px;background:rgba(255,255,255,.18);transition:transform .22s cubic-bezier(.3,1.2,.5,1)}
.ysl-panel .ysl-seg[data-v="next"]::before{transform:translateX(100%)}
.ysl-panel .ysl-seg[data-v="pause"]::before{transform:translateX(200%)}
.ysl-panel .ysl-seg button{position:relative;min-width:0;border-radius:6px;color:var(--mute);font-size:11.5px;font-weight:600;white-space:nowrap;transition:color .15s}
.ysl-panel .ysl-seg button[aria-pressed="true"]{color:#fff}
.ysl-panel .ysl-seg.ysl-dim{opacity:.45}

.ysl-panel .ysl-actions{display:flex;gap:8px;margin-top:2px}
.ysl-panel .ysl-main{position:relative;flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:0;height:36px;overflow:hidden;border-radius:18px;background:var(--ac);color:var(--ac-ink);font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;transition:background .18s,color .18s,box-shadow .18s,transform .08s,filter .12s}
.ysl-panel .ysl-main:hover{filter:brightness(1.1)}
.ysl-panel .ysl-main:active{transform:scale(.98)}
.ysl-panel .ysl-main>*{position:relative}
.ysl-panel .ysl-main.ysl-on{background:rgba(255,255,255,.1);color:#fff;box-shadow:inset 0 0 0 1px var(--line)}
.ysl-panel .ysl-main-fill{position:absolute;inset:0;background:rgba(var(--acv),.38);opacity:0;transform:scaleX(0);transform-origin:0 50%;pointer-events:none}
.ysl-panel .ysl-main.ysl-on .ysl-main-fill{opacity:1}
.ysl-panel .ysl-ic-stop,.ysl-panel .ysl-on .ysl-ic-idle{display:none}
.ysl-panel .ysl-on .ysl-ic-stop{display:block}
.ysl-panel .ysl-start{flex:none;width:36px;height:36px;border-radius:50%;background:rgba(var(--acv),.18);color:var(--ac);box-shadow:inset 0 0 0 1px rgba(var(--acv),.5);transition:background .12s,color .12s,transform .08s}
.ysl-panel .ysl-start:hover{background:var(--ac);color:var(--ac-ink)}
.ysl-panel .ysl-start:active{transform:scale(.92)}
.ysl-panel .ysl-reset{flex:none;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.08);color:var(--mute);box-shadow:inset 0 0 0 1px var(--line);transition:background .12s,color .12s,transform .3s}
.ysl-panel .ysl-reset:hover{background:rgba(255,255,255,.14);color:#fff}
.ysl-panel .ysl-reset:active{transform:rotate(-120deg)}

@keyframes ysl-pop{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}
@keyframes ysl-in{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes ysl-flow{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
@keyframes ysl-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
@keyframes ysl-ping{0%{box-shadow:0 0 0 0 rgba(var(--acv),.7)}100%{box-shadow:0 0 0 9px rgba(var(--acv),0)}}
@media (prefers-reduced-motion:reduce){.ysl-panel,.ysl-panel *,.ysl-panel *::before,.ysl-btn *,.ysl-toast{animation:none!important;transition-duration:.01s!important}}
`;

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  const style = document.createElement('style');
  style.id = 'ysl-style';
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);

  buildUI();
  render();
  ensure();
  syncVideo();

  // Safety net for whatever YouTube's events don't announce.
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

  for (const t of ['yt-navigate-start', 'yt-navigate-finish', 'yt-page-data-updated', 'yt-player-updated']) {
    document.addEventListener(t, () => {
      ensure();
      S.dirty = true;
      scheduleSync();
    });
  }
  document.addEventListener('fullscreenchange', () => { if (S.open) requestAnimationFrame(place); });
  window.addEventListener('keydown', onHotkey, true);
  window.addEventListener('pagehide', flushStore);
})();
