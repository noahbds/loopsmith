import { describe, expect, it } from 'vitest';
import { createStore, migrateV1 } from '../src/core/store.js';
import { fmt, parseTime } from '../src/core/util.js';

function memoryBackend(initial = {}) {
  const data = { ...initial };
  let listener = null;
  return {
    data,
    getAll: async () => ({ ...data }),
    set: async (obj) => { Object.assign(data, obj); },
    remove: async (keys) => { for (const k of keys) delete data[k]; },
    onChange(cb) { listener = cb; },
    emit: (changes) => listener && listener(changes),
  };
}

describe('store', () => {
  it('writes one key per media item', async () => {
    const b = memoryBackend();
    const s = createStore(b, { delay: 0 });
    await s.load();
    s.put('yt:abc', { loops: [{ a: 1, b: 2 }], t: 1 });
    s.setPrefs({ count: 4 });
    await s.flush();
    expect(b.data).toEqual({ 'm:yt:abc': { loops: [{ a: 1, b: 2 }], t: 1 }, prefs: { count: 4 } });
    s.put('yt:abc', null);
    await s.flush();
    expect(b.data['m:yt:abc']).toBeUndefined();
  });

  it('keeps only the newest entries above the limit', async () => {
    const b = memoryBackend();
    const s = createStore(b, { delay: 0, maxSaved: 2 });
    await s.load();
    s.put('yt:1', { loops: [], t: 1 });
    s.put('yt:2', { loops: [], t: 2 });
    s.put('yt:3', { loops: [], t: 3 });
    await s.flush();
    expect(Object.keys(b.data).sort()).toEqual(['m:yt:2', 'm:yt:3']);
  });

  it('picks up changes made in other tabs, but not older echoes', async () => {
    const b = memoryBackend({ 'm:yt:x': { loops: [], t: 5 } });
    const s = createStore(b, { delay: 0 });
    await s.load();
    b.emit({ 'm:yt:y': { loops: [], t: 1 } });
    expect(s.has('yt:y')).toBe(true);
    b.emit({ 'm:yt:x': { loops: [], t: 2 } });
    expect(s.get('yt:x').t).toBe(5);
    b.emit({ 'm:yt:x': undefined });
    expect(s.has('yt:x')).toBe(false);
  });
});

describe('migration from YouTube Section Loop 1.x', () => {
  const v1 = {
    prefs: { count: 8, infinite: false, after: 'next' },
    videos: { abc: { loops: [{ a: 1, b: 5, n: 2 }], t: 10 }, bad: 'x' },
  };

  it('copies videos and prefs once', async () => {
    const b = memoryBackend();
    const s = createStore(b, { delay: 0 });
    await s.load();
    expect(migrateV1(s, v1)).toBe(1);
    expect(s.get('yt:abc')).toEqual({ loops: [{ a: 1, b: 5, n: 2 }], t: 10 });
    expect(s.getPrefs()).toEqual(v1.prefs);
    expect(migrateV1(s, v1)).toBe(0); // already done
    await s.flush();
    expect(b.data['mig:v1']).toBeTruthy();
  });

  it('never overwrites loops already saved in the new store', async () => {
    const b = memoryBackend({ 'm:yt:abc': { loops: [{ a: 9, b: 10 }], t: 99 }, prefs: { count: 2 } });
    const s = createStore(b, { delay: 0 });
    await s.load();
    migrateV1(s, v1);
    expect(s.get('yt:abc').t).toBe(99);
    expect(s.getPrefs()).toEqual({ count: 2 });
  });

  it('copes with nothing to migrate', async () => {
    const s = createStore(memoryBackend(), { delay: 0 });
    await s.load();
    expect(migrateV1(s, null)).toBe(0);
  });
});

describe('timestamps', () => {
  it('parses the accepted forms', () => {
    expect(parseTime('9:00')).toBe(540);
    expect(parseTime('1:02:03.5')).toBe(3723.5);
    expect(parseTime('90s')).toBe(90);
    expect(parseTime('9m30s')).toBe(570);
    expect(parseTime('1h2m')).toBe(3720);
    expect(parseTime('9 30')).toBe(570);
    expect(parseTime('abc')).toBe(null);
  });
  it('formats with tenths and optional hours', () => {
    expect(fmt(570)).toBe('9:30');
    expect(fmt(3723.5)).toBe('1:02:03.5');
    expect(fmt(5, true)).toBe('0:00:05');
  });
});
