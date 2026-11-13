import { describe, expect, it } from 'vitest';
import { createPeaks } from '../src/core/peaks.js';

describe('peaks', () => {
  it('knows nothing until the media has been played', () => {
    const p = createPeaks(60);
    expect([...p.columns(0, 60, 4)]).toEqual([-1, -1, -1, -1]);
    expect(p.heard()).toBe(0);
  });

  it('keeps the loudest level heard in each slice of time', () => {
    const p = createPeaks(60);
    p.add(10, 12, 0.5);
    p.add(11, 11.2, 0.9);
    p.add(11.1, 11.15, 0.2); // a quieter reading never lowers it
    const c = p.columns(10, 12, 2);
    expect(c[0]).toBeCloseTo(0.5, 1); // 10-11 s
    expect(c[1]).toBeCloseTo(0.9, 1); // 11-12 s has the loud reading
  });

  it('tells silence that was heard from time that was not', () => {
    const p = createPeaks(60);
    p.add(5, 6, 0);
    const c = p.columns(4, 8, 4);
    expect(c[0]).toBe(-1);
    expect(c[1]).toBe(0);
    expect(c[2]).toBe(-1);
  });

  it('groups several slices into one column when zoomed out', () => {
    const p = createPeaks(100);
    p.add(40, 40.05, 1);
    const c = p.columns(0, 100, 10);
    expect(c[4]).toBeCloseTo(1, 1);
    expect(c[3]).toBe(-1);
  });

  it('stays inside the media and ignores backwards ranges', () => {
    const p = createPeaks(10);
    p.add(-5, 2, 0.4);
    p.add(9, 50, 0.4);
    p.add(7, 6, 0.3);
    expect(p.heard()).toBeGreaterThan(0.3);
    expect(p.columns(0, 10, 5).every((x) => x >= -1 && x <= 1)).toBe(true);
  });

  it('counts how much has been heard', () => {
    const p = createPeaks(10);
    p.add(0, 5, 0.5);
    expect(p.heard()).toBeGreaterThan(0.45);
    expect(p.heard()).toBeLessThan(0.6);
  });
});
