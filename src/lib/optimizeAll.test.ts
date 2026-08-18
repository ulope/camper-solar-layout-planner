import { describe, it, expect } from 'vitest';
import { optimizeFastAll, optimizeThoroughAll, type MultiProgress } from './optimizeAll';
import { optimize, optimizeVariants, taskFor } from './optimize';
import type { Config, PanelOption, Surface } from './types';

const panel = (id: string, width: number, height: number, power: number): PanelOption => ({
  id,
  name: id,
  width,
  height,
  power,
});

const surface = (id: string, width: number, height: number): Surface => ({
  id,
  name: id,
  width,
  height,
  keepOuts: [],
});

const config = (surfaces: Surface[], panelOptions: PanelOption[] = [panel('p', 100, 100, 100)]): Config => ({
  surfaces,
  edgeMargin: 0,
  panelGap: 0,
  gridSnap: 1,
  panelOptions,
});

const ROOF = surface('roof', 200, 100); // fits exactly 2 of the 100x100 panel
const WALL = surface('wall', 300, 100); // fits exactly 3

describe('optimizeFastAll', () => {
  it('returns one entry per surface', () => {
    const results = optimizeFastAll(config([ROOF, WALL]));
    expect(Object.keys(results).sort()).toEqual(['roof', 'wall']);
  });

  it('optimizes each surface to its own capacity', () => {
    const results = optimizeFastAll(config([ROOF, WALL]));
    expect(results['roof'][0].totalPower).toBe(200);
    expect(results['wall'][0].totalPower).toBe(300);
  });

  it('gives a surface the same result alone as alongside a sibling', () => {
    const alone = optimizeFastAll(config([ROOF]));
    const together = optimizeFastAll(config([ROOF, WALL]));
    expect(together['roof']).toEqual(alone['roof']);
  });

  it('matches optimizeVariants on the equivalent single-surface task', () => {
    const cfg = config([ROOF]);
    expect(optimizeFastAll(cfg)['roof']).toEqual(
      optimizeVariants(taskFor(cfg, cfg.surfaces[0]), 5, undefined),
    );
  });

  it('keeps each surface\'s keep-outs to itself', () => {
    const blocked: Surface = { ...ROOF, keepOuts: [{ id: 'k', x: 0, y: 0, w: 200, h: 100 }] };
    const results = optimizeFastAll(config([blocked, WALL]));
    expect(results['roof'][0].totalPower).toBe(0);
    expect(results['wall'][0].totalPower).toBe(300);
  });
});

describe('optimizeThoroughAll', () => {
  const FIXED = { maxIterationsPerSurface: 30, budgetMs: Infinity, seed: 7 };

  it('is deterministic for a fixed seed and iteration cap', () => {
    const cfg = config([ROOF, WALL], [panel('a', 90, 45, 90), panel('b', 60, 40, 55)]);
    expect(optimizeThoroughAll(cfg, FIXED)).toEqual(optimizeThoroughAll(cfg, FIXED));
  });

  it('is never worse than fast on any surface', () => {
    const cfg = config([ROOF, WALL], [panel('a', 90, 45, 90), panel('b', 60, 40, 55)]);
    const results = optimizeThoroughAll(cfg, FIXED);
    for (const s of cfg.surfaces) {
      const fast = optimize(taskFor(cfg, s)).totalPower;
      expect(results[s.id][0].totalPower).toBeGreaterThanOrEqual(fast);
    }
  });

  it('still returns a result for every surface when cancelled immediately', () => {
    // The seed pass runs before the deep search, so a cancel cannot leave later
    // surfaces empty just because their turn never came.
    const cfg = config([ROOF, WALL]);
    const results = optimizeThoroughAll(cfg, { ...FIXED, shouldStop: () => true });
    expect(Object.keys(results).sort()).toEqual(['roof', 'wall']);
    expect(results['roof'][0].totalPower).toBe(200);
    expect(results['wall'][0].totalPower).toBe(300);
  });

  it('reports combined power and surface position as it progresses', () => {
    const cfg = config([ROOF, WALL]);
    const seen: MultiProgress[] = [];
    optimizeThoroughAll(cfg, { ...FIXED, onProgress: (p) => seen.push(p) });

    expect(seen.length).toBeGreaterThan(0);
    for (const p of seen) {
      expect(p.surfaceCount).toBe(2);
      expect(p.surfaceIndex).toBeGreaterThanOrEqual(0);
      expect(p.surfaceIndex).toBeLessThan(2);
      expect(cfg.surfaces.some((s) => s.id === p.surfaceId)).toBe(true);
    }
    // Combined from the very first event, thanks to the seed pass.
    expect(seen[0].bestPower).toBe(500);
    const powers = seen.map((p) => p.bestPower);
    expect(Math.min(...powers)).toBeGreaterThanOrEqual(500);
  });

  it('respects a shared time budget across surfaces', () => {
    const cfg = config([ROOF, WALL], [panel('a', 37, 23, 40), panel('b', 61, 29, 70)]);
    const started = Date.now();
    optimizeThoroughAll(cfg, { budgetMs: 300, seed: 3 });
    // Two surfaces share one budget rather than taking it each.
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
