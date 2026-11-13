import { describe, expect, it } from 'vitest';
import { decorative, mediaKey, pickMedia, visibleArea } from '../src/core/mediakey.js';

describe('mediaKey', () => {
  it('keeps the page, identifying parameters and the rounded duration', () => {
    expect(mediaKey('https://courses.example.com/learn/lesson/?lesson=12&utm_source=x&t=40', 633.6)).toBe('courses.example.com/learn/lesson?lesson=12#634');
  });
  it('is stable whatever the parameter order or tracking noise', () => {
    const a = mediaKey('https://ex.com/w?id=5&v=abc&fbclid=1', 100);
    const b = mediaKey('https://ex.com/w?v=abc&id=5', 100.2);
    expect(a).toBe(b);
  });
  it('tells media on the same page apart by duration', () => {
    expect(mediaKey('https://ex.com/', 60)).not.toBe(mediaKey('https://ex.com/', 300));
  });
  it('handles live streams and bad URLs', () => {
    expect(mediaKey('https://ex.com/live', Infinity)).toBe('ex.com/live#live');
    expect(mediaKey('not a url', 10)).toBe(null);
  });
});

const media = (o = {}) => ({ isConnected: true, muted: false, loop: false, autoplay: false, duration: 120, paused: true, controls: false, ...o });
const rect = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h });
const VIEW = { vw: 1280, vh: 800 };

describe('picking the media', () => {
  it('ignores background loops and tiny clips', () => {
    expect(decorative(media({ muted: true, loop: true, autoplay: true }))).toBe(true);
    expect(decorative(media({ duration: 3 }))).toBe(true);
    expect(decorative(media())).toBe(false);
  });

  it('measures what is on screen only', () => {
    expect(visibleArea(rect(-100, 0, 200, 100), 1000, 1000)).toBe(100 * 100);
    expect(visibleArea(rect(0, 900, 100, 100), 1000, 800)).toBe(0);
  });

  it('prefers the largest visible video', () => {
    const small = media();
    const big = media();
    const bg = media({ muted: true, loop: true, autoplay: true });
    const items = [
      { m: bg, video: true, rect: rect(0, 0, 1280, 800) },
      { m: small, video: true, rect: rect(0, 0, 320, 180) },
      { m: big, video: true, rect: rect(0, 200, 960, 540) },
    ];
    expect(pickMedia(items, VIEW)).toBe(big);
  });

  it('prefers what the user played', () => {
    const a = media();
    const b = media();
    const items = [{ m: a, video: true, rect: rect(0, 0, 960, 540) }, { m: b, video: true, rect: rect(0, 600, 320, 180) }];
    expect(pickMedia(items, { ...VIEW, lastPlayed: b })).toBe(b);
  });

  it('holds on to the current media while looping', () => {
    const a = media();
    const b = media();
    const items = [{ m: a, video: true, rect: rect(0, 0, 320, 180) }, { m: b, video: true, rect: rect(0, 200, 960, 540) }];
    expect(pickMedia(items, { ...VIEW, current: a, keep: true })).toBe(a);
    expect(pickMedia(items, { ...VIEW, current: a, keep: false })).toBe(b);
  });

  it('falls back to audio that plays or has controls', () => {
    const silent = media();
    const player = media({ controls: true });
    const items = [{ m: silent, video: false, rect: rect(0, 0, 0, 0) }, { m: player, video: false, rect: rect(0, 0, 300, 40) }];
    expect(pickMedia(items, VIEW)).toBe(player);
  });

  it('skips videos too small to be the main one', () => {
    const thumb = media();
    expect(pickMedia([{ m: thumb, video: true, rect: rect(0, 0, 120, 68) }], VIEW)).toBe(null);
  });

  it('forgets media that left the page', () => {
    const gone = media({ isConnected: false });
    expect(pickMedia([], { ...VIEW, current: gone, keep: true, lastPlayed: gone })).toBe(null);
  });
});
