import type { Rect, Placement } from './types';
import { overlaps, contains } from './geometry';

const EPS = 1e-6;

/** One orientation of a panel model, footprint includes the required gap. */
export type Orientation = {
  fw: number; // footprint width (panel + gap)
  fh: number; // footprint height (panel + gap)
  bw: number; // body width (the actual panel)
  bh: number; // body height
  rotated: boolean;
};

/** A panel model the packer may place, in priority order, in either orientation. */
export type ModelCandidate = {
  optionId: string;
  power: number;
  orientations: Orientation[];
};

/**
 * Split a free rectangle around a placed rectangle `used`, returning the
 * maximal free sub-rectangles that remain. The pieces may overlap at the
 * corners — that is intentional for the MaxRects algorithm.
 */
export function splitFree(f: Rect, used: Rect): Rect[] {
  if (!overlaps(f, used)) return [f];
  const out: Rect[] = [];
  // Left slab (full height of f).
  if (used.x > f.x + EPS) out.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
  // Right slab.
  const usedRight = used.x + used.w;
  if (usedRight < f.x + f.w - EPS) {
    out.push({ x: usedRight, y: f.y, w: f.x + f.w - usedRight, h: f.h });
  }
  // Top slab (full width of f).
  if (used.y > f.y + EPS) out.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
  // Bottom slab.
  const usedBottom = used.y + used.h;
  if (usedBottom < f.y + f.h - EPS) {
    out.push({ x: f.x, y: usedBottom, w: f.w, h: f.y + f.h - usedBottom });
  }
  return out;
}

/** Drop free rectangles that are fully contained inside another. */
export function prune(rects: Rect[]): Rect[] {
  const kept: Rect[] = [];
  for (let i = 0; i < rects.length; i++) {
    let contained = false;
    for (let j = 0; j < rects.length; j++) {
      if (i !== j && contains(rects[j], rects[i])) {
        // When two rects are identical, keep only the earlier index.
        if (!contains(rects[i], rects[j]) || i > j) {
          contained = true;
          break;
        }
      }
    }
    if (!contained) kept.push(rects[i]);
  }
  return kept;
}

function applyPlacement(free: Rect[], used: Rect): Rect[] {
  return prune(free.flatMap((f) => splitFree(f, used)));
}

/** How a candidate placement is scored against a free rectangle. */
export type FitRule = 'short' | 'long' | 'area';

type Spot = { orient: Orientation; rect: Rect; score: number };

function fitScore(leftoverH: number, leftoverV: number, freeArea: number, footArea: number, rule: FitRule): number {
  switch (rule) {
    case 'short':
      return Math.min(leftoverH, leftoverV); // best-short-side-fit
    case 'long':
      return Math.max(leftoverH, leftoverV); // best-long-side-fit
    case 'area':
      return freeArea - footArea; // best-area-fit
  }
}

/** Pick the best placement for one model across all free rectangles. */
function bestSpot(free: Rect[], model: ModelCandidate, rule: FitRule): Spot | null {
  let best: Spot | null = null;
  for (const orient of model.orientations) {
    const footArea = orient.fw * orient.fh;
    for (const f of free) {
      if (orient.fw <= f.w + EPS && orient.fh <= f.h + EPS) {
        const score = fitScore(f.w - orient.fw, f.h - orient.fh, f.w * f.h, footArea, rule);
        const rect = { x: f.x, y: f.y, w: orient.fw, h: orient.fh };
        if (!best || isBetter(score, rect, best)) best = { orient, rect, score };
      }
    }
  }
  return best;
}

/**
 * Randomized spot pick (GRASP): collect every fitting placement, then choose at
 * random among those within `alpha` of the best score (a restricted candidate list).
 * `alpha` 0 reduces to the deterministic best; 1 picks freely among all fits.
 */
function randomSpot(
  free: Rect[],
  model: ModelCandidate,
  rule: FitRule,
  rng: () => number,
  alpha: number,
): Spot | null {
  const spots: Spot[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const orient of model.orientations) {
    const footArea = orient.fw * orient.fh;
    for (const f of free) {
      if (orient.fw <= f.w + EPS && orient.fh <= f.h + EPS) {
        const score = fitScore(f.w - orient.fw, f.h - orient.fh, f.w * f.h, footArea, rule);
        spots.push({ orient, rect: { x: f.x, y: f.y, w: orient.fw, h: orient.fh }, score });
        if (score < lo) lo = score;
        if (score > hi) hi = score;
      }
    }
  }
  if (spots.length === 0) return null;
  const threshold = lo + alpha * (hi - lo);
  const rcl = spots.filter((s) => s.score <= threshold + EPS);
  return rcl[Math.floor(rng() * rcl.length)] ?? rcl[0];
}

/**
 * Lower score wins; ties go to the top-left-most position. Consolidating equal
 * placements toward the top-left keeps the remaining free space contiguous,
 * which fits noticeably more panels than picking an arbitrary tied spot.
 */
function isBetter(score: number, rect: Rect, best: Spot): boolean {
  if (score < best.score - EPS) return true;
  if (score > best.score + EPS) return false;
  if (rect.y < best.rect.y - EPS) return true;
  if (rect.y > best.rect.y + EPS) return false;
  return rect.x < best.rect.x - EPS;
}

/**
 * Greedily place panels into the free space. Models are processed in the given
 * priority order; each model is placed as many times as it fits (choosing the
 * best orientation and position per placement) before moving to the next.
 */
export function packInOrder(
  free: Rect[],
  models: ModelCandidate[],
  rule: FitRule = 'short',
  rng?: () => number,
  alpha = 0,
): Placement[] {
  let freeList = free.map((r) => ({ ...r }));
  const placements: Placement[] = [];

  for (const model of models) {
    if (model.orientations.length === 0) continue;
    // Keep placing this model until no orientation fits anywhere.
    // Guard against pathological loops with a generous cap.
    for (let guard = 0; guard < 100000; guard++) {
      const spot = rng ? randomSpot(freeList, model, rule, rng, alpha) : bestSpot(freeList, model, rule);
      if (!spot) break;
      // Center the body within its footprint so the gap is split evenly on every
      // side. This lets a panel sit flush against the usable boundary (its trailing
      // half-gap overhangs harmlessly) instead of wasting a full gap there.
      placements.push({
        optionId: model.optionId,
        x: spot.rect.x + (spot.orient.fw - spot.orient.bw) / 2,
        y: spot.rect.y + (spot.orient.fh - spot.orient.bh) / 2,
        w: spot.orient.bw,
        h: spot.orient.bh,
        rotated: spot.orient.rotated,
        power: model.power,
      });
      freeList = applyPlacement(freeList, spot.rect);
    }
  }
  return placements;
}
