import { describe, expect, it } from 'vitest';
import * as V from '../src/core/view.js';
import * as E from '../src/core/engine.js';

const loop = (a, b) => E.newLoop(a, b, 0, { count: 1, infinite: false });

describe('fitLoop', () => {
  it('leaves room around the loop', () => {
    expect(V.fitLoop(loop(30, 40), 100)).toEqual({ v0: 26, v1: 44 });
  });
  it('stays inside the media', () => {
    expect(V.fitLoop(loop(0, 10), 100)).toEqual({ v0: 0, v1: 14 });
    expect(V.fitLoop(loop(90, 100), 100)).toEqual({ v0: 86, v1: 100 });
  });
});

describe('zoomAt', () => {
  it('keeps the anchor where it is on screen', () => {
    const z = V.zoomAt({ v0: 0, v1: 100 }, 100, 2, 25);
    expect(z).toEqual({ v0: 12.5, v1: 62.5 });
    // 25 was a quarter of the way along; it still is
    expect((25 - z.v0) / (z.v1 - z.v0)).toBeCloseTo(0.25, 5);
  });
  it('zooms out to the whole media and no further', () => {
    expect(V.zoomAt({ v0: 20, v1: 40 }, 100, 0.01, 30)).toEqual({ v0: 0, v1: 100 });
  });
  it('stops zooming in at the narrowest window', () => {
    const z = V.zoomAt({ v0: 0, v1: 3 }, 100, 50, 1);
    expect(z.v1 - z.v0).toBe(V.MIN_VIEW);
  });
  it('stays inside the media at the edges', () => {
    expect(V.zoomAt({ v0: 0, v1: 100 }, 100, 4, 0)).toEqual({ v0: 0, v1: 25 });
    expect(V.zoomAt({ v0: 0, v1: 100 }, 100, 4, 100)).toEqual({ v0: 75, v1: 100 });
  });
});

describe('panBy and centerOn', () => {
  it('slides without changing the width and stops at the ends', () => {
    expect(V.panBy({ v0: 10, v1: 30 }, 100, 15)).toEqual({ v0: 25, v1: 45 });
    expect(V.panBy({ v0: 10, v1: 30 }, 100, -50)).toEqual({ v0: 0, v1: 20 });
    expect(V.panBy({ v0: 70, v1: 90 }, 100, 50)).toEqual({ v0: 80, v1: 100 });
  });
  it('puts a time in the middle', () => {
    expect(V.centerOn({ v0: 0, v1: 20 }, 100, 50)).toEqual({ v0: 40, v1: 60 });
  });
  it('knows when the whole media is shown', () => {
    expect(V.isFull(0, 100, 100)).toBe(true);
    expect(V.isFull(0, 60, 100)).toBe(false);
  });
});

describe('snapping', () => {
  const c = [10, 20, 35];
  it('takes the closest edge within the threshold', () => {
    expect(V.snapTo(19.6, c, 0.5)).toBe(20);
    expect(V.snapTo(34, c, 0.5)).toBeNull();
    expect(V.snapTo(15, [14, 16.5], 5)).toBe(14);
  });
  it('edgesOf leaves out the loop being edited', () => {
    expect(V.edgesOf([loop(1, 2), loop(3, 4), loop(5, 6)], 1)).toEqual([1, 2, 5, 6]);
  });
  it('snaps a whole loop by whichever edge is closer', () => {
    expect(V.snapWhole(10.2, 5, [10], 0.5)).toBe(10); // start lands on 10
    expect(V.snapWhole(4.9, 5, [10], 0.5)).toBe(5); // end lands on 10
    expect(V.snapWhole(50, 5, [10], 0.5)).toBeNull();
  });
});

describe('neighbours', () => {
  it('finds the loops before and after in play order, whatever the list order', () => {
    const a = loop(30, 40);
    const b = loop(5, 9);
    const c = loop(15, 20);
    const list = [a, b, c];
    expect(V.neighbours(list, 2)).toEqual({ prev: b, next: a });
    expect(V.neighbours(list, 1)).toEqual({ prev: null, next: c });
    expect(V.neighbours(list, 0)).toEqual({ prev: c, next: null });
  });
  it('has none for a single loop', () => {
    expect(V.neighbours([loop(1, 2)], 0)).toEqual({ prev: null, next: null });
  });
});
