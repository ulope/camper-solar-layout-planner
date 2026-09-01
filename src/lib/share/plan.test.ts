import { describe, it, expect } from 'vitest';
import {
  decodePlan,
  encodePlan,
  planFromFragment,
  planToShare,
  planUrl,
  withExistingCatalog,
} from './plan';
import { fromBase32, toBase32 } from './base32';
import { defaultConfig, migrateConfig } from '../persistence';
import type { Config, Layout, PanelOption } from '../types';
// The 6-surface, 43-model catalog a real build produced — the size a shared plan has to
// cope with, and the one that motivated carrying only the placed models.
import layout18 from '../__fixtures__/solar-layout-18.json';

const real = migrateConfig(layout18) as Config;

const layout = (optionIds: string[]): Layout => ({
  placements: optionIds.map((optionId, i) => ({
    optionId,
    x: i * 10,
    y: 0,
    w: 10,
    h: 10,
    rotated: false,
    power: 100,
  })),
  totalPower: optionIds.length * 100,
  panelCount: optionIds.length,
  usedArea: optionIds.length * 100,
  usableArea: 10000,
  coverage: 0.1,
});

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 6, 7, 8, 31, 100]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 37 + 11) % 256);
      expect(fromBase32(toBase32(bytes))).toEqual(bytes);
    }
  });

  it('stays inside the QR alphanumeric alphabet', () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect(/^[A-Z2-7]*$/.test(toBase32(bytes))).toBe(true);
  });

  it('accepts a lowercased code, so a retyped link still works', () => {
    const bytes = new Uint8Array([1, 2, 3, 250]);
    expect(fromBase32(toBase32(bytes).toLowerCase())).toEqual(bytes);
  });

  it('rejects a character outside the alphabet', () => {
    expect(fromBase32('ABC!')).toBeNull();
    expect(fromBase32('AB1C')).toBeNull(); // 0, 1, 8 and 9 are not in the alphabet
  });
});

describe('encodePlan / decodePlan', () => {
  it('round-trips a configuration', () => {
    const config = defaultConfig();
    const back = decodePlan(encodePlan(config));
    expect(back).not.toBeNull();
    expect(back!.surfaces.map((s) => ({ ...s, id: '', keepOuts: s.keepOuts.map((k) => ({ ...k, id: '' })) })))
      .toEqual(config.surfaces.map((s) => ({ ...s, id: '', keepOuts: s.keepOuts.map((k) => ({ ...k, id: '' })) })));
    expect(back!.edgeMargin).toBe(config.edgeMargin);
    expect(back!.panelGap).toBe(config.panelGap);
    expect(back!.gridSnap).toBe(config.gridSnap);
  });

  it('keeps every value exactly as entered', () => {
    // A real catalog carries prices in cents and sizes to the millimetre.
    const model = real.panelOptions.find((o) => o.name === 'Wattstunde Sola Frame Black 175')!;
    const back = decodePlan(encodePlan(real))!;
    const same = back.panelOptions.find((o) => o.name === model.name)!;
    expect(same.width).toBe(55.5);
    expect(same.height).toBe(154.6);
    expect(same.price).toBe(192);
    expect(back.panelOptions.find((o) => o.name === 'Wattstunde Sola Frame Shadow 125')!.price).toBe(242.86);
  });

  it('round-trips a real 6-surface, 43-model configuration', () => {
    const back = decodePlan(encodePlan(real))!;
    expect(back.surfaces.map((s) => s.name)).toEqual(real.surfaces.map((s) => s.name));
    expect(back.surfaces.map((s) => s.allowedPanels)).toEqual(real.surfaces.map((s) => s.allowedPanels));
    expect(back.surfaces[0].keepOuts.map((k) => k.label)).toEqual(['Fenster 1', 'Fan', 'Hängematte']);
    expect(back.panelOptions).toHaveLength(43);
    expect(back.panelOptions.filter((o) => o.enabled === false)).toHaveLength(2);
    expect(back.panelOptions.filter((o) => o.flexible)).toHaveLength(4);
  });

  it('gives every surface, keep-out and model a fresh id', () => {
    const back = decodePlan(encodePlan(real))!;
    const ids = [
      ...back.surfaces.map((s) => s.id),
      ...back.surfaces.flatMap((s) => s.keepOuts.map((k) => k.id)),
      ...back.panelOptions.map((o) => o.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => id === 'surface-roof' || id === 'panel-1')).toBe(false);
  });

  it('drops optional fields that were never set rather than storing zeros', () => {
    const config: Config = {
      ...defaultConfig(),
      panelOptions: [{ id: 'p', name: 'Bare', width: 100, height: 50, power: 100 }],
    };
    const back = decodePlan(encodePlan(config))!;
    expect(back.panelOptions[0].voltage).toBeUndefined();
    expect(back.panelOptions[0].price).toBeUndefined();
    expect(back.panelOptions[0].weight).toBeUndefined();
  });

  it('refuses anything that is not a plan', () => {
    expect(decodePlan('')).toBeNull();
    expect(decodePlan('NOTAPLAN')).toBeNull();
    expect(decodePlan('!!!')).toBeNull();
    expect(decodePlan(encodePlan(defaultConfig()).slice(0, 12))).toBeNull(); // truncated
    expect(decodePlan(toBase32(new TextEncoder().encode('[9,0,0,0,0,[],[]]')))).toBeNull();
  });

  it('is much smaller than the JSON export', () => {
    const json = JSON.stringify(real).length;
    expect(encodePlan(real).length).toBeLessThan(json / 3);
  });
});

describe('planToShare', () => {
  it('keeps only the models the shown layouts place', () => {
    const ids = [real.panelOptions[0].id, real.panelOptions[5].id];
    const shared = planToShare(real, [layout([ids[0], ids[0]]), layout([ids[1]])]);
    expect(shared.panelOptions.map((o) => o.id)).toEqual(ids);
    expect(shared.surfaces).toEqual(real.surfaces);
  });

  it('shrinks the payload far enough to matter', () => {
    const shared = planToShare(real, [layout([real.panelOptions[3].id])]);
    expect(encodePlan(shared).length).toBeLessThan(encodePlan(real).length / 3);
  });

  it('falls back to the selected catalog when nothing is placed', () => {
    const shared = planToShare(real, []);
    expect(shared.panelOptions).toHaveLength(41); // the 43 models less the 2 deselected
  });
});

describe('withExistingCatalog', () => {
  const catalog = real.panelOptions;
  const plan = planToShare(real, [layout([catalog[0].id, catalog[7].id])]);

  it('keeps the loaded catalog when it already holds every model of the plan', () => {
    const result = withExistingCatalog(decodePlan(encodePlan(plan))!, real);
    expect(result.keptCatalog).toBe(true);
    expect(result.config.panelOptions).toBe(catalog);
    // The surfaces still come from the scanned plan.
    expect(result.config.surfaces.map((s) => s.name)).toEqual(real.surfaces.map((s) => s.name));
  });

  it('matches on what makes a model that model, not on its id', () => {
    // Same models, fresh ids and a corrected price: still the same catalog.
    const repriced: Config = {
      ...real,
      panelOptions: catalog.map((o, i) => ({ ...o, id: `other-${i}`, price: (o.price ?? 0) + 5 })),
    };
    expect(withExistingCatalog(decodePlan(encodePlan(plan))!, repriced).keptCatalog).toBe(true);
  });

  it('takes the plan’s models when the catalog is missing one', () => {
    const thin: Config = { ...real, panelOptions: catalog.slice(0, 3) };
    const result = withExistingCatalog(decodePlan(encodePlan(plan))!, thin);
    expect(result.keptCatalog).toBe(false);
    expect(result.config.panelOptions.map((o) => o.name)).toEqual(plan.panelOptions.map((o) => o.name));
  });

  it('does not treat a differently sized model of the same name as a match', () => {
    const resized: Config = {
      ...real,
      panelOptions: catalog.map((o) => ({ ...o, width: o.width + 1 })),
    };
    expect(withExistingCatalog(decodePlan(encodePlan(plan))!, resized).keptCatalog).toBe(false);
  });

  it('keeps a catalog that is a strict superset', () => {
    const extra: PanelOption = { id: 'x', name: 'Spare', width: 10, height: 10, power: 10 };
    const bigger: Config = { ...real, panelOptions: [...catalog, extra] };
    expect(withExistingCatalog(decodePlan(encodePlan(plan))!, bigger).keptCatalog).toBe(true);
  });
});

describe('planUrl / planFromFragment', () => {
  it('points back at the app it was exported from', () => {
    const url = planUrl('https://example.test/planner/', defaultConfig());
    expect(url.startsWith('https://example.test/planner/#plan=')).toBe(true);
  });

  it('drops any query or fragment the base already carried', () => {
    const url = planUrl('https://example.test/planner/?x=1#plan=old', defaultConfig());
    expect(url.split('#')[0]).toBe('https://example.test/planner/');
    expect(url.split('#').length).toBe(2);
  });

  it('reads the payload back out of the fragment', () => {
    const config = defaultConfig();
    const url = planUrl('https://example.test/', config);
    const payload = planFromFragment(new URL(url).hash);
    expect(payload).not.toBeNull();
    expect(decodePlan(payload!)!.surfaces[0].width).toBe(config.surfaces[0].width);
  });

  it('ignores a fragment that is not a plan', () => {
    expect(planFromFragment('')).toBeNull();
    expect(planFromFragment('#')).toBeNull();
    expect(planFromFragment('#section-2')).toBeNull();
    expect(planFromFragment('#plan=')).toBeNull();
  });
});
