// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { bilibili } from '../src/adapters/video-sites.js';
import { BUILT_IN, builtInFor } from '../src/sites.js';

describe('built-in sites', () => {
  it('maps hosts to adapters', () => {
    expect(builtInFor('www.youtube.com').adapter).toBe('youtube');
    expect(builtInFor('music.youtube.com').adapter).toBe('ytmusic');
    expect(builtInFor('artist.bandcamp.com').adapter).toBe('bandcamp');
    expect(builtInFor('player.vimeo.com').adapter).toBe('vimeo');
    expect(builtInFor('geo.dailymotion.com').adapter).toBe('dailymotion');
    expect(builtInFor('example.com')).toBe(null);
  });
  it('has match patterns for every host it claims', () => {
    for (const s of BUILT_IN) expect(s.matches.length).toBeGreaterThan(0);
  });
});

describe('bilibili keys', () => {
  const at = (path) => window.history.replaceState(null, '', path);
  it('keys by BV id and part, ignoring the language prefix', () => {
    at('/zh-Hans/video/BV1bWW96fEWW/');
    expect(bilibili.identify({ duration: 502 })).toEqual({ id: 'bilibili:BV1bWW96fEWW', live: false });
    at('/video/BV1bWW96fEWW/?p=3');
    expect(bilibili.identify({ duration: 502 }).id).toBe('bilibili:BV1bWW96fEWW?p=3');
    at('/video/BV1bWW96fEWW/?p=1');
    expect(bilibili.identify({ duration: 502 }).id).toBe('bilibili:BV1bWW96fEWW');
  });
  it('waits for the duration', () => {
    expect(bilibili.identify({ duration: NaN })).toEqual({ hold: true });
  });
});
