import { describe, it, expect } from 'vitest';
import { planInputStats, planResultStats } from './summary';
import type { Config, Layout, PanelOption, Surface } from './types';

const surface = (id: string, width: number, height: number, keepOuts = 0): Surface => ({
  id,
  name: id,
  width,
  height,
  keepOuts: Array.from({ length: keepOuts }, (_, i) => ({
    id: `${id}-ko-${i}`,
    x: 0,
    y: 0,
    w: 10,
    h: 10,
  })),
  allowedPanels: 'both',
});

const model = (id: string, enabled?: boolean): PanelOption => ({
  id,
  name: id,
  width: 100,
  height: 50,
  power: 100,
  ...(enabled === undefined ? {} : { enabled }),
});

const config = (over: Partial<Config> = {}): Config => ({
  surfaces: [surface('roof', 300, 180)],
  edgeMargin: 2,
  panelGap: 2,
  gridSnap: 0,
  panelOptions: [model('a')],
  ...over,
});

const layout = (over: Partial<Layout> = {}): Layout => ({
  placements: [],
  totalPower: 0,
  panelCount: 0,
  usedArea: 0,
  usableArea: 0,
  coverage: 0,
  ...over,
});

describe('planInputStats', () => {
  it('sums surface area and keep-outs across every surface', () => {
    const stats = planInputStats(
      config({ surfaces: [surface('roof', 300, 180, 2), surface('wall', 400, 90, 3)] }),
    );
    expect(stats.surfaceCount).toBe(2);
    expect(stats.totalArea).toBe(300 * 180 + 400 * 90);
    expect(stats.keepOutCount).toBe(5);
  });

  it('counts a model as selected unless it was explicitly deselected', () => {
    const stats = planInputStats(
      config({ panelOptions: [model('a'), model('b', true), model('c', false)] }),
    );
    expect(stats.panelModels).toBe(3);
    expect(stats.panelModelsEnabled).toBe(2);
  });

  it('handles an empty catalog', () => {
    const stats = planInputStats(config({ panelOptions: [] }));
    expect(stats.panelModels).toBe(0);
    expect(stats.panelModelsEnabled).toBe(0);
  });
});

describe('planResultStats', () => {
  const roof = surface('roof', 300, 180);
  const wall = surface('wall', 400, 90);

  it('is null when no surface has a layout', () => {
    expect(planResultStats([roof, wall], { roof: null, wall: null })).toBeNull();
    expect(planResultStats([], {})).toBeNull();
  });

  it('sums the layouts shown for each surface', () => {
    const stats = planResultStats([roof, wall], {
      roof: layout({ totalPower: 400, panelCount: 4, usedArea: 20000, usableArea: 50000 }),
      wall: layout({ totalPower: 200, panelCount: 2, usedArea: 10000, usableArea: 30000 }),
    });
    expect(stats).toEqual({
      totalPower: 600,
      panelCount: 6,
      usedArea: 30000,
      coverage: 30000 / 80000,
    });
  });

  it('ignores a surface that has no layout rather than counting its area', () => {
    const stats = planResultStats([roof, wall], {
      roof: layout({ totalPower: 400, panelCount: 4, usedArea: 20000, usableArea: 40000 }),
      wall: null,
    });
    expect(stats).toEqual({
      totalPower: 400,
      panelCount: 4,
      usedArea: 20000,
      coverage: 0.5,
    });
  });

  it('reports zero coverage when nothing is usable, rather than dividing by zero', () => {
    const stats = planResultStats([roof], { roof: layout() });
    expect(stats?.coverage).toBe(0);
  });
});
