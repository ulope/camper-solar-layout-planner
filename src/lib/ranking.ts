import type { Layout, PanelOption } from './types';

/**
 * Optional secondary objectives. All are *lower is better* and are only ever used to
 * order layouts that already sit within a tolerance band of the best total Wp — total
 * power stays the primary objective and the search itself is unchanged.
 */
export type SecondaryCriterion = 'weight' | 'price' | 'panelTypes';

export type RankOptions = {
  /** Applied lexicographically in this order; empty means "power only". */
  criteria: SecondaryCriterion[];
  /** Fraction (0..1) below the best total Wp that still counts as equivalent. */
  tolerance: number;
};

export const DEFAULT_TOLERANCE = 0.1;
export const DEFAULT_RANK: RankOptions = { criteria: [], tolerance: DEFAULT_TOLERANCE };

export const CRITERION_LABELS: Record<SecondaryCriterion, string> = {
  weight: 'Lighter',
  price: 'Cheaper',
  panelTypes: 'Fewer panel types',
};

export const ALL_CRITERIA: SecondaryCriterion[] = ['weight', 'price', 'panelTypes'];

const EPS = 1e-9;

export function optionsById(options: PanelOption[]): Map<string, PanelOption> {
  return new Map(options.map((o) => [o.id, o]));
}

/**
 * Value of a criterion for one layout, lower being better. Missing weight/price on a
 * model counts as 0 — the UI warns when a selected criterion has gaps.
 *
 * Every criterion is a pure function of the layout's *composition* (per-model counts),
 * which is exactly what both optimizers de-duplicate on, so ranking the deduplicated
 * candidate pool never discards a better-scoring layout of the same shape.
 */
export function layoutMetric(
  layout: Layout,
  byId: Map<string, PanelOption>,
  criterion: SecondaryCriterion,
): number {
  if (criterion === 'panelTypes') {
    return new Set(layout.placements.map((p) => p.optionId)).size;
  }
  return layout.placements.reduce((sum, p) => sum + (byId.get(p.optionId)?.[criterion] ?? 0), 0);
}

/** Total weight (kg) of a layout; 0 when no model has a weight set. */
export const layoutWeight = (l: Layout, byId: Map<string, PanelOption>) =>
  layoutMetric(l, byId, 'weight');

/** Total price of a layout; 0 when no model has a price set. */
export const layoutPrice = (l: Layout, byId: Map<string, PanelOption>) =>
  layoutMetric(l, byId, 'price');

export type FieldStat = {
  total: number; // sum over the placements, missing values counted as 0
  missing: number; // distinct placed models without the field
  models: number; // distinct placed models
};

/**
 * Total for an optional field plus how complete the underlying data is, so the UI can
 * tell "no data" from a partial sum. Counted per distinct *model* rather than per
 * placement, so the figure matches what the catalog is missing.
 */
export function layoutFieldStat(
  layout: Layout,
  byId: Map<string, PanelOption>,
  field: 'weight' | 'price',
): FieldStat {
  const ids = new Set(layout.placements.map((p) => p.optionId));
  let missing = 0;
  for (const id of ids) {
    const value = byId.get(id)?.[field];
    if (!(typeof value === 'number' && value > 0)) missing++;
  }
  return { total: layoutMetric(layout, byId, field), missing, models: ids.size };
}

/** The base ordering: most Wp first, ties broken toward fewer panels. */
const byPower = (a: Layout, b: Layout) => b.totalPower - a.totalPower || a.panelCount - b.panelCount;

/**
 * Order candidate layouts, keeping at most `max`. Without criteria this is the plain
 * "most Wp wins" sort.
 *
 * With criteria, every layout within `tolerance` of the best total Wp is treated as
 * equivalent and that band is ordered by the criteria in priority order (each lower is
 * better), falling back to power. Layouts below the cutoff keep pure power order and
 * always rank after the band, so a secondary criterion can never promote a layout that
 * gives up more than the user allowed.
 *
 * The highest-Wp layout is always among the returned ones: when criteria push it beyond
 * `max` it takes the last slot, so the results always include the raw power optimum to
 * compare the criteria-preferred pick against.
 */
export function rankLayouts(
  variants: Layout[],
  options: PanelOption[],
  rank?: RankOptions,
  max = Infinity,
): Layout[] {
  const sorted = [...variants].sort(byPower);
  const criteria = rank?.criteria ?? [];
  const tolerance = rank?.tolerance ?? 0;
  if (sorted.length < 2 || criteria.length === 0 || tolerance <= 0) return sorted.slice(0, max);

  const cutoff = sorted[0].totalPower * (1 - tolerance);
  const band = sorted.filter((l) => l.totalPower >= cutoff - EPS);
  const rest = sorted.filter((l) => l.totalPower < cutoff - EPS);

  const byId = optionsById(options);
  const metrics = new Map<Layout, number[]>(
    band.map((l) => [l, criteria.map((c) => layoutMetric(l, byId, c))]),
  );

  band.sort((a, b) => {
    const ma = metrics.get(a)!;
    const mb = metrics.get(b)!;
    for (let i = 0; i < criteria.length; i++) {
      if (Math.abs(ma[i] - mb[i]) > EPS) return ma[i] - mb[i];
    }
    return byPower(a, b);
  });

  const ordered = [...band, ...rest];
  if (ordered.length <= max) return ordered;

  const kept = ordered.slice(0, max);
  if (!kept.includes(sorted[0])) kept[kept.length - 1] = sorted[0];
  return kept;
}
