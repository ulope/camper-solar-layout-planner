import type { Config, Layout, SurfaceResults } from './types';
import { optimizeVariants, taskFor } from './optimize';
import { optimizeThorough } from './optimizeThorough';
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
 * surface in turn. Each gets an equal share of whatever time is left, so a surface that
 * finishes early (iteration cap, nothing to place) donates its remainder to the rest.
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
  for (const surface of surfaces) {
    resultsBySurface[surface.id] = optimizeVariants(taskFor(config, surface), maxResults, rank);
  }
  emit(0);

  const deadline = start + budgetMs;
  for (let i = 0; i < surfaces.length; i++) {
    if (shouldStop?.()) break;
    const surface = surfaces[i];
    const remaining = deadline - now();
    if (remaining <= 0) break;

    resultsBySurface[surface.id] = optimizeThorough(taskFor(config, surface), {
      budgetMs: remaining / (surfaces.length - i),
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
