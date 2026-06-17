import type { Rect } from './types';

export const area = (r: Rect): number => r.w * r.h;

/** Snap a value to the given grid step (cm); step <= 0 rounds to whole cm. */
export const snap = (v: number, step: number): number =>
  step > 0 ? Math.round(v / step) * step : Math.round(v);

export const isEmpty = (r: Rect): boolean => r.w <= 0 || r.h <= 0;

/** True when rectangle `a` fully contains rectangle `b`. */
export function contains(a: Rect, b: Rect): boolean {
  return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
}

/** Open-interval overlap test (touching edges do not count as overlapping). */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Geometric intersection, or null when the rectangles do not overlap. */
export function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const t = Math.min(a.y + a.h, b.y + b.h);
  if (r <= x || t <= y) return null;
  return { x, y, w: r - x, h: t - y };
}

/** Shrink a rectangle inward by `m` on every side (clamped at zero). */
export function insetRect(r: Rect, m: number): Rect {
  return {
    x: r.x + m,
    y: r.y + m,
    w: Math.max(0, r.w - 2 * m),
    h: Math.max(0, r.h - 2 * m),
  };
}

/** Grow a rectangle outward by `m` on every side. */
export function expandRect(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
}

/**
 * Subtract `hole` from `r`, returning up to four rectangles covering the
 * remaining area. When they do not overlap, `r` is returned unchanged.
 */
export function subtractRect(r: Rect, hole: Rect): Rect[] {
  const overlap = intersection(r, hole);
  if (!overlap) return [r];

  const out: Rect[] = [];
  // Top strip (above the overlap).
  if (overlap.y > r.y) out.push({ x: r.x, y: r.y, w: r.w, h: overlap.y - r.y });
  // Bottom strip (below the overlap).
  const overlapBottom = overlap.y + overlap.h;
  if (overlapBottom < r.y + r.h) {
    out.push({ x: r.x, y: overlapBottom, w: r.w, h: r.y + r.h - overlapBottom });
  }
  // Left strip (beside the overlap, vertically bounded by the overlap).
  if (overlap.x > r.x) out.push({ x: r.x, y: overlap.y, w: overlap.x - r.x, h: overlap.h });
  // Right strip.
  const overlapRight = overlap.x + overlap.w;
  if (overlapRight < r.x + r.w) {
    out.push({ x: overlapRight, y: overlap.y, w: r.x + r.w - overlapRight, h: overlap.h });
  }
  return out.filter((rect) => !isEmpty(rect));
}

/** Subtract many holes from a set of rectangles. */
export function subtractAll(rects: Rect[], holes: Rect[]): Rect[] {
  let current = rects;
  for (const hole of holes) {
    current = current.flatMap((r) => subtractRect(r, hole));
  }
  return current;
}
