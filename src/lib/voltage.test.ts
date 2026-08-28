import { describe, it, expect } from 'vitest';
import {
  SYSTEM_VOLTAGE_PRESETS,
  enforceMinVoltage,
  minVoltageFilter,
  panelVoltage,
  restrictedPanels,
  presetFor,
  satisfiesMinVoltage,
  seriesCountFor,
  unrestrictedPanels,
} from './voltage';
import type { PanelOption, Placement } from './types';

const panel = (id: string, over: Partial<PanelOption> = {}): PanelOption => ({
  id,
  name: id,
  width: 100,
  height: 50,
  power: 100,
  ...over,
});

const low = panel('low', { voltage: 12 });
const mid = panel('mid', { voltage: 24 });
const high = panel('high', { voltage: 36 });
const unknown = panel('unknown');
const catalog = [low, mid, high, unknown];

const place = (optionId: string, i: number): Placement => ({
  optionId,
  x: i * 100,
  y: 0,
  w: 100,
  h: 50,
  rotated: false,
  power: 100,
});

/** `n` panels of one model, laid out side by side. */
const placements = (optionId: string, n: number): Placement[] =>
  Array.from({ length: n }, (_, i) => place(optionId, i));

describe('panelVoltage', () => {
  it.each([
    ['a recorded voltage', low, 12],
    ['no voltage', unknown, undefined],
    ['a zero voltage', panel('zero', { voltage: 0 }), undefined],
  ])('reads %s', (_label, option, expected) => {
    expect(panelVoltage(option)).toBe(expected);
  });
});

describe('seriesCountFor', () => {
  it('demands nothing without a threshold', () => {
    expect(seriesCountFor(low, 0)).toBe(1);
  });

  it('leaves a model with no recorded voltage unrestricted', () => {
    expect(seriesCountFor(unknown, 48)).toBe(1);
  });

  it('accepts a panel that reaches the threshold on its own', () => {
    expect(seriesCountFor(mid, 24)).toBe(1);
    expect(seriesCountFor(high, 24)).toBe(1);
  });

  it('counts how many sub-threshold panels a string needs', () => {
    expect(seriesCountFor(low, 24)).toBe(2);
    expect(seriesCountFor(low, 48)).toBe(4);
    expect(seriesCountFor(mid, 48)).toBe(2);
  });

  it('does not ask for an extra panel when the division is exact', () => {
    // 24 / 12 and 48 / 24 must not round up through floating-point drift.
    for (const [v, min] of [
      [12, 24],
      [24, 48],
      [17.5, 35],
      [0.1, 0.3],
    ]) {
      expect(seriesCountFor(panel('p', { voltage: v }), min)).toBe(Math.round(min / v));
    }
  });

  it('rounds a partial string up', () => {
    expect(seriesCountFor(panel('p', { voltage: 18 }), 24)).toBe(2);
    expect(seriesCountFor(panel('p', { voltage: 10 }), 48)).toBe(5);
  });
});

describe('restrictedPanels / unrestrictedPanels', () => {
  it('splits the catalog at the threshold', () => {
    expect(restrictedPanels(catalog, 24)).toEqual([{ option: low, needed: 2 }]);
    expect(unrestrictedPanels(catalog, 24).map((o) => o.id)).toEqual(['mid', 'high', 'unknown']);
  });

  it('restricts nothing without a threshold', () => {
    expect(restrictedPanels(catalog, 0)).toEqual([]);
    expect(unrestrictedPanels(catalog, 0)).toEqual(catalog);
  });

  it('can restrict every model with a recorded voltage', () => {
    expect(restrictedPanels(catalog, 96).map((r) => r.option.id)).toEqual(['low', 'mid', 'high']);
  });
});

describe('enforceMinVoltage', () => {
  it('drops a lone panel that cannot reach the threshold', () => {
    expect(enforceMinVoltage(placements('low', 1), catalog, 24)).toEqual([]);
  });

  it('keeps the same model once enough of them are placed in series', () => {
    const two = placements('low', 2);
    expect(enforceMinVoltage(two, catalog, 24)).toEqual(two);
  });

  it('still drops a string that falls short of a higher threshold', () => {
    expect(enforceMinVoltage(placements('low', 3), catalog, 48)).toEqual([]);
    expect(enforceMinVoltage(placements('low', 4), catalog, 48)).toHaveLength(4);
  });

  it('judges each model on its own count', () => {
    const mixed = [...placements('low', 1), ...placements('mid', 1), ...placements('unknown', 1)];
    expect(enforceMinVoltage(mixed, catalog, 24).map((p) => p.optionId)).toEqual([
      'mid',
      'unknown',
    ]);
  });

  it('leaves everything in place without a threshold', () => {
    const mixed = [...placements('low', 1), ...placements('mid', 1)];
    expect(enforceMinVoltage(mixed, catalog, 0)).toEqual(mixed);
  });
});

describe('satisfiesMinVoltage', () => {
  it('accepts a compliant layout and rejects one with a short string', () => {
    expect(satisfiesMinVoltage(placements('low', 2), catalog, 24)).toBe(true);
    expect(satisfiesMinVoltage(placements('low', 1), catalog, 24)).toBe(false);
  });

  it('accepts the empty layout', () => {
    expect(satisfiesMinVoltage([], catalog, 48)).toBe(true);
  });
});

describe('minVoltageFilter', () => {
  it.each([
    ['no threshold is set', 0],
    ['no model falls below the threshold', 12],
  ])('hands back the placements untouched when %s', (_label, minVoltage) => {
    const filter = minVoltageFilter(catalog, minVoltage);
    const ps = placements('low', 1);
    expect(filter(ps)).toBe(ps); // same reference: the search does no extra work
  });

  it('defaults to no restriction', () => {
    const ps = placements('low', 1);
    expect(minVoltageFilter(catalog)(ps)).toBe(ps);
  });

  it('enforces the threshold when one applies', () => {
    expect(minVoltageFilter(catalog, 24)(placements('low', 1))).toEqual([]);
  });
});

describe('SYSTEM_VOLTAGE_PRESETS', () => {
  it('plans against the voltage the bank really charges to, not its nominal name', () => {
    expect(SYSTEM_VOLTAGE_PRESETS).toEqual([
      { system: 24, chargeEnd: 29.2, minVoltage: 28.7 },
      { system: 48, chargeEnd: 58.4, minVoltage: 56.5 },
    ]);
  });

  it('sets each threshold at 95% of the charge-end voltage plus 1 V', () => {
    for (const p of SYSTEM_VOLTAGE_PRESETS) {
      expect(p.minVoltage).toBeCloseTo(0.95 * p.chargeEnd + 1, 1);
      // Below the charge-end voltage: a string that drops out over the last few percent
      // of a charge is acceptable, so the threshold must not demand the full figure.
      expect(p.minVoltage).toBeLessThan(p.chargeEnd);
      expect(p.minVoltage).toBeGreaterThan(p.system);
    }
  });

  it('excludes a lone 12 V panel from either system, and a 60-cell module from 48 V', () => {
    const nominal12 = panel('12v', { voltage: 12 });
    const module60 = panel('60-cell', { voltage: 31 }); // typical Vmp of a 60-cell module
    const [v24, v48] = SYSTEM_VOLTAGE_PRESETS;

    expect(seriesCountFor(nominal12, v24.minVoltage)).toBe(3);
    expect(seriesCountFor(nominal12, v48.minVoltage)).toBe(5);
    expect(seriesCountFor(module60, v24.minVoltage)).toBe(1);
    expect(seriesCountFor(module60, v48.minVoltage)).toBe(2);
  });

  it('names the preset a threshold came from, and nothing for a custom one', () => {
    expect(presetFor(28.7)?.system).toBe(24);
    expect(presetFor(56.5)?.system).toBe(48);
    expect(presetFor(24)).toBeUndefined();
    expect(presetFor(0)).toBeUndefined();
  });
});
