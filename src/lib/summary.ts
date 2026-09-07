// Plan-level statistics for the sidebar overview, kept as pure functions so both the
// sidebar and the results panel read the same numbers from one place.

import { isPanelEnabled } from './panels';
import type { Config, Layout, Surface } from './types';

export type InputStats = {
  surfaceCount: number;
  /** cm², the gross rectangle of every surface — render with fmt.area. */
  totalArea: number;
  /** Keep-outs across every surface, not just the active one. */
  keepOutCount: number;
  panelModels: number;
  panelModelsEnabled: number;
};

export type ResultStats = {
  totalPower: number;
  panelCount: number;
  usedArea: number; // cm²
  /** Panel area over free surface area, 0..1; 0 when nothing is usable. */
  coverage: number;
};

/** What the plan is configured with, independent of whether it has been optimized. */
export function planInputStats(c: Config): InputStats {
  return {
    surfaceCount: c.surfaces.length,
    totalArea: c.surfaces.reduce((s, x) => s + x.width * x.height, 0),
    keepOutCount: c.surfaces.reduce((s, x) => s + x.keepOuts.length, 0),
    panelModels: c.panelOptions.length,
    panelModelsEnabled: c.panelOptions.filter(isPanelEnabled).length,
  };
}

/**
 * Totals across the layout currently shown for each surface, or null when no surface has
 * one. Surfaces without a layout contribute nothing — not even usable area, which would
 * otherwise drag the coverage of a partially computed plan down for no reason.
 */
export function planResultStats(
  surfaces: Surface[],
  selected: Record<string, Layout | null>,
): ResultStats | null {
  const chosen = surfaces.map((s) => selected[s.id]).filter((l): l is Layout => !!l);
  if (chosen.length === 0) return null;
  const usedArea = chosen.reduce((s, l) => s + l.usedArea, 0);
  const usableArea = chosen.reduce((s, l) => s + l.usableArea, 0);
  return {
    totalPower: chosen.reduce((s, l) => s + l.totalPower, 0),
    panelCount: chosen.reduce((s, l) => s + l.panelCount, 0),
    usedArea,
    coverage: usableArea > 0 ? usedArea / usableArea : 0,
  };
}
