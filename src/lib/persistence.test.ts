import { describe, it, expect } from 'vitest';
import { migrateConfig, exportConfig, defaultConfig } from './persistence';
import type { Config } from './types';
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
