import type { Config, Surface } from './types';

/**
 * World-space gap between two stacked surfaces, in centimeters.
 *
 * Deliberately in cm rather than pixels: a pixel gap would make the stack's world extent
 * depend on the render scale, which is circular with fitting that extent to the canvas.
 */
export const SURFACE_GAP_CM = 40;

/** A surface placed in world space. Surfaces are left-aligned, so `x0` is always 0. */
export type PlacedSurface = { surface: Surface; y0: number };

/**
 * Stack surfaces top to bottom in config order.
 *
 * Vertical rather than side by side because camper surfaces are landscape — a roof is
 * wide and shallow, sidewalls more so. Stacking lets every surface span the full canvas
 * width, since the fit scale is then driven by the *widest* surface instead of by the sum
 * of all widths.
 */
export function surfaceColumn(surfaces: Surface[]): PlacedSurface[] {
  const out: PlacedSurface[] = [];
  let y = 0;
  for (const surface of surfaces) {
    out.push({ surface, y0: y });
    y += surface.height + SURFACE_GAP_CM;
  }
  return out;
}

/** Bounding box of a stack: the widest surface by the total height including gaps. */
export function columnExtent(column: PlacedSurface[]): { w: number; h: number } {
  if (column.length === 0) return { w: 0, h: 0 };
  const w = column.reduce((m, p) => Math.max(m, p.surface.width), 0);
  const last = column[column.length - 1];
  return { w, h: last.y0 + last.surface.height };
}

/** The surface containing a world-space point, or null when it lands in a gap. */
export function surfaceAtPoint(
  column: PlacedSurface[],
  wx: number,
  wy: number,
): PlacedSurface | null {
  for (const p of column) {
    if (wy < p.y0 || wy > p.y0 + p.surface.height) continue;
    if (wx < 0 || wx > p.surface.width) continue;
    return p;
  }
  return null;
}

/** The surface owning a keep-out id, or null when no surface has it. */
export function surfaceOfKeepOut(config: Config, keepOutId: string): Surface | null {
  return config.surfaces.find((s) => s.keepOuts.some((k) => k.id === keepOutId)) ?? null;
}
