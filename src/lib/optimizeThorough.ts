import type { Layout, PanelOption, Placement, Rect, SurfaceTask } from './types';
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
import { rankLayouts, type RankOptions } from './ranking';
import { packablePanels } from './panels';

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
  rank?: RankOptions; // secondary criteria used to order the results (not the search)
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
 * randomized greedy pass. Walks plateaus (a candidate matching the current power is
 * accepted as the new starting point, so equal-Wp rearrangements can unlock later
 * gains) but only ever returns the highest-Wp layout seen.
 */
function localSearch(
  start: Placement[],
  geom: Rect[],
  valid: PanelOption[],
  config: SurfaceTask,
  rng: () => number,
  steps: number,
): Placement[] {
  const gap = config.panelGap;
  let current = start;
  let currentPower = totalPower(current);
  let best = start;
  let bestPower = currentPower;

  for (let step = 0; step < steps; step++) {
    const ruin: Rect = {
      x: rng() * config.width,
      y: rng() * config.height,
      w: (0.2 + rng() * 0.5) * config.width,
      h: (0.2 + rng() * 0.5) * config.height,
    };
    const survivors = current.filter((p) => !overlaps({ x: p.x, y: p.y, w: p.w, h: p.h }, ruin));
    if (survivors.length === current.length) continue; // nothing removed

    const free = freeAround(geom, survivors, gap);
    const mode = MODES[Math.floor(rng() * MODES.length)];
    const rule = RULES[Math.floor(rng() * RULES.length)];
    const models = shuffled(valid, rng).map((o) => toModel(o, gap, mode));
    const refill = packInOrder(free, models, rule, rng, 0.15 + rng() * 0.35);

    const candidate = [...survivors, ...refill];
    const power = totalPower(candidate);
    if (power >= currentPower - EPS) {
      current = candidate;
      currentPower = power;
    }
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

// Elite pool: the best distinct-composition layouts an island has found so far,
// exploited by that island's intensification iterations.
const ELITE_MAX = 4;
// Independent search trajectories ("islands"), each with its own elite pool. All
// islands share the global result set, but climbing only within their own pool
// keeps one unlucky early basin from capturing the entire search.
const ISLANDS = 2;

/**
 * Stronger, time-budgeted optimizer. Seeds the candidate set with the fast result
 * (so it can never do worse), then alternates two kinds of iterations until the
 * budget, iteration cap, or cancellation is reached:
 *
 *  - **explore** — a fresh GRASP construction (randomized greedy over a random
 *    geometry / rule / orientation mode) followed by a short local search;
 *  - **exploit** — ruin-and-recreate around one of the best layouts found so far
 *    (the elite pool), which steadily tightens the best-known result instead of
 *    hoping a from-scratch sample lands higher.
 *
 * The exploit half is what makes the result stable: without it every iteration is
 * an independent draw, so tiny input changes (a keep-out nudged 1cm, one extra
 * panel model) visibly shift where the best sample happens to land. Iterations are
 * split round-robin across {@link ISLANDS} independent trajectories with separate
 * elite pools, so one pool converging on a mediocre basin early cannot trap the
 * whole search. Each iteration runs on its own seeded RNG stream, so randomness
 * consumed by one iteration cannot cascade into the next. Keeps the best distinct
 * compositions by total Wp, reusing the MaxRects packer and tightened geometries
 * from {@link ./optimize}.
 */
export function optimizeThorough(config: SurfaceTask, opts: ThoroughOpts = {}): Layout[] {
  const {
    budgetMs = 5000,
    maxIterations = Infinity,
    seed = 0x5ca1ab1e,
    maxResults = 5,
    rank,
    onProgress,
    shouldStop,
  } = opts;

  const usable = usableArea(config);
  const valid = packablePanels(config.panelOptions);

  // Seed with the fast result — guarantees Thorough ≥ Fast.
  const byComposition = new Map<string, Layout>();
  for (const l of optimizeVariants(config, maxResults, rank)) {
    byComposition.set(compositionKey(l.placements), l);
  }
  if (valid.length === 0) return [...byComposition.values()];

  type Elite = { key: string; power: number; placements: Placement[] };
  const islands: Elite[][] = Array.from({ length: ISLANDS }, () => []);
  const considerElite = (pool: Elite[], key: string, placements: Placement[], power: number) => {
    if (placements.length === 0) return;
    const at = pool.findIndex((e) => e.key === key);
    if (at >= 0) {
      if (power <= pool[at].power) return;
      pool.splice(at, 1);
    }
    const idx = pool.findIndex((e) => e.power < power);
    pool.splice(idx < 0 ? pool.length : idx, 0, { key, power, placements });
    if (pool.length > ELITE_MAX) pool.pop();
  };
  const consider = (pool: Elite[], placements: Placement[]) => {
    const key = compositionKey(placements);
    const power = totalPower(placements);
    const existing = byComposition.get(key);
    if (!existing || power > existing.totalPower) {
      byComposition.set(key, summarize(placements, usable));
    }
    considerElite(pool, key, placements, power);
  };
  // Seed only the first island with the fast layouts; the others build their own
  // elite pools from scratch, so at least one search trajectory stays independent
  // of the seeding.
  for (const l of byComposition.values()) considerElite(islands[0], compositionKey(l.placements), l.placements, l.totalPower);
  const snapshot = (): Layout[] => {
    let variants = [...byComposition.values()];
    const nonEmpty = variants.filter((v) => v.placements.length > 0);
    if (nonEmpty.length > 0) variants = nonEmpty;
    return rankLayouts(variants, config.panelOptions, rank, maxResults);
  };
  const bestPower = () => {
    let m = 0;
    for (const l of byComposition.values()) if (l.totalPower > m) m = l.totalPower;
    return m;
  };

  const geometries = packGeometries(config).filter((g) => g.length > 0);
  const realGeom = geometries[0];
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const start = now();
  let iterations = 0;
  let lastProgress = start;
  const emit = () =>
    onProgress?.({ bestPower: bestPower(), elapsedMs: now() - start, iterations, layouts: snapshot() });

  emit(); // publish the seeded result so an early cancel still has something to keep
  if (geometries.length === 0) return snapshot();

  while (iterations < maxIterations) {
    if (shouldStop?.()) break;
    if (now() - start >= budgetMs) break;
    iterations++;

    // Independent per-iteration stream: iteration k always sees the same randomness
    // for a given seed, no matter what earlier iterations consumed.
    const rng = mulberry32((seed ^ Math.imul(iterations, 0x9e3779b9)) >>> 0);

    const pool = islands[iterations % ISLANDS];
    const exploit = pool.length > 0 && Math.floor(iterations / ISLANDS) % 2 === 0;
    let placements: Placement[];
    if (exploit) {
      // Climb from a random elite on the real free space: an elite found on a
      // tightened geometry is always valid there, and it has the most room to
      // refill. (Tightened geometries stay the explore half's job — mixing them
      // in here measurably slows convergence.)
      const elite = pool[Math.floor(rng() * pool.length)].placements;
      placements = localSearch(elite, realGeom, valid, config, rng, 8);
    } else {
      const geom = geometries[Math.floor(rng() * geometries.length)];
      const rule = RULES[Math.floor(rng() * RULES.length)];
      const mode = MODES[Math.floor(rng() * MODES.length)];
      const models = shuffled(valid, rng).map((o) => toModel(o, config.panelGap, mode));
      const alpha = 0.1 + rng() * 0.4;
      placements = packInOrder(geom, models, rule, rng, alpha);
      placements = localSearch(placements, geom, valid, config, rng, 4);
    }
    placements = upgradePass(placements, valid, config.panelGap);
    consider(pool, placements);

    if (onProgress && now() - lastProgress > 150) {
      lastProgress = now();
      emit();
    }
  }

  emit();
  return snapshot();
}
