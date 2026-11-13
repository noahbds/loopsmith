// The waveform: loudness heard while the media plays, drawn behind the slider.
//
// It listens to the media element through captureStream() and an AnalyserNode that is not connected
// to the speakers, so it can never change what you hear, and it makes no network request. It only
// knows what has been played, and it stays off where the browser can't capture the audio (copy-protected
// media such as Spotify, or browsers without captureStream).

import { PALETTE } from '../core/constants.js';
import { createPeaks } from '../core/peaks.js';

export function createWave(A) {
  const { S, P, ui, cur, ready, viewEnd, viewStart } = A;

  const tap = { v: null, ctx: null, an: null, src: null, stream: null, buf: null, lastT: null, tried: 0, dirty: false, drawn: 0 };
  const failed = new WeakSet(); // media that can't be captured: don't ask again
  let max = 0.2; // loudest level so far, so quiet recordings still fill the height

  function stopWave() {
    const { ctx, stream } = tap;
    tap.v = tap.ctx = tap.an = tap.src = tap.stream = tap.buf = null;
    tap.lastT = null;
    try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (_) { /* ignore */ }
    try { if (ctx && ctx.state !== 'closed') ctx.close(); } catch (_) { /* ignore */ }
  }

  function startWave(v) {
    if (failed.has(v)) {
      S.waveState = 'unavailable';
      return;
    }
    stopWave();
    if (typeof v.captureStream !== 'function' || typeof AudioContext !== 'function') {
      failed.add(v);
      S.waveState = 'unavailable';
      return;
    }
    try {
      const stream = v.captureStream();
      const tracks = stream.getAudioTracks();
      if (!tracks.length) { // the audio isn't there yet: try again a little later
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(new MediaStream(tracks));
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0;
      src.connect(an); // deliberately not connected to ctx.destination
      Object.assign(tap, { v, ctx, an, src, stream, buf: new Uint8Array(an.fftSize), lastT: null });
      S.waveState = 'live';
    } catch (_) { // copy-protected media, or capture refused
      failed.add(v);
      S.waveState = 'unavailable';
      stopWave();
    }
  }

  // Called often while the panel or the strip is up: notes how loud it is at the playhead.
  function sampleWave() {
    if (!P.wave) {
      if (tap.ctx) stopWave();
      S.waveState = 'off';
      return;
    }
    const v = S.video;
    if (!v || !ready() || !S.trusted || v.paused || v.seeking || document.hidden) {
      tap.lastT = null;
      return;
    }
    if (tap.v !== v || !tap.ctx) {
      const now = Date.now();
      if (now - tap.tried < 1000) return;
      tap.tried = now;
      startWave(v);
      if (!tap.ctx) return;
    }
    if (tap.ctx.state === 'suspended') {
      tap.ctx.resume().catch(() => {});
      return;
    }
    tap.an.getByteTimeDomainData(tap.buf);
    let peak = 0;
    for (let i = 0; i < tap.buf.length; i++) {
      const d = Math.abs(tap.buf[i] - 128);
      if (d > peak) peak = d;
    }
    const level = peak / 128;
    if (level > max) max = level;
    if (!S.peaks || S.peaks.duration !== S.duration) S.peaks = createPeaks(S.duration);
    const t = v.currentTime;
    const prev = tap.lastT;
    tap.lastT = t;
    if (prev != null && t > prev && t - prev < 1) S.peaks.add(prev, t, level);
    else S.peaks.add(t, t, level);
    tap.dirty = true;
  }

  // Stops listening when nothing on screen needs it.
  function waveGate() {
    if (tap.ctx && !S.open && !A.stripWanted()) stopWave();
  }

  // Draws the waveform of the slider's window into the canvas behind the slider.
  function drawWave() {
    const cv = ui.wave;
    const show = ready() && P.wave && S.waveState !== 'unavailable';
    cv.hidden = !show;
    if (!show || !S.open) return;
    const laneW = ui.lane.clientWidth;
    if (laneW < 20) return;
    const margin = 18; // the slider handles overhang the lane
    const w = laneW + margin * 2;
    const h = ui.track.clientHeight || 44;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const v0 = viewStart();
    const v1 = viewEnd();
    const step = 2; // px per bar
    const n = Math.max(1, Math.floor(laneW / step));
    const cols = S.peaks ? S.peaks.columns(v0, v1, n) : null;
    const l = cur();
    const [r, gg, b] = PALETTE[l.c].split(',');
    const mid = h / 2;
    const known = cols ? cols.some((c) => c >= 0) : false;
    for (let i = 0; i < n; i++) {
      const x = margin + i * step;
      const t = v0 + ((i + 0.5) / n) * (v1 - v0);
      const inside = t >= l.a && t <= l.b;
      const c = cols ? cols[i] : -1;
      if (c < 0) {
        g.fillStyle = 'rgba(255,255,255,.14)';
        g.fillRect(x, mid - 0.5, step - 0.5, 1);
        continue;
      }
      const amp = Math.min(1, Math.pow(c / Math.max(max, 0.2), 0.7));
      const bar = Math.max(2, amp * (h - 6));
      g.fillStyle = inside ? `rgba(${r},${gg},${b},.95)` : 'rgba(255,255,255,.42)';
      g.fillRect(x, mid - bar / 2, step - 0.5, bar);
    }
    if (!known && S.waveState !== 'unavailable') {
      g.fillStyle = 'rgba(255,255,255,.5)';
      g.font = '11px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('The waveform draws itself as you play', w / 2, mid - 8);
    }
    tap.dirty = false;
    tap.drawn = Date.now();
  }

  // One step of the frame loop: listen, and redraw a few times a second while new sound comes in.
  function waveTick() {
    sampleWave();
    if (S.open && tap.dirty && Date.now() - tap.drawn > 200) drawWave();
  }

  return { drawWave, sampleWave, stopWave, waveGate, waveTick };
}
