import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { buildLayoutPdf, planScale, type PdfReportInput, type Translate } from './report';
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

/** One drawn string, back from its PDF literal to the text it was written as. */
function decode(literal: string): string {
  return literal
    .replace(/\\(\d{3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\(.)/g, '$1')
    .split('')
    .map((ch) => WINANSI_PUNCTUATION[ch.charCodeAt(0)] ?? ch)
    .join('');
}

/** Every string the document draws, decoded back from the content streams. */
function drawnText(pdf: string): string[] {
  return [...pdf.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => decode(m[1]));
}

const pageCount = (pdf: string) => Number(/\/Count (\d+)/.exec(pdf)?.[1]);

/**
 * Every rectangle the document draws. jsPDF writes a rect from its top edge downward, so
 * the height comes out negative in the stream; it is normalized here.
 */
function drawnRects(pdf: string): { x: number; y: number; w: number; h: number }[] {
  return [...pdf.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    w: Number(m[3]),
    h: Math.abs(Number(m[4])),
  }));
}

/** Every drawn string with the position it starts at. */
function drawnPositions(pdf: string): { text: string; x: number; y: number }[] {
  return [
    ...pdf.matchAll(/(-?[\d.]+) (-?[\d.]+) Td\n\(((?:\\.|[^\\)])*)\) Tj/g),
  ].map((m) => ({ x: Number(m[1]), y: Number(m[2]), text: decode(m[3]) }));
}

/**
 * Where a drawn string ends, which is what alignment is actually about: right-aligned
 * cells in one column all have to finish at the same x.
 */
function rightEdgeOf(pdf: string, text: string, font: 'normal' | 'bold', size: number): number {
  // A figure like "550 Wp" appears in the summary block as well as in the table; the
  // tables come after it, so the last occurrence is the one under test.
  const at = drawnPositions(pdf).findLast((d) => d.text === text);
  if (!at) throw new Error(`"${text}" is not drawn`);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', font);
  doc.setFontSize(size);
  return at.x + doc.getTextWidth(text);
}

describe('drawing scale', () => {
  it('fits the widest surface to the text column', () => {
    // 511.28pt of text column over a 400 cm surface.
    expect(planScale([surface({ id: 'a', width: 400, height: 100 })], 511.28, 330)).toBeCloseTo(
      511.28 / 400,
    );
  });

  it('falls back to the height cap when a surface is deep rather than wide', () => {
    const scale = planScale([surface({ id: 'a', width: 100, height: 400 })], 511.28, 330);
    expect(scale).toBeCloseTo(330 / 400);
  });

  it('is bound by the largest surface in either direction', () => {
    const surfaces = [
      surface({ id: 'a', width: 400, height: 60 }),
      surface({ id: 'b', width: 80, height: 300 }),
    ];
    expect(planScale(surfaces, 511.28, 330)).toBeCloseTo(Math.min(511.28 / 400, 330 / 300));
  });

  it('survives a degenerate surface rather than dividing by zero', () => {
    expect(planScale([surface({ id: 'a', width: 0, height: 0 })], 511.28, 330)).toBe(1);
    expect(planScale([], 511.28, 330)).toBe(1);
  });

  it('draws two surfaces of the same size at the same size, wherever they land', () => {
    // The second small surface follows a full-page one, so under a per-section fit it
    // would be squeezed into whatever space was left and come out smaller.
    const surfaces = [
      surface({ id: 'big', name: 'Big', width: 400, height: 200 }),
      surface({ id: 'l', name: 'Heck L', width: 75, height: 55 }),
      surface({ id: 'tall', name: 'Tall', width: 300, height: 190 }),
      surface({ id: 'r', name: 'Heck R', width: 75, height: 55 }),
    ];
    // No layouts, so the only rectangles at the left margin are the surface bodies and
    // the summary box; the bodies are picked out by the aspect ratio of their surface.
    const pdf = build({ config: { ...CONFIG, surfaces }, selected: {}, selection: {} });
    const atMargin = drawnRects(pdf).filter((r) => Math.abs(r.x - 42) < 0.01);
    const bodiesOf = (w: number, h: number) =>
      atMargin.filter((r) => Math.abs(r.w / r.h - w / h) < 0.001);

    const hecks = bodiesOf(75, 55);
    expect(hecks).toHaveLength(2);
    expect(hecks[0].w).toBeCloseTo(hecks[1].w);
    expect(hecks[0].h).toBeCloseTo(hecks[1].h);

    // And every drawing shares one scale, so the sizes stay in proportion.
    const [big] = bodiesOf(400, 200);
    const [tall] = bodiesOf(300, 190);
    expect(big.w / hecks[0].w).toBeCloseTo(400 / 75);
    expect(tall.w / hecks[0].w).toBeCloseTo(300 / 75);
  });
});

describe('table alignment', () => {
  // Right-aligned columns have to line up across all three sections of a table; the
  // plugin applies column styles to body cells only, which left the totals and the
  // headers sitting to the left of the figures they belong to.
  const pdf = build();

  it('ends a total under the column it totals', () => {
    expect(rightEdgeOf(pdf, '550 Wp', 'bold', 9)).toBeCloseTo(rightEdgeOf(pdf, '350', 'normal', 9), 1);
    expect(rightEdgeOf(pdf, '4', 'bold', 9)).toBeCloseTo(rightEdgeOf(pdf, '2', 'normal', 9), 1);
  });

  it('ends a numeric header over its own figures', () => {
    expect(rightEdgeOf(pdf, 'Total Wp', 'bold', 7.5)).toBeCloseTo(
      rightEdgeOf(pdf, '350', 'normal', 9),
      1,
    );
  });

  it('leaves the leading text column alone', () => {
    const model = drawnPositions(pdf).find((d) => d.text === '175 W mono')!;
    const total = drawnPositions(pdf).find((d) => d.text === 'Total')!;
    expect(total.x).toBeCloseTo(42, 1); // flush left, where the header sits too
    expect(model.x).toBeGreaterThan(total.x); // indented past its color swatch
  });
});

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
