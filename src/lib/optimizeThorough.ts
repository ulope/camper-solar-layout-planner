import type { Config, Layout, PanelOption, Placement, Rect } from './types';
import { overlaps } from './geometry';
import { packInOrder, splitFree, prune, type FitRule } from './packing';
import {
  optimizeVariants,
  packGeometries,
  toModel,
  usableArea,
  summarize,
  compositionKey,
  mulberry32,
  shuffled,
  type OrientMode,
} from './optimize';

const EPS = 1e-6;

export type ThoroughProgress = {
  bestPower: number;
  elapsedMs: number;
  iterations: number;
  layouts: Layout[]; // current best distinct layouts, so a cancel can keep them
};

export type ThoroughOpts = {
  budgetMs?: number; // wall-clock budget (default 5000)
  maxIterations?: number; // hard iteration cap (default Infinity); tests use this for determinism
  seed?: number;
  maxResults?: number;
  onProgress?: (p: ThoroughProgress) => void;
  shouldStop?: () => boolean; // cooperative cancellation (worker cancel)
};

const RULES: FitRule[] = ['short', 'area', 'long'];
const MODES: OrientMode[] = ['free', 'wide', 'tall'];

const totalPower = (ps: Placement[]) => ps.reduce((s, p) => s + p.power, 0);

/** Footprint (body grown by half the gap on each side) actually reserved by a panel. */
function footprintOf(p: Placement, gap: number): Rect {
  return { x: p.x - gap / 2, y: p.y - gap / 2, w: p.w + gap, h: p.h + gap };
}

/** Free space within `geom` after the survivors' footprints are carved out. */
function freeAround(geom: Rect[], survivors: Placement[], gap: number): Rect[] {
  let free = geom.map((r) => ({ ...r }));
  for (const p of survivors) {
    const foot = footprintOf(p, gap);
    free = prune(free.flatMap((f) => splitFree(f, foot)));
  }
  return free.filter((r) => r.w > EPS && r.h > EPS);
}

/**
 * Ruin-and-recreate hill climb: repeatedly remove the panels intersecting a random
 * sub-rectangle, rebuild the free space from the survivors, and re-fill with a fresh
 * randomized greedy pass. Keeps a change only when it raises total Wp.
 */
function localSearch(
  start: Placement[],
  geom: Rect[],
  valid: PanelOption[],
  config: Config,
  rng: () => number,
): Placement[] {
  const gap = config.panelGap;
  const roof = config.roof;
  let best = start;
  let bestPower = totalPower(best);

  for (let step = 0; step < 4; step++) {
    const ruin: Rect = {
      x: rng() * roof.width,
      y: rng() * roof.height,
      w: (0.2 + rng() * 0.5) * roof.width,
      h: (0.2 + rng() * 0.5) * roof.height,
    };
    const survivors = best.filter((p) => !overlaps({ x: p.x, y: p.y, w: p.w, h: p.h }, ruin));
    if (survivors.length === best.length) continue; // nothing removed

    const free = freeAround(geom, survivors, gap);
    const mode = MODES[Math.floor(rng() * MODES.length)];
    const rule = RULES[Math.floor(rng() * RULES.length)];
    const models = shuffled(valid, rng).map((o) => toModel(o, gap, mode));
    const refill = packInOrder(free, models, rule, rng, 0.15 + rng() * 0.35);

    const candidate = [...survivors, ...refill];
    const power = totalPower(candidate);
    if (power > bestPower + EPS) {
      best = candidate;
      bestPower = power;
    }
  }
  return best;
}

/**
 * Upgrade pass: swap each placed panel for the highest-power model that still fits
 * inside its already-reserved footprint. Monotone — a replacement is never larger
 * than what it replaces, so no overlap can be introduced.
 */
function upgradePass(placements: Placement[], valid: PanelOption[], gap: number): Placement[] {
  return placements.map((p) => {
    const footW = p.w + gap;
    const footH = p.h + gap;
    const footX = p.x - gap / 2;
    const footY = p.y - gap / 2;
    let bestPow = p.power;
    let pick: { id: string; bw: number; bh: number; rot: boolean; power: number } | null = null;
    for (const o of valid) {
      if (o.power <= bestPow) continue;
      const orients: [number, number, boolean][] =
        o.width === o.height
          ? [[o.width, o.height, false]]
          : [
              [o.width, o.height, false],
              [o.height, o.width, true],
            ];
      for (const [bw, bh, rot] of orients) {
        if (bw + gap <= footW + EPS && bh + gap <= footH + EPS) {
          bestPow = o.power;
          pick = { id: o.id, bw, bh, rot, power: o.power };
        }
      }
    }
    if (!pick) return p;
    return {
      optionId: pick.id,
      x: footX + (footW - pick.bw) / 2,
      y: footY + (footH - pick.bh) / 2,
      w: pick.bw,
      h: pick.bh,
      rotated: pick.rot,
      power: pick.power,
    };
  });
}

/**
 * Stronger, time-budgeted optimizer. Seeds the candidate set with the fast result
 * (so it can never do worse), then runs a GRASP + ruin-and-recreate local search,
 * keeping the best distinct compositions by total Wp until the budget, iteration
 * cap, or cancellation is reached. Reuses the MaxRects packer and tightened
 * geometries from {@link ./optimize}.
 */
export function optimizeThorough(config: Config, opts: ThoroughOpts = {}): Layout[] {
  const {
    budgetMs = 5000,
    maxIterations = Infinity,
    seed = 0x5ca1ab1e,
    maxResults = 5,
    onProgress,
    shouldStop,
  } = opts;

  const usable = usableArea(config);
  const valid = config.panelOptions.filter((o) => o.width > 0 && o.height > 0 && o.power > 0);

  // Seed with the fast result — guarantees Thorough ≥ Fast.
  const byComposition = new Map<string, Layout>();
  for (const l of optimizeVariants(config, maxResults)) {
    byComposition.set(compositionKey(l.placements), l);
  }
  if (valid.length === 0) return [...byComposition.values()];

  const consider = (placements: Placement[]) => {
    const key = compositionKey(placements);
    const existing = byComposition.get(key);
    if (!existing || totalPower(placements) > existing.totalPower) {
      byComposition.set(key, summarize(placements, usable));
    }
  };
  const snapshot = (): Layout[] => {
    let variants = [...byComposition.values()];
    const nonEmpty = variants.filter((v) => v.placements.length > 0);
    if (nonEmpty.length > 0) variants = nonEmpty;
    variants.sort((a, b) => b.totalPower - a.totalPower || a.panelCount - b.panelCount);
    return variants.slice(0, maxResults);
  };
  const bestPower = () => {
    let m = 0;
    for (const l of byComposition.values()) if (l.totalPower > m) m = l.totalPower;
    return m;
  };

  const rng = mulberry32(seed);
  const geometries = packGeometries(config).filter((g) => g.length > 0);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const start = now();
  let iterations = 0;
  let lastProgress = start;
  const emit = () =>
    onProgress?.({ bestPower: bestPower(), elapsedMs: now() - start, iterations, layouts: snapshot() });

  emit(); // publish the seeded result so an early cancel still has something to keep

  while (iterations < maxIterations) {
    if (shouldStop?.()) break;
    if (now() - start >= budgetMs) break;
    iterations++;

    const geom = geometries[Math.floor(rng() * geometries.length)];
    const rule = RULES[Math.floor(rng() * RULES.length)];
    const mode = MODES[Math.floor(rng() * MODES.length)];
    const models = shuffled(valid, rng).map((o) => toModel(o, config.panelGap, mode));
    const alpha = 0.1 + rng() * 0.4;

    let placements = packInOrder(geom, models, rule, rng, alpha);
    placements = localSearch(placements, geom, valid, config, rng);
    placements = upgradePass(placements, valid, config.panelGap);
    consider(placements);

    if (onProgress && now() - lastProgress > 150) {
      lastProgress = now();
      emit();
    }
  }

  emit();
  return snapshot();
}
