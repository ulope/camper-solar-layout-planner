import { describe, it, expect } from 'vitest';
import {
  PANEL_PALETTE,
  assignPanelColors,
  colorDistance,
  panelColor,
  type SurfaceOptions,
} from './colors';
import { mixColor } from './pdf/report';

/**
 * How far apart in OKLab two palette entries have to look. Orange and red — both there
 * long before the palette grew — sit at 0.095, so that is the bar the additions meet.
 */
const MIN_DISTANCE = 0.095;

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

/** One surface whose options each place a single model. */
const alone = (...models: string[]): SurfaceOptions => models.map((m) => [m]);

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

  it('keeps models in the same option apart', () => {
    // Slots 3, 27 and 43 are one palette length apart, so before the assignment existed
    // all three drew in the same color — the bug this guards.
    const catalog = ids(44);
    const together = ['p3', 'p27', 'p43'];
    const colors = assignPanelColors(catalog, [[together]]);
    expect(new Set(together.map((id) => colors.get(id))).size).toBe(3);
  });

  it('keeps a whole palette worth of models apart', () => {
    const n = PANEL_PALETTE.length;
    const catalog = ids(n * 3);
    const together = catalog.slice(0, n);
    const colors = assignPanelColors(catalog, [[together]]);
    expect(new Set(together.map((id) => colors.get(id))).size).toBe(n);
  });

  it('keeps every option on a surface distinct at once, not just one', () => {
    const catalog = ids(30);
    const options = [
      ['p0', 'p8', 'p16', 'p24'],
      ['p8', 'p16', 'p1'],
      ['p24', 'p0', 'p2', 'p10'],
    ];
    const colors = assignPanelColors(catalog, [options]);
    for (const o of options) expect(new Set(o.map((id) => colors.get(id))).size).toBe(o.length);
  });

  it('keeps models on different surfaces apart', () => {
    // The canvas draws every surface at once, so a model on one is beside every model on
    // the others even though they never share a layout — how Links' FX100 and Front's
    // Tigerexped 125 both came out teal.
    const catalog = ids(20);
    const colors = assignPanelColors(catalog, [alone('p1'), alone('p9'), alone('p17')]);
    expect(new Set(['p1', 'p9', 'p17'].map((id) => colors.get(id))).size).toBe(3);
  });

  it('sets a model placed on two surfaces apart from every other placed model', () => {
    const catalog = ids(20);
    // p0 turns up on both surfaces, so it can appear opposite any of the rest. p2 and p3
    // share a surface without sharing an option and are free to match each other.
    const colors = assignPanelColors(catalog, [alone('p0', 'p1'), alone('p0', 'p2', 'p3')]);
    const others = ['p1', 'p2', 'p3'].map((id) => colors.get(id));
    expect(others).not.toContain(colors.get('p0'));
  });

  it('lets options on the same surface share a color', () => {
    // Only one option of a surface is ever drawn, so 40 models that never meet fit in a
    // palette of 16 — which is what keeps a large catalog legible.
    const catalog = ids(40);
    const colors = assignPanelColors(catalog, [alone(...catalog)]);
    expect(colors.size).toBe(40);
    expect(new Set(colors.values()).size).toBeLessThanOrEqual(PANEL_PALETTE.length);
  });

  it('gives up sharing a view before sharing an option', () => {
    // More models on screen than the palette holds. Something has to repeat; it must not
    // be two models drawn side by side in one option.
    const catalog = ids(30);
    const together = ['p0', 'p1', 'p2'];
    const crowd = catalog.slice(3, 3 + PANEL_PALETTE.length + 2);
    const colors = assignPanelColors(catalog, [[together], ...crowd.map((m) => alone(m))]);
    expect(new Set(together.map((id) => colors.get(id))).size).toBe(3);
  });

  it('keeps every combination the app can show free of repeats', () => {
    // Shaped like the reported plan: six surfaces, models placed on more than one of
    // them, and a roof whose widest option holds four.
    const catalog = ids(17);
    const [roof, l, r, front, heckL, heckR] = [
      [
        ['p7', 'p16', 'p9'],
        ['p2', 'p6', 'p7', 'p16'],
        ['p3', 'p1', 'p0', 'p7'],
        ['p7', 'p5', 'p16', 'p9'],
      ],
      alone('p12', 'p13', 'p14', 'p15'),
      alone('p14', 'p13', 'p12', 'p15'),
      [['p3'], ['p4', 'p8'], ['p2'], ['p7', 'p11'], ['p7', 'p10']],
      alone('p11', 'p8', 'p10', 'p9'),
      alone('p11', 'p8', 'p10', 'p9'),
    ];
    const surfaces = [roof, l, r, front, heckL, heckR];
    const colors = assignPanelColors(catalog, surfaces);

    // One option per surface is what the canvas shows; walk every reachable pick.
    const clashes: string[] = [];
    const walk = (rest: SurfaceOptions[], shown: string[]) => {
      if (rest.length === 0) {
        const models = [...new Set(shown)];
        const used = new Set(models.map((id) => colors.get(id)));
        if (used.size !== models.length) clashes.push(models.join('+'));
        return;
      }
      for (const option of rest[0]) walk(rest.slice(1), [...shown, ...option]);
    };
    walk(surfaces, []);
    expect(clashes).toEqual([]);
  });

  it('reuses the most distant color when one option outgrows the palette', () => {
    const n = PANEL_PALETTE.length;
    const catalog = ids(n + 2);
    const colors = assignPanelColors(catalog, [[catalog]]);
    expect(colors.size).toBe(n + 2);
    // Every palette entry is in play; the two that repeat are as far from their
    // neighbours as anything left could be.
    expect(new Set(colors.values()).size).toBe(n);
  });

  it('is stable for the same inputs', () => {
    const catalog = ids(20);
    const surfaces = [[['p1', 'p9', 'p17'], ['p2', 'p10']], [['p3', 'p11', 'p19', 'p1']]];
    const a = assignPanelColors(catalog, surfaces);
    const b = assignPanelColors(catalog, surfaces);
    expect([...b]).toEqual([...a]);
  });

  it('ignores ids that are not in the catalog', () => {
    const colors = assignPanelColors(ids(3), [[['p0', 'gone', 'p1']]]);
    expect(colors.has('gone')).toBe(false);
    expect(colors.get('p0')).not.toBe(colors.get('p1'));
  });
});
