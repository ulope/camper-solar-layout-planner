import { describe, it, expect } from 'vitest';
import { optimize, optimizeVariants, buildFreeRects, usableArea } from './optimize';
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
  keepOuts: [],
  panelOptions: [],
  ...over,
});

const bodyRect = (p: Placement): Rect => ({ x: p.x, y: p.y, w: p.w, h: p.h });

/** Assert no two placed panel bodies overlap. */
function expectNoOverlaps(placements: Placement[]) {
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      expect(overlaps(bodyRect(placements[i]), bodyRect(placements[j]))).toBe(false);
    }
  }
}

describe('buildFreeRects', () => {
  it('insets by the edge margin', () => {
    const free = buildFreeRects(baseConfig({ edgeMargin: 10 }));
    expect(free).toEqual([{ x: 10, y: 10, w: 180, h: 80 }]);
  });

  it('keeps every free rectangle clear of the half-gap-expanded keep-out', () => {
    // Panels are packed as footprints and centered, so the pack region grows the
    // keep-out by half the gap; centering then yields a full gap to any panel body.
    const config = baseConfig({ panelGap: 5, keepOuts: [{ id: 'k', x: 50, y: 40, w: 20, h: 20 }] });
    const free = buildFreeRects(config);
    const hole: Rect = { x: 47.5, y: 37.5, w: 25, h: 25 }; // expanded by gap/2
    for (const r of free) expect(overlaps(r, hole)).toBe(false);
  });

  it('keeps placed panels a full gap clear of a keep-out', () => {
    const config = baseConfig({
      panelGap: 6,
      keepOuts: [{ id: 'k', x: 90, y: 40, w: 30, h: 30 }],
      panelOptions: [panel('a', 40, 30, 50)],
    });
    const layout = optimize(config);
    expect(layout.placements.length).toBeGreaterThan(0);
    // No body may come within the full gap of the keep-out (touching at exactly the
    // gap is allowed, so test against the keep-out grown by gap).
    const cleared: Rect = { x: 84, y: 34, w: 42, h: 42 }; // keep-out grown by gap 6
    for (const p of layout.placements) {
      expect(overlaps({ x: p.x, y: p.y, w: p.w, h: p.h }, cleared)).toBe(false);
    }
  });

  it('leaves a full-height column beside a vertically-centered keep-out', () => {
    // Keep-out spans y 40..60; the column to its left must still reach the full
    // roof height (0..100), not be clipped to the keep-out's vertical band.
    const free = buildFreeRects(baseConfig({ keepOuts: [{ id: 'k', x: 80, y: 40, w: 40, h: 20 }] }));
    const leftFull = free.some((r) => r.x === 0 && r.y === 0 && r.h === 100 && r.w === 80);
    expect(leftFull).toBe(true);
  });

  it('returns nothing when the margin consumes the roof', () => {
    expect(buildFreeRects(baseConfig({ edgeMargin: 60 }))).toEqual([]);
  });
});

describe('usableArea', () => {
  it('is the roof minus margin and gap-expanded keep-outs (no double counting)', () => {
    const config = baseConfig({ panelGap: 5, keepOuts: [{ id: 'k', x: 50, y: 40, w: 20, h: 20 }] });
    // Roof 200x100 = 20000 minus the gap-expanded 30x30 hole = 900.
    expect(usableArea(config)).toBe(20000 - 900);
  });
});

describe('optimize', () => {
  it('returns an empty layout with no panel options', () => {
    const layout = optimize(baseConfig());
    expect(layout.placements).toEqual([]);
    expect(layout.totalPower).toBe(0);
  });

  it('tiles a perfectly divisible roof without overlaps', () => {
    // 200x100 roof, 100x100 panels -> exactly 2 fit.
    const layout = optimize(baseConfig({ panelOptions: [panel('p', 100, 100, 100)] }));
    expect(layout.placements.length).toBe(2);
    expect(layout.totalPower).toBe(200);
    expectNoOverlaps(layout.placements);
  });

  it('keeps every panel body inside the usable area and clear of keep-outs', () => {
    const config = baseConfig({
      edgeMargin: 5,
      panelGap: 2,
      keepOuts: [{ id: 'hatch', x: 80, y: 30, w: 40, h: 40 }],
      panelOptions: [panel('a', 50, 30, 80), panel('b', 60, 40, 120)],
    });
    const layout = optimize(config);
    expect(layout.placements.length).toBeGreaterThan(0);
    expectNoOverlaps(layout.placements);

    const usable: Rect = { x: 5, y: 5, w: 190, h: 90 };
    const keepout: Rect = { x: 80, y: 30, w: 40, h: 40 };
    for (const p of layout.placements) {
      expect(contains(usable, bodyRect(p))).toBe(true);
      expect(overlaps(bodyRect(p), keepout)).toBe(false);
    }
  });

  it('uses the full-height columns beside a vertically-centered keep-out', () => {
    // Regression: roof 390x153 with a tall keep-out centered vertically. The side
    // columns are the full roof height, so a 150-tall panel must fit there even
    // though it is taller than the keep-out's vertical band (23..135).
    const config = baseConfig({
      roof: { width: 390, height: 153 },
      keepOuts: [{ id: 'k', x: 146, y: 23, w: 77, h: 112 }],
      panelOptions: [panel('tall', 60, 150, 300)],
    });
    const layout = optimize(config);
    expect(layout.placements.length).toBeGreaterThan(0);
    expectNoOverlaps(layout.placements);
    // At least one panel spans past both keep-out edges, proving the column is
    // contiguous over the full height (impossible with the old clipped strips).
    const spans = layout.placements.some((p) => p.y < 23 && p.y + p.h > 135);
    expect(spans).toBe(true);
    // None may overlap the keep-out.
    const keepout: Rect = { x: 146, y: 23, w: 77, h: 112 };
    for (const p of layout.placements) expect(overlaps(bodyRect(p), keepout)).toBe(false);
  });

  it('uses rotation to fit a panel that only works sideways', () => {
    // Usable strip is 200x40; a 100x30 panel must stay unrotated (30<=40);
    // a 40x100 panel must rotate to fit. Give the rotating panel higher power
    // so the optimizer prefers it.
    const layout = optimize(
      baseConfig({
        roof: { width: 200, height: 40 },
        panelOptions: [panel('tall', 40, 100, 500)],
      }),
    );
    expect(layout.placements.length).toBeGreaterThan(0);
    expect(layout.placements.every((p) => p.rotated)).toBe(true);
    expectNoOverlaps(layout.placements);
  });

  it('prefers the higher total-power mix of models', () => {
    // 200x100 = 20000 cm². Option A: 100x100 @ 150Wp (density 0.015).
    // Option B: 50x50 @ 50Wp (density 0.02). B has higher density and tiles
    // fully (8 panels -> 400Wp) vs A (2 -> 300Wp). Expect B chosen.
    const layout = optimize(
      baseConfig({ panelOptions: [panel('A', 100, 100, 150), panel('B', 50, 50, 50)] }),
    );
    expect(layout.totalPower).toBe(400);
    expect(layout.placements.every((p) => p.optionId === 'B')).toBe(true);
    expectNoOverlaps(layout.placements);
  });

  it('is deterministic across runs', () => {
    const config = baseConfig({
      panelGap: 1,
      panelOptions: [panel('a', 70, 40, 90), panel('b', 55, 35, 70)],
    });
    const a = optimize(config);
    const b = optimize(config);
    expect(a.totalPower).toBe(b.totalPower);
    expect(a.placements).toEqual(b.placements);
  });
});

describe('optimizeVariants', () => {
  it('returns a single empty option when nothing fits', () => {
    const variants = optimizeVariants(baseConfig({ panelOptions: [panel('big', 999, 999, 10)] }));
    expect(variants.length).toBe(1);
    expect(variants[0].placements).toEqual([]);
  });

  it("matches optimize() for the best option and sorts by Wp descending", () => {
    const config = baseConfig({
      panelGap: 1,
      panelOptions: [panel('a', 70, 40, 90), panel('b', 55, 35, 70), panel('c', 100, 50, 110)],
    });
    const variants = optimizeVariants(config);
    expect(variants.length).toBeGreaterThanOrEqual(1);
    expect(variants.length).toBeLessThanOrEqual(5);
    // Best matches optimize() and leads the list.
    expect(variants[0].totalPower).toBe(optimize(config).totalPower);
    for (let i = 1; i < variants.length; i++) {
      expect(variants[i - 1].totalPower).toBeGreaterThanOrEqual(variants[i].totalPower);
    }
  });

  it('never lowers the best total when more panel options are added', () => {
    // Adding an option can only widen the search; the best must not get worse.
    const cfg = (panels: ReturnType<typeof panel>[]) =>
      baseConfig({
        roof: { width: 300, height: 150 },
        edgeMargin: 2,
        panelGap: 2,
        keepOuts: [{ id: 'k', x: 110, y: 50, w: 60, h: 50 }],
        panelOptions: panels,
      });
    const pool = [
      panel('a', 142, 78, 200),
      panel('b', 96, 47, 110),
      panel('c', 60, 60, 80),
      panel('d', 120, 40, 120),
      panel('e', 45, 35, 45),
    ];
    const full = optimize(cfg(pool)).totalPower;
    for (let skip = 0; skip < pool.length; skip++) {
      const subset = pool.filter((_, i) => i !== skip);
      expect(full).toBeGreaterThanOrEqual(optimize(cfg(subset)).totalPower);
    }
  });

  it('does not get worse when a keep-out is moved to a roof edge (layout-4 regression)', () => {
    // Moving "Steg 1" from y=142 to y=143 (flush with the 153-high roof) frees space,
    // so the best must not drop. A pure greedy regressed 950 -> 855 here; tightened
    // geometries recover the optimum. Also assert every placement is valid.
    const withSteg = (y: number): Config => {
      const c: Config = JSON.parse(JSON.stringify(layout4));
      c.keepOuts.find((k) => k.label === 'Steg 1')!.y = y;
      return c;
    };
    const at142 = optimize(withSteg(142)).totalPower;
    const moved = optimize(withSteg(143));
    expect(moved.totalPower).toBeGreaterThanOrEqual(at142);

    const cfg = withSteg(143);
    for (const p of moved.placements) {
      const body: Rect = { x: p.x, y: p.y, w: p.w, h: p.h };
      expect(contains({ x: 0, y: 0, w: cfg.roof.width, h: cfg.roof.height }, body)).toBe(true);
      for (const k of cfg.keepOuts) expect(overlaps(body, k)).toBe(false);
    }
    expectNoOverlaps(moved.placements);
  });

  it('returns distinct panel compositions', () => {
    const config = baseConfig({
      panelOptions: [panel('a', 70, 40, 90), panel('b', 55, 35, 70), panel('c', 100, 50, 110)],
    });
    const variants = optimizeVariants(config);
    const keys = variants.map((v) => {
      const counts = new Map<string, number>();
      for (const p of v.placements) counts.set(p.optionId, (counts.get(p.optionId) ?? 0) + 1);
      return [...counts.entries()].sort().toString();
    });
    expect(new Set(keys).size).toBe(keys.length);
  });
});
