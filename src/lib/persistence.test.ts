import { describe, it, expect } from 'vitest';
import { migrateConfig, exportConfig, importConfig, defaultConfig } from './persistence';
import type { Config, Layout, Placement } from './types';
import layout4 from './__fixtures__/solar-layout-4.json';
import layout11 from './__fixtures__/solar-layout-11.json';

const v1 = () => ({
  roof: { width: 300, height: 180 },
  edgeMargin: 3,
  panelGap: 2,
  gridSnap: 5,
  keepOuts: [{ id: 'hatch-1', label: 'Roof hatch', x: 120, y: 60, w: 50, h: 50 }],
  panelOptions: [{ id: 'panel-1', name: '100 W', width: 100, height: 50, power: 100 }],
});

describe('migrateConfig (v1)', () => {
  it('wraps the roof in a single surface, keeping its keep-outs', () => {
    const c = migrateConfig(v1())!;
    expect(c.surfaces).toHaveLength(1);
    expect(c.surfaces[0]).toMatchObject({ name: 'Roof', width: 300, height: 180 });
    expect(c.surfaces[0].keepOuts).toEqual(v1().keepOuts);
  });

  it('carries the global settings through unchanged', () => {
    const c = migrateConfig(v1())!;
    expect(c.edgeMargin).toBe(3);
    expect(c.panelGap).toBe(2);
    expect(c.gridSnap).toBe(5);
    expect(c.panelOptions).toEqual(v1().panelOptions);
  });

  it('defaults gridSnap for payloads saved before it existed', () => {
    const { gridSnap, ...older } = v1();
    void gridSnap;
    expect(migrateConfig(older)!.gridSnap).toBe(1);
  });

  it('lets the migrated roof take any panel type', () => {
    expect(migrateConfig(v1())!.surfaces[0].allowedPanels).toBe('both');
  });

  it('migrates the real v1 exports losslessly', () => {
    for (const fixture of [layout4, layout11]) {
      const c = migrateConfig(JSON.parse(JSON.stringify(fixture)))!;
      expect(c.surfaces).toHaveLength(1);
      expect(c.surfaces[0].width).toBe(fixture.roof.width);
      expect(c.surfaces[0].height).toBe(fixture.roof.height);
      expect(c.surfaces[0].keepOuts).toEqual(fixture.keepOuts);
      expect(c.panelOptions).toEqual(fixture.panelOptions);
    }
  });
});

describe('migrateConfig (v2)', () => {
  it('round-trips an exported config', () => {
    const c = defaultConfig();
    expect(migrateConfig(JSON.parse(exportConfig(c)))).toEqual(c);
  });

  it('is idempotent', () => {
    const once = migrateConfig(v1())!;
    expect(migrateConfig(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it('keeps every surface of a multi-surface payload', () => {
    const multi: Config = {
      ...defaultConfig(),
      surfaces: [
        { id: 'a', name: 'Roof', width: 300, height: 180, keepOuts: [], allowedPanels: 'both' },
        {
          id: 'b',
          name: 'Left wall',
          width: 400,
          height: 90,
          keepOuts: [],
          allowedPanels: 'flexible',
        },
      ],
    };
    const back = migrateConfig(JSON.parse(exportConfig(multi)))!;
    expect(back.surfaces).toHaveLength(2);
    expect(back.surfaces.map((s) => s.allowedPanels)).toEqual(['both', 'flexible']);
  });

  it('defaults a surface with no allowance, or an unrecognized one, to both', () => {
    const base = { ...v1(), roof: undefined, keepOuts: undefined };
    const withSurfaces = (allowedPanels: unknown) =>
      migrateConfig({
        ...base,
        surfaces: [{ id: 'a', name: 'Roof', width: 100, height: 50, keepOuts: [], allowedPanels }],
      })!.surfaces[0].allowedPanels;
    expect(withSurfaces(undefined)).toBe('both');
    expect(withSurfaces('nonsense')).toBe('both');
    expect(withSurfaces('rigid')).toBe('rigid');
  });

  it('round-trips a flexible panel model', () => {
    const c: Config = {
      ...defaultConfig(),
      panelOptions: [
        { id: 'p1', name: 'Rigid', width: 100, height: 50, power: 100 },
        { id: 'p2', name: 'Flex', width: 100, height: 50, power: 100, flexible: true },
      ],
    };
    const back = migrateConfig(JSON.parse(exportConfig(c)))!;
    expect(back.panelOptions.map((p) => p.flexible)).toEqual([undefined, true]);
  });

  it('defaults the minimum string voltage to off for payloads saved before it existed', () => {
    expect(migrateConfig(v1())!.minVoltage).toBe(0);
  });

  it('round-trips a minimum string voltage', () => {
    const c: Config = { ...defaultConfig(), minVoltage: 48 };
    expect(migrateConfig(JSON.parse(exportConfig(c)))!.minVoltage).toBe(48);
  });

  it('normalizes a nonsensical minimum string voltage to off', () => {
    for (const minVoltage of [-12, 'lots', null]) {
      expect(migrateConfig({ ...v1(), minVoltage })!.minVoltage).toBe(0);
    }
  });

  it('names a surface that has none', () => {
    const c = migrateConfig({
      ...v1(),
      roof: undefined,
      keepOuts: undefined,
      surfaces: [{ id: 'a', width: 100, height: 50, keepOuts: [] }],
    })!;
    expect(c.surfaces[0].name).toBe('Surface 1');
  });
});

describe('migrateConfig (rejection)', () => {
  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['an empty object', {}],
    ['an empty surface list', { ...v1(), roof: undefined, keepOuts: undefined, surfaces: [] }],
    ['a surface without dimensions', { ...v1(), surfaces: [{ id: 'a', keepOuts: [] }] }],
    ['a config with no geometry at all', { edgeMargin: 3, panelGap: 2, panelOptions: [] }],
  ])('rejects %s', (_label, value) => {
    expect(migrateConfig(value)).toBeNull();
  });
});

// ----- Layouts travelling with an exported config -----

/** A config with two surfaces, so a partial set of layouts is representable. */
const twoSurfaces = (): Config => ({
  ...defaultConfig(),
  surfaces: [
    { id: 'a', name: 'Roof', width: 300, height: 180, keepOuts: [], allowedPanels: 'both' },
    { id: 'b', name: 'Wall', width: 400, height: 90, keepOuts: [], allowedPanels: 'both' },
  ],
});

const place = (optionId: string, x: number, power: number): Placement => ({
  optionId,
  x,
  y: 0,
  w: 100,
  h: 50,
  rotated: false,
  power,
});

const layoutOf = (placements: Placement[]): Layout => ({
  placements,
  totalPower: placements.reduce((s, p) => s + p.power, 0),
  panelCount: placements.length,
  usedArea: placements.reduce((s, p) => s + p.w * p.h, 0),
  usableArea: 50000,
  coverage: 0.5,
});

/** The one panel model both surfaces place, from the default catalog. */
const PANEL = defaultConfig().panelOptions[0];

const roundTrip = (config: Config, layouts: Record<string, Layout | null>) =>
  importConfig(exportConfig(config, layouts));

describe('exportConfig (layouts)', () => {
  it('carries the layout shown for each surface', () => {
    const config = twoSurfaces();
    const payload = JSON.parse(
      exportConfig(config, {
        a: layoutOf([place(PANEL.id, 0, PANEL.power)]),
        b: layoutOf([place(PANEL.id, 0, PANEL.power), place(PANEL.id, 110, PANEL.power)]),
      }),
    );
    expect(Object.keys(payload.layouts)).toEqual(['a', 'b']);
    expect(payload.layouts.b.placements).toHaveLength(2);
  });

  it('omits the key entirely when nothing has been optimized', () => {
    expect(JSON.parse(exportConfig(twoSurfaces(), {}))).not.toHaveProperty('layouts');
    expect(JSON.parse(exportConfig(twoSurfaces(), { a: null, b: null }))).not.toHaveProperty(
      'layouts',
    );
  });

  it('carries only the surfaces that have one', () => {
    const payload = JSON.parse(
      exportConfig(twoSurfaces(), { a: layoutOf([place(PANEL.id, 0, PANEL.power)]), b: null }),
    );
    expect(Object.keys(payload.layouts)).toEqual(['a']);
  });

  it('leaves the configuration itself untouched, so an older reader loses nothing', () => {
    const config = twoSurfaces();
    const withLayouts = exportConfig(config, { a: layoutOf([place(PANEL.id, 0, PANEL.power)]) });
    expect(migrateConfig(JSON.parse(withLayouts))).toEqual(config);
  });
});

describe('importConfig (layouts)', () => {
  it('reads back the placements it exported', () => {
    const placements = [place(PANEL.id, 0, PANEL.power), place(PANEL.id, 110, PANEL.power)];
    const back = roundTrip(twoSurfaces(), { a: layoutOf(placements) })!;
    expect(back.layouts.a.placements).toEqual(placements);
    expect(back.layouts).not.toHaveProperty('b');
  });

  it('has no layouts for a file exported before anything was optimized', () => {
    expect(roundTrip(twoSurfaces(), {})!.layouts).toEqual({});
    expect(importConfig(JSON.stringify(defaultConfig()))!.layouts).toEqual({});
  });

  it('recomputes the totals rather than trusting the ones in the file', () => {
    const config = twoSurfaces();
    const payload = JSON.parse(exportConfig(config, { a: layoutOf([place(PANEL.id, 0, PANEL.power)]) }));
    payload.layouts.a.totalPower = 99999;
    payload.layouts.a.panelCount = 42;
    payload.layouts.a.coverage = 7;
    const back = importConfig(JSON.stringify(payload))!.layouts.a;
    expect(back.totalPower).toBe(PANEL.power);
    expect(back.panelCount).toBe(1);
    expect(back.coverage).toBeCloseTo(back.usedArea / back.usableArea);
  });

  it('drops a layout placing a model the catalog does not have', () => {
    const back = roundTrip(twoSurfaces(), {
      a: layoutOf([place(PANEL.id, 0, PANEL.power), place('gone', 110, 100)]),
      b: layoutOf([place(PANEL.id, 0, PANEL.power)]),
    })!;
    expect(back.layouts).not.toHaveProperty('a');
    expect(back.layouts.b.panelCount).toBe(1);
  });

  it('ignores layouts belonging to a surface the config no longer has', () => {
    const payload = JSON.parse(
      exportConfig(twoSurfaces(), { a: layoutOf([place(PANEL.id, 0, PANEL.power)]) }),
    );
    payload.surfaces = payload.surfaces.filter((s: { id: string }) => s.id !== 'a');
    expect(importConfig(JSON.stringify(payload))!.layouts).toEqual({});
  });

  it.each([
    ['not an object', 'nonsense'],
    ['missing its placements', { totalPower: 100 }],
    ['holding a malformed placement', { placements: [{ optionId: 'panel-1', x: 'left' }] }],
  ])('drops a layout %s', (_label, layout) => {
    const payload = { ...twoSurfaces(), layouts: { a: layout } };
    expect(importConfig(JSON.stringify(payload))!.layouts).toEqual({});
  });

  it('still rejects a file whose configuration is invalid', () => {
    expect(importConfig('{"layouts":{}}')).toBeNull();
    expect(importConfig('not json')).toBeNull();
  });
});
