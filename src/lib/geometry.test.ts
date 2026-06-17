import { describe, it, expect } from 'vitest';
import {
  area,
  contains,
  overlaps,
  intersection,
  insetRect,
  expandRect,
  subtractRect,
  subtractAll,
  snap,
} from './geometry';
import type { Rect } from './types';

const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const sumArea = (rs: Rect[]) => rs.reduce((s, r) => s + area(r), 0);

describe('snap', () => {
  it('rounds to the nearest multiple of the step', () => {
    expect(snap(12, 5)).toBe(10);
    expect(snap(13, 5)).toBe(15);
    expect(snap(7, 10)).toBe(10);
    expect(snap(25, 10)).toBe(30); // .5 rounds up
  });

  it('falls back to whole-cm rounding when the step is 0', () => {
    expect(snap(3.4, 0)).toBe(3);
    expect(snap(3.6, 0)).toBe(4);
  });
});

describe('contains / overlaps', () => {
  it('detects containment', () => {
    expect(contains(R(0, 0, 10, 10), R(2, 2, 4, 4))).toBe(true);
    expect(contains(R(0, 0, 10, 10), R(8, 8, 4, 4))).toBe(false);
  });
  it('treats touching edges as non-overlapping', () => {
    expect(overlaps(R(0, 0, 10, 10), R(10, 0, 5, 5))).toBe(false);
    expect(overlaps(R(0, 0, 10, 10), R(9, 0, 5, 5))).toBe(true);
  });
});

describe('intersection', () => {
  it('returns the overlap', () => {
    expect(intersection(R(0, 0, 10, 10), R(5, 5, 10, 10))).toEqual(R(5, 5, 5, 5));
  });
  it('returns null when disjoint', () => {
    expect(intersection(R(0, 0, 5, 5), R(10, 10, 5, 5))).toBeNull();
  });
});

describe('insetRect / expandRect', () => {
  it('insets on all sides', () => {
    expect(insetRect(R(0, 0, 10, 10), 2)).toEqual(R(2, 2, 6, 6));
  });
  it('clamps over-inset to zero size', () => {
    expect(insetRect(R(0, 0, 4, 4), 3)).toEqual({ x: 3, y: 3, w: 0, h: 0 });
  });
  it('expands on all sides', () => {
    expect(expandRect(R(2, 2, 6, 6), 2)).toEqual(R(0, 0, 10, 10));
  });
});

describe('subtractRect', () => {
  it('returns the original when there is no overlap', () => {
    expect(subtractRect(R(0, 0, 10, 10), R(20, 20, 5, 5))).toEqual([R(0, 0, 10, 10)]);
  });

  it('removes a central hole leaving four strips with correct total area', () => {
    const parts = subtractRect(R(0, 0, 10, 10), R(4, 4, 2, 2));
    expect(parts.length).toBe(4);
    expect(sumArea(parts)).toBe(100 - 4);
    // No remaining strip may overlap the hole.
    for (const p of parts) expect(intersection(p, R(4, 4, 2, 2))).toBeNull();
  });

  it('handles an edge-aligned hole', () => {
    const parts = subtractRect(R(0, 0, 10, 10), R(0, 0, 10, 3));
    expect(sumArea(parts)).toBe(70);
  });

  it('returns empty when the hole covers everything', () => {
    expect(subtractRect(R(0, 0, 10, 10), R(-1, -1, 12, 12))).toEqual([]);
  });
});

describe('subtractAll', () => {
  it('removes multiple non-overlapping holes', () => {
    const parts = subtractAll([R(0, 0, 10, 10)], [R(0, 0, 2, 2), R(8, 8, 2, 2)]);
    expect(sumArea(parts)).toBe(100 - 4 - 4);
  });
});
