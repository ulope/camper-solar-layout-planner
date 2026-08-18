import { describe, it, expect } from 'vitest';
import { surfaceColumn, columnExtent, surfaceAtPoint, surfaceOfKeepOut, SURFACE_GAP_CM } from './surfaces';
import { defaultConfig } from './persistence';
import type { Config, Surface } from './types';

const surface = (id: string, width: number, height: number): Surface => ({
  id,
  name: id,
  width,
  height,
  keepOuts: [],
});

const roof = surface('roof', 300, 180);
const wall = surface('wall', 400, 90);

describe('surfaceColumn', () => {
  it('stacks surfaces top to bottom, separated by the gap', () => {
    expect(surfaceColumn([roof, wall]).map((p) => p.y0)).toEqual([0, 180 + SURFACE_GAP_CM]);
  });

  it('keeps config order', () => {
    expect(surfaceColumn([wall, roof]).map((p) => p.surface.id)).toEqual(['wall', 'roof']);
  });

  it('handles the empty case', () => {
    expect(surfaceColumn([])).toEqual([]);
  });
});

describe('columnExtent', () => {
  it('is the widest surface by the total stacked height', () => {
    expect(columnExtent(surfaceColumn([roof, wall]))).toEqual({
      w: 400,
      h: 180 + SURFACE_GAP_CM + 90,
    });
  });

  it('excludes a trailing gap', () => {
    expect(columnExtent(surfaceColumn([roof]))).toEqual({ w: 300, h: 180 });
  });

  it('is empty for no surfaces', () => {
    expect(columnExtent([])).toEqual({ w: 0, h: 0 });
  });
});

describe('surfaceAtPoint', () => {
  const column = surfaceColumn([roof, wall]);

  it('finds the surface under a point', () => {
    expect(surfaceAtPoint(column, 10, 10)?.surface.id).toBe('roof');
    expect(surfaceAtPoint(column, 10, 180 + SURFACE_GAP_CM + 10)?.surface.id).toBe('wall');
  });

  it('misses in the gap between surfaces', () => {
    expect(surfaceAtPoint(column, 10, 180 + SURFACE_GAP_CM / 2)).toBeNull();
  });

  it('misses to the right of a narrower surface', () => {
    // The roof is 300 wide but the stack extends to 400 for the wall below it.
    expect(surfaceAtPoint(column, 350, 10)).toBeNull();
    expect(surfaceAtPoint(column, 350, 180 + SURFACE_GAP_CM + 10)?.surface.id).toBe('wall');
  });

  it('misses outside the stack', () => {
    expect(surfaceAtPoint(column, -1, 10)).toBeNull();
    expect(surfaceAtPoint(column, 10, 10_000)).toBeNull();
  });
});

describe('surfaceOfKeepOut', () => {
  const config: Config = {
    ...defaultConfig(),
    surfaces: [
      { ...roof, keepOuts: [{ id: 'k1', x: 0, y: 0, w: 10, h: 10 }] },
      { ...wall, keepOuts: [{ id: 'k2', x: 0, y: 0, w: 10, h: 10 }] },
    ],
  };

  it('finds the owning surface', () => {
    expect(surfaceOfKeepOut(config, 'k2')?.id).toBe('wall');
  });

  it('returns null for an unknown id', () => {
    expect(surfaceOfKeepOut(config, 'nope')).toBeNull();
  });
});
