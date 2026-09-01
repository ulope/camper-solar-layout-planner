import type { Config, Layout, SurfaceResults, SurfaceTask } from './types';
import { optimizeVariants, taskFor, usableArea } from './optimize';
import { optimizeThorough } from './optimizeThorough';
import { packablePanels } from './panels';
import type { RankOptions } from './ranking';

export type MultiProgress = {
  surfaceIndex: number; // 0-based index of the surface currently being searched
  surfaceCount: number;
  surfaceId: string;
  bestPower: number; // combined: sum over surfaces of their current best Wp
  elapsedMs: number; // overall wall clock across all surfaces
  resultsBySurface: SurfaceResults; // best-so-far everywhere, so a cancel can keep it
};

export type ThoroughAllOpts = {
  budgetMs?: number; // total wall-clock budget shared by all surfaces (default 5000)
  maxIterationsPerSurface?: number; // hard per-surface cap; tests use it for determinism
  seed?: number;
  maxResults?: number;
  rank?: RankOptions;
  onProgress?: (p: MultiProgress) => void;
  shouldStop?: () => boolean;
};

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Highest total Wp among a surface's alternatives. */
const bestOf = (layouts: Layout[] | undefined) =>
  layouts?.reduce((m, l) => Math.max(m, l.totalPower), 0) ?? 0;

/** Combined Wp of the current best on every surface. */
function combinedBest(results: SurfaceResults): number {
  let sum = 0;
  for (const layouts of Object.values(results)) sum += bestOf(layouts);
  return sum;
}

/**
 * How much a thorough search has to explore on one surface, used to split a shared
 * time budget between surfaces rather than handing every surface the same slice.
 *
 * The estimate is `models × capacity²`: `capacity` is how many of the smallest allowed
 * panel would fit in the usable area, and the number of *arrangements* to sift through
 * grows far faster than the number of panels does. A 75×55 cm hatch that takes two
 * panels from one catalog is exhausted in a few milliseconds; a 4×1.65 m roof with a
 * keep-out and thirty models is not, and is where every extra millisecond turns into Wp.
 */
export function searchWeight(task: SurfaceTask): number {
  const models = packablePanels(task.panelOptions);
  if (models.length === 0) return 0;
  const gap = task.panelGap;
  const smallest = Math.min(...models.map((o) => (o.width + gap) * (o.height + gap)));
  if (!(smallest > 0)) return 0;
  const capacity = Math.max(1, Math.floor(usableArea(task) / smallest));
  return models.length * capacity * capacity;
}

/**
 * Split the weights so no surface can be starved: a converged surface only needs a few
 * milliseconds, but a surface that gets *none* keeps whatever the fast sweep found, which
 * on some surfaces is a genuine step below what a moment of search reaches. An eighth of
 * an equal share is far more than any of the quick surfaces measured needs.
 */
function budgetWeights(tasks: SurfaceTask[]): number[] {
  const raw = tasks.map(searchWeight);
  const total = raw.reduce((a, b) => a + b, 0);
  if (total <= 0) return raw.map(() => 1);
  const floor = total / (8 * tasks.length);
  return raw.map((w) => Math.max(w, floor));
}

/**
 * Fast sweep across every surface.
 *
 * Surfaces are packed independently: no placement constraint crosses a surface boundary,
 * so optimizing each on its own and summing is exactly the joint optimum for total Wp.
 * (With secondary criteria this separation is an approximation — a combination that is
 * jointly cheaper inside a *global* tolerance band could differ from the per-surface
 * picks — but per-surface tolerance is the defensible reading of the user's setting, and
 * ranking the up-to-5^N combinations would swamp the results panel.)
 */
export function optimizeFastAll(config: Config, max = 5, rank?: RankOptions): SurfaceResults {
  const out: SurfaceResults = {};
  for (const surface of config.surfaces) {
    out[surface.id] = optimizeVariants(taskFor(config, surface), max, rank);
  }
  return out;
}

/**
 * Thorough search across every surface, sharing one wall-clock budget.
 *
 * Runs the fast sweep for *all* surfaces up front so an early cancel still leaves a
 * result on every surface rather than only the ones already reached, then searches each
 * surface in turn — handing that same sweep to each search rather than making it repeat
 * the most expensive step it has.
 *
 * Whatever time is left is split by {@link searchWeight}, not evenly: the surfaces differ
 * enormously in how much there is to search, and an even split spends most of the budget
 * on surfaces that were already done while the one surface that could still improve runs
 * out of time. A surface that finishes early (iteration cap, nothing to place) donates its
 * remainder to the rest, since each share is recomputed from the time actually left.
 */
export function optimizeThoroughAll(config: Config, opts: ThoroughAllOpts = {}): SurfaceResults {
  const {
    budgetMs = 5000,
    maxIterationsPerSurface,
    seed = 0x5ca1ab1e,
    maxResults = 5,
    rank,
    onProgress,
    shouldStop,
  } = opts;

  const start = now();
  const surfaces = config.surfaces;
  const tasks = surfaces.map((s) => taskFor(config, s));
  const resultsBySurface: SurfaceResults = {};

  const emit = (surfaceIndex: number) =>
    onProgress?.({
      surfaceIndex,
      surfaceCount: surfaces.length,
      surfaceId: surfaces[surfaceIndex]?.id ?? '',
      bestPower: combinedBest(resultsBySurface),
      elapsedMs: now() - start,
      resultsBySurface: { ...resultsBySurface },
    });

  // Seed pass: every surface has a usable result before the deep search begins.
  const seeded: Layout[][] = tasks.map((task) => optimizeVariants(task, maxResults, rank));
  surfaces.forEach((surface, i) => void (resultsBySurface[surface.id] = seeded[i]));
  emit(0);

  const weights = budgetWeights(tasks);
  let remainingWeight = weights.reduce((a, b) => a + b, 0);
  const deadline = start + budgetMs;
  for (let i = 0; i < surfaces.length; i++) {
    if (shouldStop?.()) break;
    const surface = surfaces[i];
    const remaining = deadline - now();
    if (remaining <= 0) break;
    // This surface's share of the time actually left, so a surface that stops early
    // hands the rest of its slice to the surfaces still to come.
    const share = remainingWeight > 0 ? (remaining * weights[i]) / remainingWeight : remaining;
    remainingWeight -= weights[i];

    resultsBySurface[surface.id] = optimizeThorough(tasks[i], {
      budgetMs: share,
      // The sweep above already produced this surface's fast layouts; re-running it
      // inside the search would cost more than the search itself gets to spend.
      seedLayouts: seeded[i],
      maxIterations: maxIterationsPerSurface,
      // Decorrelate the surfaces so they don't all walk the same random trajectory.
      seed: (seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0,
      maxResults,
      rank,
      shouldStop,
      onProgress: (p) => {
        resultsBySurface[surface.id] = p.layouts;
        emit(i);
      },
    });
    emit(i);
  }

  return resultsBySurface;
}
