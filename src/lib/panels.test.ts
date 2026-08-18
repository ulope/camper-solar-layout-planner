import { describe, it, expect } from 'vitest';
import { isPanelEnabled, isPanelFlexible, packablePanels, panelsAllowedOn } from './panels';
import type { PanelOption } from './types';

const panel = (id: string, over: Partial<PanelOption> = {}): PanelOption => ({
  id,
  name: id,
  width: 100,
  height: 50,
  power: 100,
  ...over,
});

const rigid = panel('rigid');
const alsoRigid = panel('also-rigid', { flexible: false });
const flexible = panel('flexible', { flexible: true });

describe('isPanelFlexible', () => {
  it('treats a model with no flag as rigid', () => {
    expect(isPanelFlexible(rigid)).toBe(false);
  });

  it('treats an explicit false as rigid', () => {
    expect(isPanelFlexible(alsoRigid)).toBe(false);
  });

  it('recognizes a flexible model', () => {
    expect(isPanelFlexible(flexible)).toBe(true);
  });
});

describe('panelsAllowedOn', () => {
  const catalog = [rigid, flexible, alsoRigid];

  it('allows everything on a surface that takes both', () => {
    expect(panelsAllowedOn(catalog, 'both')).toEqual(catalog);
  });

  it('keeps only flexible models on a flexible-only surface', () => {
    expect(panelsAllowedOn(catalog, 'flexible')).toEqual([flexible]);
  });

  it('keeps only rigid models on a rigid-only surface', () => {
    expect(panelsAllowedOn(catalog, 'rigid')).toEqual([rigid, alsoRigid]);
  });

  it('returns nothing when the catalog has no model of the allowed kind', () => {
    expect(panelsAllowedOn([rigid, alsoRigid], 'flexible')).toEqual([]);
  });

  it('handles an empty catalog', () => {
    for (const allows of ['rigid', 'flexible', 'both'] as const) {
      expect(panelsAllowedOn([], allows)).toEqual([]);
    }
  });

  it('is independent of the enable flag, which packablePanels applies separately', () => {
    const off = panel('off', { flexible: true, enabled: false });
    expect(panelsAllowedOn([off], 'flexible')).toEqual([off]);
    expect(isPanelEnabled(off)).toBe(false);
    expect(packablePanels(panelsAllowedOn([off], 'flexible'))).toEqual([]);
  });
});
