import type { Config, Layout, Placement, PanelOption, Rect } from './types';
import { insetRect, expandRect, subtractAll, area, isEmpty } from './geometry';
import { packInOrder, splitFree, prune, type ModelCandidate, type FitRule } from './packing';

function innerRect(config: Config): Rect {
  return insetRect({ x: 0, y: 0, w: config.roof.width, h: config.roof.height }, config.edgeMargin);
}

/**
 * Build the free rectangles the packer fills. Panels are packed as footprints
 * (panel + gap) and centered within them, so the pack region is the roof inset by
 * the edge margin then *expanded* by half the gap — letting a panel's trailing
 * half-gap overhang the boundary instead of wasting a full gap. Keep-outs are
 * grown by half the gap for the same reason; centering then keeps a full gap
 * between any panel and a keep-out.
 *
 * The result are *maximal* rectangles (they may overlap at the corners), so a
 * keep-out in the middle of the roof still leaves full-height columns to its left
 * and right rather than fragments clipped to its vertical band. The packer splits
 * every free rectangle against each placed panel, so overlapping inputs are safe.
 */
export function buildFreeRects(config: Config): Rect[] {
  const inner = innerRect(config);
  if (isEmpty(inner)) return [];
  const half = config.panelGap / 2;
  let free: Rect[] = [expandRect(inner, half)];
  for (const k of config.keepOuts) {
    const hole = expandRect(k, half);
    free = free.flatMap((f) => splitFree(f, hole));
    free = prune(free);
  }
  return free.filter((r) => !isEmpty(r));
}

/**
 * Exact usable area (cm²): the roof inset by the edge margin, minus each keep-out
 * grown by the full gap clearance. A non-overlapping partition, so it is safe to
 * sum; used as the coverage denominator.
 */
export function usableArea(config: Config): number {
  const inner = innerRect(config);
  if (isEmpty(inner)) return 0;
  const holes = config.keepOuts.map((k) => expandRect(k, config.panelGap));
  return subtractAll([inner], holes).reduce((s, r) => s + area(r), 0);
}

// Orientation mode: allow both rotations, or lock to wide/tall (helps uniform grids).
export type OrientMode = 'free' | 'wide' | 'tall';

export function orientationsFor(opt: PanelOption, gap: number, mode: OrientMode) {
  if (opt.width <= 0 || opt.height <= 0) return [];
  const base = { fw: opt.width + gap, fh: opt.height + gap, bw: opt.width, bh: opt.height, rotated: false };
  if (opt.width === opt.height) return [base];
  const rotated = { fw: opt.height + gap, fh: opt.width + gap, bw: opt.height, bh: opt.width, rotated: true };
  if (mode === 'wide') return [base.bw >= base.bh ? base : rotated];
  if (mode === 'tall') return [base.bh > base.bw ? base : rotated];
  return [base, rotated];
}

export function toModel(opt: PanelOption, gap: number, mode: OrientMode): ModelCandidate {
  return { optionId: opt.id, power: opt.power, orientations: orientationsFor(opt, gap, mode) };
}

const density = (o: PanelOption) => o.power / (o.width * o.height);
const optArea = (o: PanelOption) => o.width * o.height;

// Small deterministic PRNG so optimization output is reproducible.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type SortKey = (a: PanelOption, b: PanelOption) => number;
const SORT_KEYS: SortKey[] = [
  (a, b) => density(b) - density(a), // highest Wp per cm² first
  (a, b) => optArea(b) - optArea(a), // largest panels first
  (a, b) => b.power - a.power, // highest absolute power first
  (a, b) => optArea(a) - optArea(b), // smallest first (fill gaps)
];

/**
 * Generate the candidate priority orderings each packing strategy tries.
 *
 * Beyond the basic sorts, this adds two families that keep the optimizer robust as
 * panel options are added:
 *  - **single-model fills** — pack with only one model, so a clean uniform layout
 *    is always evaluated however many options exist.
 *  - **each-option-last** — for every sort and every option, push that option to
 *    lowest priority. A newly added option can then only fill leftover gaps after
 *    the proven models are placed, never steal space from them. Without this,
 *    adding an option can interleave it mid-sequence and *lower* the best result.
 */
function buildOrderings(options: PanelOption[]): PanelOption[][] {
  const valid = options.filter((o) => o.width > 0 && o.height > 0 && o.power > 0);
  if (valid.length === 0) return [];

  const lists: PanelOption[][] = [];
  for (const key of SORT_KEYS) lists.push([...valid].sort(key));

  if (valid.length > 1) {
    for (const key of SORT_KEYS) {
      for (const last of valid) {
        const others = valid.filter((o) => o !== last).sort(key);
        lists.push([...others, last]);
      }
    }
  }

  for (const only of valid) lists.push([only]); // single-model fills

  const rng = mulberry32(0x501a4);
  for (let i = 0; i < 4; i++) lists.push(shuffled(valid, rng));

  // De-duplicate identical id sequences so we don't repeat packs.
  const seen = new Set<string>();
  return lists.filter((l) => {
    const key = l.map((o) => o.id).join('>');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function summarize(placements: Placement[], usable: number): Layout {
  const usedArea = placements.reduce((s, p) => s + p.w * p.h, 0);
  const totalPower = placements.reduce((s, p) => s + p.power, 0);
  return {
    placements,
    totalPower,
    panelCount: placements.length,
    usedArea,
    usableArea: usable,
    coverage: usable > 0 ? usedArea / usable : 0,
  };
}

/** Signature identifying a layout by its panel composition (per-model counts). */
export function compositionKey(placements: Placement[]): string {
  if (placements.length === 0) return 'empty';
  const counts = new Map<string, number>();
  for (const p of placements) counts.set(p.optionId, (counts.get(p.optionId) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, n]) => `${id}:${n}`)
    .join('|');
}

// Cap on tightened geometries so worst-case runtime stays bounded with many keep-outs.
const MAX_TIGHTENED = 28;

/**
 * Geometries to pack into. The first is the real free space; the rest are
 * *tightened* — each keep-out enlarged a little, or a slightly larger edge margin.
 * A layout that avoids a larger keep-out (or stays inside a smaller roof) is always
 * valid for the real config, so packing these and keeping the best can only help.
 *
 * This fixes a greedy-instability class where the best packing needs a region to be
 * treated as slightly *smaller* than it is (e.g. capping a region just tall enough for
 * a vertical panel so panels band horizontally instead) — which a pure greedy on the
 * real geometry never discovers. Geometries are generated level-major (every keep-out
 * at +1cm first, then +2cm, …) so the most useful, smallest tightenings survive the cap.
 */
export function packGeometries(config: Config): Rect[][] {
  const out: Rect[][] = [buildFreeRects(config)];
  const tightened: Rect[][] = [];

  for (const lv of [1, 2, 3, 5]) {
    for (let i = 0; i < config.keepOuts.length; i++) {
      const keepOuts = config.keepOuts.map((k, j) =>
        j === i ? { ...k, x: k.x - lv, y: k.y - lv, w: k.w + 2 * lv, h: k.h + 2 * lv } : k,
      );
      const free = buildFreeRects({ ...config, keepOuts });
      if (free.length > 0) tightened.push(free);
    }
    const margin = buildFreeRects({ ...config, edgeMargin: config.edgeMargin + lv });
    if (margin.length > 0) tightened.push(margin);
  }

  return out.concat(tightened.slice(0, MAX_TIGHTENED));
}

/**
 * Compute distinct optimized layouts, best first. Sweeps priority orderings × fit
 * rules × orientation modes over the real geometry plus tightened variants (see
 * {@link packGeometries}), keeps the first layout of each unique panel composition,
 * and returns up to `max` sorted by total Wp (ties broken toward fewer panels). The
 * number returned reflects how many genuinely different options exist.
 */
export function optimizeVariants(config: Config, max = 5): Layout[] {
  const usable = usableArea(config);
  const valid = config.panelOptions.filter((o) => o.width > 0 && o.height > 0 && o.power > 0);
  if (valid.length === 0 || isEmpty(innerRect(config))) {
    return [summarize([], usable)];
  }

  const rules: FitRule[] = ['short', 'area', 'long'];
  const modes: OrientMode[] = ['free', 'wide', 'tall'];
  const orderings = buildOrderings(config.panelOptions);
  const byComposition = new Map<string, Layout>();

  for (const free of packGeometries(config)) {
    if (free.length === 0) continue;
    for (const ordering of orderings) {
      for (const mode of modes) {
        const models = ordering.map((o) => toModel(o, config.panelGap, mode));
        for (const rule of rules) {
          const placements = packInOrder(free, models, rule);
          const key = compositionKey(placements);
          if (!byComposition.has(key)) byComposition.set(key, summarize(placements, usable));
        }
      }
    }
  }

  let variants = [...byComposition.values()];
  // Drop the "nothing placed" option if any real layout exists.
  const nonEmpty = variants.filter((v) => v.placements.length > 0);
  if (nonEmpty.length > 0) variants = nonEmpty;

  variants.sort((a, b) => b.totalPower - a.totalPower || a.panelCount - b.panelCount);
  return variants.slice(0, max);
}

/** Convenience: the single best layout (highest total Wp). */
export function optimize(config: Config): Layout {
  return optimizeVariants(config, 1)[0];
}
