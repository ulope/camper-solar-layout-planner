import { describe, it, expect } from 'vitest';
import { optimize } from './optimize';
import { optimizeThorough } from './optimizeThorough';
import { overlaps, contains } from './geometry';
import type { Config, PanelOption, Placement, Rect } from './types';
import layout4 from './__fixtures__/solar-layout-4.json';

const panel = (id: string, width: number, height: number, power: number): PanelOption => ({
  id,
  name: id,
  width,
  height,
  power,
});

const baseConfig = (over: Partial<Config> = {}): Config => ({
  roof: { width: 200, height: 100 },
  edgeMargin: 0,
  panelGap: 0,
  gridSnap: 1,
  keepOuts: [],
  panelOptions: [],
  ...over,
});

const bodyRect = (p: Placement): Rect => ({ x: p.x, y: p.y, w: p.w, h: p.h });

function expectNoOverlaps(placements: Placement[]) {
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      expect(overlaps(bodyRect(placements[i]), bodyRect(placements[j]))).toBe(false);
    }
  }
}

// Small fixed iteration budget keeps these tests fast and deterministic.
const FIXED = { maxIterations: 80, budgetMs: Infinity, seed: 12345 } as const;

describe('optimizeThorough', () => {
  it('produces only valid placements (inside roof, clear of keep-outs, no overlaps)', () => {
    const config = baseConfig({
      edgeMargin: 5,
      panelGap: 2,
      keepOuts: [{ id: 'hatch', x: 80, y: 30, w: 40, h: 40 }],
      panelOptions: [panel('a', 50, 30, 80), panel('b', 60, 40, 120)],
    });
    const [best] = optimizeThorough(config, FIXED);
    expect(best.placements.length).toBeGreaterThan(0);
    expectNoOverlaps(best.placements);
    const usable: Rect = { x: 5, y: 5, w: 190, h: 90 };
    const keepout: Rect = { x: 80, y: 30, w: 40, h: 40 };
    for (const p of best.placements) {
      expect(contains(usable, bodyRect(p))).toBe(true);
      expect(overlaps(bodyRect(p), keepout)).toBe(false);
    }
  });

  it('is never worse than the fast optimizer (seeded by it)', () => {
    const configs: Config[] = [
      baseConfig({ panelOptions: [panel('p', 100, 100, 100)] }), // exact tiling
      baseConfig({
        roof: { width: 300, height: 150 },
        edgeMargin: 2,
        panelGap: 2,
        keepOuts: [{ id: 'k', x: 110, y: 50, w: 60, h: 50 }],
        panelOptions: [
          panel('a', 142, 78, 200),
          panel('b', 96, 47, 110),
          panel('c', 60, 60, 80),
          panel('d', 120, 40, 120),
          panel('e', 45, 35, 45),
        ],
      }),
    ];
    for (const config of configs) {
      const fast = optimize(config).totalPower;
      const thorough = optimizeThorough(config, FIXED)[0].totalPower;
      expect(thorough).toBeGreaterThanOrEqual(fast);
    }
  });

  it('matches or beats fast on the layout-4 regression (both Steg-1 positions)', () => {
    const withSteg = (y: number): Config => {
      const c = JSON.parse(JSON.stringify(layout4)) as Config;
      c.gridSnap = 1;
      c.keepOuts.find((k) => k.label === 'Steg 1')!.y = y;
      return c;
    };
    for (const y of [142, 143]) {
      const cfg = withSteg(y);
      const fast = optimize(cfg).totalPower;
      const best = optimizeThorough(cfg, { maxIterations: 40, budgetMs: Infinity, seed: 7 })[0];
      expect(best.totalPower).toBeGreaterThanOrEqual(fast);
      expectNoOverlaps(best.placements);
      for (const p of best.placements) {
        expect(contains({ x: 0, y: 0, w: cfg.roof.width, h: cfg.roof.height }, bodyRect(p))).toBe(true);
        for (const k of cfg.keepOuts) expect(overlaps(bodyRect(p), k)).toBe(false);
      }
    }
  });

  it('is deterministic for a fixed seed and iteration budget', () => {
    const config = baseConfig({
      panelGap: 1,
      panelOptions: [panel('a', 70, 40, 90), panel('b', 55, 35, 70), panel('c', 100, 50, 110)],
    });
    const a = optimizeThorough(config, FIXED);
    const b = optimizeThorough(config, FIXED);
    expect(a[0].totalPower).toBe(b[0].totalPower);
    expect(a[0].placements).toEqual(b[0].placements);
  });

  it('returns at most maxResults distinct compositions', () => {
    const config = baseConfig({
      panelOptions: [panel('a', 70, 40, 90), panel('b', 55, 35, 70), panel('c', 100, 50, 110)],
    });
    const variants = optimizeThorough(config, { ...FIXED, maxResults: 3 });
    expect(variants.length).toBeLessThanOrEqual(3);
    const keys = variants.map((v) => {
      const counts = new Map<string, number>();
      for (const p of v.placements) counts.set(p.optionId, (counts.get(p.optionId) ?? 0) + 1);
      return [...counts.entries()].sort().toString();
    });
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('respects cooperative cancellation', () => {
    const config = baseConfig({ panelOptions: [panel('a', 40, 30, 50)] });
    // shouldStop true immediately → returns the fast-seeded result without iterating.
    const result = optimizeThorough(config, { budgetMs: Infinity, shouldStop: () => true });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].placements.length).toBeGreaterThan(0);
  });
});
