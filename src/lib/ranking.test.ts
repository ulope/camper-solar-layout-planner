import { describe, it, expect } from 'vitest';
import { layoutMetric, layoutPrice, layoutWeight, optionsById, rankLayouts } from './ranking';
import type { Layout, PanelOption, Placement } from './types';

const opt = (id: string, over: Partial<PanelOption> = {}): PanelOption => ({
  id,
  name: id,
  width: 100,
  height: 50,
  power: 100,
  ...over,
});

const place = (optionId: string, power: number): Placement => ({
  optionId,
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  rotated: false,
  power,
});

/** A layout built from (optionId, power) pairs; geometry is irrelevant to ranking. */
function layoutOf(parts: [string, number][]): Layout {
  const placements = parts.map(([id, p]) => place(id, p));
  const totalPower = placements.reduce((s, p) => s + p.power, 0);
  return {
    placements,
    totalPower,
    panelCount: placements.length,
    usedArea: placements.length * 100,
    usableArea: 10000,
    coverage: 0,
  };
}

const heavy = opt('heavy', { weight: 10, price: 100 });
const light = opt('light', { weight: 4, price: 200 });
const bare = opt('bare'); // no weight, no price
const options = [heavy, light, bare];

describe('layoutMetric', () => {
  const byId = optionsById(options);

  it('sums weight and price over placements', () => {
    const l = layoutOf([
      ['heavy', 100],
      ['light', 90],
      ['light', 90],
    ]);
    expect(layoutWeight(l, byId)).toBe(18);
    expect(layoutPrice(l, byId)).toBe(500);
  });

  it('counts a missing field as zero', () => {
    const l = layoutOf([
      ['bare', 100],
      ['heavy', 100],
    ]);
    expect(layoutWeight(l, byId)).toBe(10);
    expect(layoutPrice(l, byId)).toBe(100);
  });

  it('counts distinct models for panelTypes', () => {
    const mixed = layoutOf([
      ['heavy', 100],
      ['light', 100],
      ['heavy', 100],
    ]);
    const uniform = layoutOf([
      ['heavy', 100],
      ['heavy', 100],
      ['heavy', 100],
    ]);
    expect(layoutMetric(mixed, byId, 'panelTypes')).toBe(2);
    expect(layoutMetric(uniform, byId, 'panelTypes')).toBe(1);
  });

  it('is zero for an empty layout', () => {
    const empty = layoutOf([]);
    expect(layoutWeight(empty, byId)).toBe(0);
    expect(layoutMetric(empty, byId, 'panelTypes')).toBe(0);
  });
});

describe('rankLayouts', () => {
  // 400 Wp / 40 kg vs 380 Wp / 16 kg — 5% apart.
  const strong = layoutOf([
    ['heavy', 100],
    ['heavy', 100],
    ['heavy', 100],
    ['heavy', 100],
  ]);
  const lighter = layoutOf([
    ['light', 95],
    ['light', 95],
    ['light', 95],
    ['light', 95],
  ]);

  it('sorts by power, then fewer panels, when no criteria are set', () => {
    const ranked = rankLayouts([lighter, strong], options);
    expect(ranked.map((l) => l.totalPower)).toEqual([400, 380]);
  });

  it('leaves order untouched when criteria are set but tolerance is zero', () => {
    const ranked = rankLayouts([lighter, strong], options, {
      criteria: ['weight'],
      tolerance: 0,
    });
    expect(ranked[0]).toBe(strong);
  });

  it('prefers the lighter layout when it is inside the tolerance band', () => {
    const ranked = rankLayouts([strong, lighter], options, {
      criteria: ['weight'],
      tolerance: 0.1,
    });
    expect(ranked[0]).toBe(lighter);
    expect(ranked[1]).toBe(strong);
  });

  it('keeps the strongest layout when the lighter one falls outside the band', () => {
    const ranked = rankLayouts([strong, lighter], options, {
      criteria: ['weight'],
      tolerance: 0.01,
    });
    expect(ranked[0]).toBe(strong);
  });

  it('never promotes a below-cutoff layout above the band', () => {
    const feeble = layoutOf([['light', 50]]); // 50 Wp, 4 kg — lightest but far too weak
    const ranked = rankLayouts([strong, lighter, feeble], options, {
      criteria: ['weight'],
      tolerance: 0.1,
    });
    expect(ranked).toEqual([lighter, strong, feeble]);
  });

  it('applies criteria lexicographically in priority order', () => {
    // Equal power: one is heavier but cheaper, the other lighter but pricier, so the
    // leading criterion decides the winner.
    const heavyCheap = layoutOf([
      ['heavy', 100],
      ['heavy', 100],
    ]); // 20 kg, 200
    const lightPricey = layoutOf([
      ['light', 100],
      ['light', 100],
    ]); // 8 kg, 400

    expect(
      rankLayouts([heavyCheap, lightPricey], options, { criteria: ['weight', 'price'], tolerance: 0.1 })[0],
    ).toBe(lightPricey);
    expect(
      rankLayouts([heavyCheap, lightPricey], options, { criteria: ['price', 'weight'], tolerance: 0.1 })[0],
    ).toBe(heavyCheap);
  });

  it('falls through to the next criterion when the first ties', () => {
    const sameWeightCheap = layoutOf([
      ['heavy', 100],
      ['heavy', 100],
    ]); // 20 kg, 200
    const sameWeightPricey = layoutOf([
      ['heavy', 100],
      ['heavy', 95],
      ['bare', 5],
    ]); // 20 kg, 200 — bare has neither field
    const pricier = layoutOf([
      ['light', 100],
      ['heavy', 100],
      ['light', 0],
    ]); // 18 kg, 500

    const ranked = rankLayouts([sameWeightCheap, sameWeightPricey, pricier], options, {
      criteria: ['weight', 'price'],
      tolerance: 0.1,
    });
    expect(ranked[0]).toBe(pricier); // 18 kg beats both 20 kg layouts
    // The two 20 kg layouts tie on weight and price, so power breaks the tie.
    expect(ranked.slice(1).map((l) => l.totalPower)).toEqual([200, 200]);
  });

  it('minimizes the number of panel models when asked', () => {
    const mixed = layoutOf([
      ['heavy', 100],
      ['light', 95],
      ['heavy', 100],
      ['light', 95],
    ]);
    const uniform = layoutOf([
      ['heavy', 95],
      ['heavy', 95],
      ['heavy', 95],
      ['heavy', 95],
    ]);
    const ranked = rankLayouts([mixed, uniform], options, {
      criteria: ['panelTypes'],
      tolerance: 0.1,
    });
    expect(ranked[0]).toBe(uniform);
  });

  it('does not mutate the input array', () => {
    const input = [lighter, strong];
    rankLayouts(input, options, { criteria: ['weight'], tolerance: 0.1 });
    expect(input).toEqual([lighter, strong]);
  });
});
