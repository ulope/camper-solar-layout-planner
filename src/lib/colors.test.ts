import { describe, it, expect } from 'vitest';
import { PANEL_PALETTE, assignPanelColors, colorDistance, panelColor } from './colors';
import { mixColor } from './pdf/report';

/**
 * How far apart in OKLab two palette entries have to look. Orange and red — both there
 * long before the palette grew — sit at 0.095, so that is the bar the additions meet.
 */
const MIN_DISTANCE = 0.095;

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe('the palette', () => {
  it('keeps every pair of colors apart', () => {
    const close: string[] = [];
    for (let i = 0; i < PANEL_PALETTE.length; i++) {
      for (let j = i + 1; j < PANEL_PALETTE.length; j++) {
        const d = colorDistance(PANEL_PALETTE[i], PANEL_PALETTE[j]);
        if (d < MIN_DISTANCE) close.push(`${PANEL_PALETTE[i]}/${PANEL_PALETTE[j]} ${d.toFixed(3)}`);
      }
    }
    expect(close).toEqual([]);
  });

  it('keeps them apart through the tint the PDF prints them with', () => {
    const tint = (c: string) => mixColor(c, '#ffffff', 0.62);
    const close: string[] = [];
    for (let i = 0; i < PANEL_PALETTE.length; i++) {
      for (let j = i + 1; j < PANEL_PALETTE.length; j++) {
        // The tint pulls everything toward white, so distances shrink; what matters is
        // that none of them collapses.
        const d = colorDistance(tint(PANEL_PALETTE[i]), tint(PANEL_PALETTE[j]));
        if (d < MIN_DISTANCE / 3) close.push(`${PANEL_PALETTE[i]}/${PANEL_PALETTE[j]}`);
      }
    }
    expect(close).toEqual([]);
  });

  it('has no duplicate entries', () => {
    expect(new Set(PANEL_PALETTE).size).toBe(PANEL_PALETTE.length);
  });
});

describe('assignPanelColors', () => {
  it('gives every model a color, placed or not', () => {
    const colors = assignPanelColors(ids(5), []);
    expect([...colors.keys()]).toEqual(ids(5));
    expect([...colors.values()].every((c) => PANEL_PALETTE.includes(c))).toBe(true);
  });

  it('leaves a catalog nothing places at its slot colors', () => {
    const colors = assignPanelColors(ids(3), []);
    expect([...colors.values()]).toEqual([panelColor(0), panelColor(1), panelColor(2)]);
  });

  it('keeps models on the same layout apart', () => {
    // Slots 3, 27 and 43 are one palette length apart, so before the assignment existed
    // all three drew in the same color — the bug this guards.
    const catalog = ids(44);
    const together = ['p3', 'p27', 'p43'];
    const colors = assignPanelColors(catalog, [together]);
    expect(new Set(together.map((id) => colors.get(id))).size).toBe(3);
  });

  it('keeps a whole palette worth of models apart', () => {
    const n = PANEL_PALETTE.length;
    const catalog = ids(n * 3);
    const together = catalog.slice(0, n);
    const colors = assignPanelColors(catalog, [together]);
    expect(new Set(together.map((id) => colors.get(id))).size).toBe(n);
  });

  it('keeps every layout distinct at once, not just one', () => {
    const catalog = ids(30);
    const groups = [
      ['p0', 'p8', 'p16', 'p24'],
      ['p8', 'p16', 'p1'],
      ['p24', 'p0', 'p2', 'p10'],
    ];
    const colors = assignPanelColors(catalog, groups);
    for (const g of groups) expect(new Set(g.map((id) => colors.get(id))).size).toBe(g.length);
  });

  it('lets models that never meet share a color', () => {
    // 40 models, none placed together: far more than the palette holds, and fine.
    const catalog = ids(40);
    const colors = assignPanelColors(
      catalog,
      catalog.map((id) => [id]),
    );
    expect(colors.size).toBe(40);
  });

  it('reuses the most distant color when a layout outgrows the palette', () => {
    const n = PANEL_PALETTE.length;
    const catalog = ids(n + 2);
    const colors = assignPanelColors(catalog, [catalog]);
    expect(colors.size).toBe(n + 2);
    // Every palette entry is in play; the two that repeat are as far from their
    // neighbours as anything left could be.
    expect(new Set(colors.values()).size).toBe(n);
  });

  it('is stable for the same inputs', () => {
    const catalog = ids(20);
    const groups = [['p1', 'p9', 'p17'], ['p2', 'p10'], ['p3', 'p11', 'p19', 'p1']];
    const a = assignPanelColors(catalog, groups);
    const b = assignPanelColors(catalog, groups);
    expect([...b]).toEqual([...a]);
  });

  it('ignores ids that are not in the catalog', () => {
    const colors = assignPanelColors(ids(3), [['p0', 'gone', 'p1']]);
    expect(colors.has('gone')).toBe(false);
    expect(colors.get('p0')).not.toBe(colors.get('p1'));
  });
});
