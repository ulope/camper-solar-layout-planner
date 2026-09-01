import { describe, it, expect } from 'vitest';
import { buildLayoutPdf, type PdfReportInput, type Translate } from './report';
import { decodePlan, planFromFragment, planToShare, planUrl } from '../share/plan';
import { createFormatters } from '../format';
import { translate } from '../i18n';
import type { Config, Layout, PanelOption, Surface } from '../types';

const DATE = new Date(2026, 4, 17, 14, 5, 0);

const t =
  (locale: 'en' | 'de'): Translate =>
  (key, params) =>
    translate(locale, key, params);

function panel(over: Partial<PanelOption> & { id: string }): PanelOption {
  return { name: over.id, width: 100, height: 50, power: 100, ...over };
}

function surface(over: Partial<Surface> & { id: string }): Surface {
  return {
    name: over.id,
    width: 300,
    height: 180,
    keepOuts: [],
    allowedPanels: 'both',
    ...over,
  };
}

function layout(placements: Layout['placements']): Layout {
  const usedArea = placements.reduce((s, p) => s + p.w * p.h, 0);
  return {
    placements,
    totalPower: placements.reduce((s, p) => s + p.power, 0),
    panelCount: placements.length,
    usedArea,
    usableArea: 300 * 180,
    coverage: usedArea / (300 * 180),
  };
}

const OPTIONS: PanelOption[] = [
  panel({ id: 'a', name: '175 W mono', width: 150, height: 70, power: 175, weight: 9.5, price: 189 }),
  panel({ id: 'b', name: '100 W flex', width: 100, height: 50, power: 100, flexible: true }),
];

const CONFIG: Config = {
  surfaces: [
    surface({
      id: 's1',
      name: 'Roof',
      keepOuts: [{ id: 'k1', label: 'Roof hatch', x: 120, y: 60, w: 50, h: 50 }],
    }),
    surface({ id: 's2', name: 'Sidewall', width: 260, height: 90 }),
  ],
  edgeMargin: 5,
  panelGap: 2,
  gridSnap: 5,
  panelOptions: OPTIONS,
};

const LAYOUTS: Record<string, Layout> = {
  s1: layout([
    { optionId: 'a', x: 10, y: 10, w: 150, h: 70, rotated: false, power: 175 },
    { optionId: 'a', x: 10, y: 90, w: 150, h: 70, rotated: false, power: 175 },
    { optionId: 'b', x: 170, y: 10, w: 100, h: 50, rotated: false, power: 100 },
  ]),
  s2: layout([{ optionId: 'b', x: 10, y: 10, w: 100, h: 50, rotated: false, power: 100 }]),
};

/** The produced file as a Latin-1 string — uncompressed, so its operators are readable. */
function build(over: Partial<PdfReportInput> = {}, locale: 'en' | 'de' = 'en'): string {
  const doc = buildLayoutPdf({
    config: CONFIG,
    selected: LAYOUTS,
    selection: { s1: { index: 1, count: 5 }, s2: { index: 0, count: 3 } },
    t: t(locale),
    fmt: createFormatters(locale),
    date: DATE,
    compress: false,
    ...over,
  });
  return doc.output(); // the raw file as a binary string
}

/**
 * WinAnsi's 0x80…0x9F block, which holds punctuation rather than Latin-1's controls —
 * the inverse of the encoder's table, so a decoded string compares as it was written.
 */
const WINANSI_PUNCTUATION: Record<number, string> = {
  128: '\u20ac',
  133: '\u2026',
  145: '\u2018',
  146: '\u2019',
  147: '\u201c',
  148: '\u201d',
  150: '\u2013',
  151: '\u2014',
};

/** Every string the document draws, decoded back from the content streams. */
function drawnText(pdf: string): string[] {
  return [...pdf.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) =>
    m[1]
      .replace(/\\(\d{3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)))
      .replace(/\\(.)/g, '$1')
      .split('')
      .map((ch) => WINANSI_PUNCTUATION[ch.charCodeAt(0)] ?? ch)
      .join(''),
  );
}

const pageCount = (pdf: string) => Number(/\/Count (\d+)/.exec(pdf)?.[1]);

describe('the plan QR code', () => {
  const BASE = 'https://example.test/planner/';

  /**
   * Decode the QR the report drew, by encoding the same plan again — the drawn modules
   * are pixels, so what is verified here is the payload the report builds from, which is
   * what a scanner would resolve to.
   */
  it('is drawn, with its caption, when a share URL is given', () => {
    const drawn = drawnText(build({ shareUrlBase: BASE }));
    expect(drawn).toContain('Scan to reopen this plan');
    // The note wraps to the width of the square, so it is checked as one run of text.
    expect(drawn.join(' ')).toContain('the 2 panel models used here');
  });

  it('is left out entirely when no share URL is given', () => {
    const drawn = drawnText(build());
    expect(drawn.some((s) => s.includes('Scan to reopen'))).toBe(false);
    expect(drawn.some((s) => s.includes('Too large for a QR code'))).toBe(false);
  });

  it('carries a plan that decodes back to the surfaces and the placed models', () => {
    // The report shares planToShare(config, selectedLayouts); rebuild that payload and
    // check it round-trips, since the drawn code itself is only rectangles.
    const shared = planToShare(CONFIG, [LAYOUTS.s1, LAYOUTS.s2]);
    const payload = planFromFragment(new URL(planUrl(BASE, shared)).hash);
    const back = decodePlan(payload!)!;
    expect(back.surfaces.map((s) => s.name)).toEqual(['Roof', 'Sidewall']);
    expect(back.surfaces[0].keepOuts.map((k) => k.label)).toEqual(['Roof hatch']);
    expect(back.panelOptions.map((o) => o.name)).toEqual(['175 W mono', '100 W flex']);
  });

  it('says so instead of printing a code too dense to scan', () => {
    // 200 models with unrepeatable names: far past what a scannable symbol holds.
    const panelOptions = Array.from({ length: 200 }, (_, i) =>
      panel({ id: `p${i}`, name: `Model ${i} ${Math.random().toString(36).slice(2)}`, power: 100 + i }),
    );
    const drawn = drawnText(
      build({ config: { ...CONFIG, panelOptions }, selected: {}, selection: {}, shareUrlBase: BASE }),
    );
    expect(drawn.some((s) => s.includes('Too large for a QR code'))).toBe(true);
    expect(drawn.some((s) => s.includes('Scan to reopen'))).toBe(false);
  });

  it('falls back to the selected catalog when nothing is optimized', () => {
    const drawn = drawnText(build({ selected: {}, selection: {}, shareUrlBase: BASE }));
    expect(drawn.join(' ')).toContain('the selected panel models');
  });
});

describe('buildLayoutPdf', () => {
  it('produces a valid PDF', () => {
    const pdf = build();
    expect(pdf.startsWith('%PDF-1.')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pageCount(pdf)).toBeGreaterThanOrEqual(1);
  });

  it('titles the report and dates it', () => {
    const drawn = drawnText(build());
    expect(drawn).toContain('Camper Solar Layout Planner');
    expect(drawn.some((s) => s.startsWith('Generated'))).toBe(true);
  });

  it('sums the selected layouts of every surface', () => {
    const drawn = drawnText(build());
    expect(drawn).toContain('550 Wp'); // 175 + 175 + 100 on the roof, 100 on the sidewall
    expect(drawn).toContain('4'); // four panels
  });

  it('gives every surface a heading with its size, and says which option is shown', () => {
    const drawn = drawnText(build());
    expect(drawn).toContain('Roof — 300 × 180 cm');
    expect(drawn).toContain('Sidewall — 260 × 90 cm');
    expect(drawn.some((s) => s.includes('option 2 of 5'))).toBe(true);
    expect(drawn.some((s) => s.includes('option 1 of 3'))).toBe(true);
  });

  it('draws the panels, the keep-outs and the surface bodies', () => {
    const pdf = build();
    // Three panel rectangles on the roof and one on the sidewall, each filled and stroked.
    expect((pdf.match(/ re\nB/g) ?? []).length).toBeGreaterThanOrEqual(4 + 2);
    expect(drawnText(pdf)).toContain('Roof hatch');
    expect(drawnText(pdf)).toContain('175 Wp');
  });

  it('labels the drawing with a scale bar', () => {
    expect(drawnText(build()).some((s) => /^\d+ cm$/.test(s))).toBe(true);
  });

  it('tables the modules with quantities and totals', () => {
    const drawn = drawnText(build());
    expect(drawn).toContain('Modules across all surfaces');
    expect(drawn).toContain('175 W mono');
    expect(drawn).toContain('100 W flex (flex)');
    expect(drawn).toContain('150 × 70');
    expect(drawn).toContain('Total');
    expect(drawn).toContain('550 Wp');
  });

  it('marks a total as a lower bound when a placed model has no weight or price', () => {
    const drawn = drawnText(build());
    // Only the 175 W model carries weight and price, so both totals are partial.
    expect(drawn).toContain('>= 19 kg');
    expect(drawn).toContain('>= €378');
    expect(drawn.some((s) => s.includes('Totals marked >='))).toBe(true);
  });

  it('leaves out the weight and price columns when no model carries them', () => {
    const config = { ...CONFIG, panelOptions: [panel({ id: 'b', name: '100 W flex' })] };
    const drawn = drawnText(
      build({
        config,
        selected: { s1: LAYOUTS.s1, s2: LAYOUTS.s2 },
      }),
    );
    expect(drawn).not.toContain('Weight');
    expect(drawn).not.toContain('Price');
  });

  it('follows the UI language', () => {
    const drawn = drawnText(build({}, 'de'));
    expect(drawn).toContain('Module über alle Flächen');
    expect(drawn).toContain('GESAMTLEISTUNG'); // the summary sets its labels in caps
    expect(drawn.some((s) => s.includes('Option 2 von 5'))).toBe(true);
    expect(drawn).toContain('3,10 m\u00b2'); // figures follow the language too
  });

  it('reports a surface that was never optimized instead of leaving it blank', () => {
    const drawn = drawnText(build({ selected: { s1: LAYOUTS.s1 }, selection: {} }));
    expect(drawn).toContain('Sidewall — 260 × 90 cm');
    expect(drawn).toContain('Not optimized yet.');
  });

  it('says so when nothing is placed at all', () => {
    const drawn = drawnText(build({ selected: {}, selection: {} }));
    expect(drawn).toContain('No panels are placed — run the optimizer first.');
  });

  it('paginates a long plan rather than overflowing one page', () => {
    const surfaces = Array.from({ length: 6 }, (_, i) => surface({ id: `s${i}`, name: `Surface ${i}` }));
    const selected = Object.fromEntries(surfaces.map((s) => [s.id, LAYOUTS.s1]));
    const pdf = build({ config: { ...CONFIG, surfaces }, selected, selection: {} });
    expect(pageCount(pdf)).toBeGreaterThan(2);
    // The running footer numbers every page.
    expect(drawnText(pdf).filter((s) => s.startsWith('Page ')).length).toBe(pageCount(pdf));
  });

  it('is reproducible for the same plan and date', () => {
    // Everything but the trailer's file ID, which jsPDF derives from a random source.
    const stable = (pdf: string) => pdf.replace(/\/ID \[[^\]]*\]/, '');
    expect(stable(build())).toBe(stable(build()));
  });
});
