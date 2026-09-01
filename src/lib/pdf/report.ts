/**
 * The PDF report: the selected layout of every surface drawn to scale, plus the bill of
 * materials that goes with it.
 *
 * What is exported is what is *selected* — the option each surface currently shows on the
 * canvas — so the file matches the screen the user was looking at when they asked for it.
 *
 * The drawing mirrors `LayoutCanvas` in structure (surface body, edge margin, keep-outs,
 * placed panels with wrapped labels) but not in palette: the canvas is dark because it
 * sits in a dark app, while a report is read on white and often printed, so the colors
 * here are the print-side equivalents of the same elements. Panel fills are the canvas's
 * model colors tinted toward white, which keeps them distinguishable next to the swatches
 * in the table without flooding a page with ink.
 *
 * Everything is drawn as vectors and real text — jsPDF for the page and the graphics,
 * jspdf-autotable for the tables — rather than by rasterizing the canvas, so the plan
 * stays sharp at any zoom and its figures stay selectable and searchable.
 */

import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData, type UserOptions } from 'jspdf-autotable';
import type { Config, Layout, PanelOption, Surface } from '../types';
import { panelColor } from '../colors';
import { isPanelFlexible } from '../panels';
import { wrapText } from '../textwrap';
import type { Formatters } from '../format';
import type { MessageKey, MessageParams } from '../i18n';
import { planToShare, planUrl } from '../share/plan';
import { drawQr, planQr, type PlanQr } from './qr';
import { fitText, winAnsi } from './text';

/** The subset of the i18n translator this module needs, so it stays store-free. */
export type Translate = (key: MessageKey, params?: MessageParams) => string;

export type PdfReportInput = {
  config: Config;
  /** The layout each surface currently shows, by surface id. Missing = not optimized. */
  selected: Record<string, Layout | null>;
  /** Which alternative that is, per surface id: 0-based index and how many exist. */
  selection: Record<string, { index: number; count: number }>;
  t: Translate;
  fmt: Formatters;
  /**
   * Where the app this plan came from is served, e.g. `location.origin + pathname`. The
   * report puts a QR code to it on the first page, so the printed plan can be scanned
   * back into the app. Omitted — as it is when no page URL is available — no code is
   * drawn and nothing refers to one.
   */
  shareUrlBase?: string;
  /** Injectable so a test gets a reproducible file. */
  date?: Date;
  /**
   * Deflate the content streams. On by default; tests turn it off so the produced page
   * can be read back as text.
   */
  compress?: boolean;
};

// ----- Print palette -----

const INK = '#1b2430'; // body text
const MUTED = '#6b7785'; // labels, captions
const RULE = '#c9d2dc'; // hairlines and table rules
const PANEL_BG = '#f4f6f9'; // summary block
const SURFACE_FILL = '#ffffff';
const SURFACE_EDGE = '#556173';
const MARGIN_LINE = '#c08a2e';
const KEEPOUT_FILL = '#f6dedb';
const KEEPOUT_LINE = '#c0453c';
const ACCENT = '#9a6508';

// ----- Page metrics, in points -----

const MARGIN = 42;
const TOP = 54; // first content row, below the running header
const FOOT = 46; // reserved for the footer

const BODY = 9;
const SMALL = 8;
const LINE = 12;

/** The printed QR square, quiet zone included — 45 mm. */
const QR_SIDE = 127.6;
/** Gap between the header's left column and the QR block. */
const QR_GAP = 14;

/** Panel-label metrics, in points; the canvas equivalents are in px. */
const LABEL_PAD = 3;
const NAME_SIZE = 7;
const NAME_LINE_H = 8;
const POWER_SIZE = 6.5;

type Box = { x: number; y: number; w: number; h: number };

/** Blend two hex colors, `t` being the share of `b`. Used to tint fills for print. */
export function mixColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    const v = m ? parseInt(m[1], 16) : 0;
    return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const channel = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}

/**
 * A page cursor over a jsPDF document: hands out vertical space and starts a new page
 * when a block does not fit. Sections draw through it rather than computing absolute
 * positions, so they compose in any order and pagination is decided in one place.
 */
class Flow {
  y = TOP;
  readonly width: number;
  private readonly bottom: number;

  constructor(readonly doc: jsPDF) {
    this.width = doc.internal.pageSize.getWidth() - MARGIN * 2;
    this.bottom = doc.internal.pageSize.getHeight() - FOOT;
  }

  newPage(): void {
    this.doc.addPage();
    this.y = TOP;
  }

  /** Space left on the current page. */
  get room(): number {
    return this.bottom - this.y;
  }

  /** Start a new page unless `height` still fits. */
  need(height: number): void {
    if (height > this.room) this.newPage();
  }

  /** A line of text at the cursor, which then moves past it. */
  line(
    text: string,
    style: { bold?: boolean; size?: number; color?: string; gap?: number } = {},
  ): void {
    const size = style.size ?? BODY;
    const gap = style.gap ?? LINE;
    this.need(gap);
    this.doc.setFont('helvetica', style.bold ? 'bold' : 'normal');
    this.doc.setFontSize(size);
    this.doc.setTextColor(style.color ?? INK);
    this.doc.text(winAnsi(text), MARGIN, this.y + size);
    this.y += gap;
  }

  rule(): void {
    this.doc.setDrawColor(RULE);
    this.doc.setLineWidth(0.5);
    this.doc.line(MARGIN, this.y, MARGIN + this.width, this.y);
  }

  /** Width of `text` in points, as the viewer will lay it out. */
  measure(text: string, size: number, bold = false): number {
    this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
    this.doc.setFontSize(size);
    return this.doc.getTextWidth(winAnsi(text));
  }
}

// ----- Bill of materials -----

/** One line of the modules table: a placed model with its aggregated figures. */
type ModuleRow = {
  id: string;
  name: string;
  color: string;
  flexible: boolean;
  width: number;
  height: number;
  wp: number;
  qty: number;
  totalPower: number;
  /** `null` when the catalog has no figure for the model — never silently zero. */
  weight: number | null;
  price: number | null;
};

/**
 * Aggregate the placements of one or more layouts per panel model, ordered by the model's
 * Wp like the results panel's breakdown, and colored by its index in the catalog so a row
 * matches the rectangles in the drawing above it.
 */
function moduleRows(options: PanelOption[], layouts: Layout[]): ModuleRow[] {
  const counts = new Map<string, number>();
  for (const layout of layouts) {
    for (const p of layout.placements) counts.set(p.optionId, (counts.get(p.optionId) ?? 0) + 1);
  }
  return options
    .map((option, i) => ({ option, color: panelColor(i), qty: counts.get(option.id) ?? 0 }))
    .filter((r) => r.qty > 0)
    .map(({ option, color, qty }) => ({
      id: option.id,
      name: option.name,
      color,
      flexible: isPanelFlexible(option),
      width: option.width,
      height: option.height,
      wp: option.power,
      qty,
      totalPower: option.power * qty,
      weight: typeof option.weight === 'number' && option.weight > 0 ? option.weight * qty : null,
      price: typeof option.price === 'number' && option.price > 0 ? option.price * qty : null,
    }))
    .sort((a, b) => b.wp - a.wp || b.qty - a.qty);
}

/** A column total plus whether any row was missing the figure, for the "≥" marker. */
type Sum = { total: number; partial: boolean; any: boolean };

function sumField(rows: ModuleRow[], field: 'weight' | 'price'): Sum {
  let total = 0;
  let partial = false;
  let any = false;
  for (const r of rows) {
    if (r[field] === null) partial = true;
    else {
      total += r[field] as number;
      any = true;
    }
  }
  return { total, partial, any };
}

// ----- The scale drawing -----

/** Round scale-bar lengths in cm, smallest first. */
const SCALE_STEPS = [10, 20, 25, 50, 100, 200, 250, 500, 1000];

/**
 * Draw one surface to scale inside `box`, centered, and return the box the drawing
 * actually occupies so the caller can put the scale bar directly under it.
 */
function drawSurfacePlan(
  flow: Flow,
  box: Box,
  surface: Surface,
  layout: Layout | null,
  config: Config,
  colorOf: (optionId: string) => string,
  nameOf: (optionId: string) => string,
  t: Translate,
  fmt: Formatters,
): Box {
  const doc = flow.doc;
  const scale = Math.min(box.w / surface.width, box.h / surface.height);
  const w = surface.width * scale;
  const h = surface.height * scale;
  const ox = box.x + (box.w - w) / 2;
  const oy = box.y + (box.h - h) / 2;
  const px = (cm: number) => ox + cm * scale;
  const py = (cm: number) => oy + cm * scale;

  doc.setFillColor(SURFACE_FILL);
  doc.setDrawColor(SURFACE_EDGE);
  doc.setLineWidth(1);
  doc.rect(ox, oy, w, h, 'FD');

  const margin = config.edgeMargin;
  if (margin > 0 && surface.width > 2 * margin && surface.height > 2 * margin) {
    doc.setDrawColor(MARGIN_LINE);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([4, 3], 0);
    doc.rect(
      px(margin),
      py(margin),
      (surface.width - 2 * margin) * scale,
      (surface.height - 2 * margin) * scale,
      'S',
    );
    doc.setLineDashPattern([], 0);
  }

  for (const p of layout?.placements ?? []) {
    const color = colorOf(p.optionId);
    const x = px(p.x);
    const y = py(p.y);
    const pw = p.w * scale;
    const ph = p.h * scale;
    doc.setFillColor(mixColor(color, '#ffffff', 0.62));
    doc.setDrawColor(color);
    doc.setLineWidth(0.7);
    doc.rect(x, y, pw, ph, 'FD');

    const cx = x + pw / 2;
    const cy = y + ph / 2;
    const power = t('canvas.power', { power: fmt.num(p.power, 0) });
    const name = nameOf(p.optionId);
    doc.setTextColor(INK);
    if (name && pw > 42 && ph > 22) {
      // Long names wrap to the panel like they do on the canvas, and are ellipsized when
      // even the wrapped label has no room.
      const budget = ph - 2 * LABEL_PAD - NAME_LINE_H;
      const maxLines = Math.max(1, Math.floor(budget / NAME_LINE_H));
      const lines = wrapText(
        winAnsi(name),
        pw - 2 * LABEL_PAD,
        (s) => flow.measure(s, NAME_SIZE, true),
        maxLines,
      );
      const total = lines.length * NAME_LINE_H + NAME_LINE_H;
      let ty = cy - total / 2 + NAME_SIZE;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(NAME_SIZE);
      for (const line of lines) {
        doc.text(line, cx, ty, { align: 'center' });
        ty += NAME_LINE_H;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(POWER_SIZE);
      doc.text(winAnsi(power), cx, ty - 1, { align: 'center' });
    } else if (pw > 24 && ph > 10) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(POWER_SIZE);
      doc.text(winAnsi(power), cx, cy + POWER_SIZE / 2 - 0.5, { align: 'center' });
    }
  }

  // Keep-outs last, so they read as cut-outs over anything drawn before them.
  for (const ko of surface.keepOuts) {
    const kx = px(ko.x);
    const ky = py(ko.y);
    const kw = ko.w * scale;
    const kh = ko.h * scale;
    doc.setFillColor(KEEPOUT_FILL);
    doc.rect(kx, ky, kw, kh, 'F');

    doc.saveGraphicsState();
    doc.rect(kx, ky, kw, kh, null); // path only: the clip below consumes it
    doc.clip();
    doc.discardPath();
    doc.setDrawColor(KEEPOUT_LINE);
    doc.setLineWidth(0.4);
    for (let i = -kh; i < kw; i += 6) doc.line(kx + i, ky, kx + i + kh, ky + kh);
    doc.restoreGraphicsState();

    doc.setDrawColor(KEEPOUT_LINE);
    doc.setLineWidth(0.8);
    doc.rect(kx, ky, kw, kh, 'S');

    const label = ko.label ?? '';
    if (label && kw > 26 && kh > 10) {
      const size = SMALL - 1;
      const text = fitText(winAnsi(label), kw - 4, (s) => flow.measure(s, size, true));
      doc.setFillColor('#ffffff');
      doc.rect(kx + 2, ky + 2, flow.measure(text, size, true) + 4, size + 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(size);
      doc.setTextColor(KEEPOUT_LINE);
      doc.text(text, kx + 4, ky + size + 1.5);
    }
  }

  return { x: ox, y: oy, w, h };
}

/**
 * A scale bar under a drawing: the longest round number of centimeters that fits in a
 * quarter of the drawing's width, so a reader can measure off the page.
 */
function drawScaleBar(flow: Flow, plan: Box, scale: number, t: Translate, fmt: Formatters): void {
  const doc = flow.doc;
  const maxPt = Math.max(40, plan.w / 4);
  const cm = [...SCALE_STEPS].reverse().find((s) => s * scale <= maxPt) ?? SCALE_STEPS[0];
  const w = cm * scale;
  const y = plan.y + plan.h + 9;
  doc.setDrawColor(MUTED);
  doc.setLineWidth(0.8);
  doc.line(plan.x, y, plan.x + w, y);
  doc.line(plan.x, y - 2.5, plan.x, y + 2.5);
  doc.line(plan.x + w, y - 2.5, plan.x + w, y + 2.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(SMALL - 1);
  doc.setTextColor(MUTED);
  doc.text(winAnsi(t('pdf.scaleBar', { cm: fmt.num(cm, 0) })), plan.x + w + 5, y + 2.5);
}

// ----- Tables -----

/** jsPDF gains this from the autotable plugin; it is how a table reports where it ended. */
type TabledDoc = jsPDF & { lastAutoTable?: { finalY?: number } };

const SWATCH = 7;
/** Height of one autotable row at {@link BODY} size, padding included. */
const ROW_H = 16;
/** Rows worth reserving room for before a table starts; beyond that, let it break. */
const KEEP_ROWS = 5;

/**
 * Roughly how tall a table will be, for deciding whether it still fits on this page.
 * Only ever used to keep a heading with the table under it — the plugin does the real
 * pagination — so an estimate that stops counting after a few rows is enough.
 */
function tableHeight(rows: number, foot = false): number {
  return ROW_H * (1 + Math.min(rows, KEEP_ROWS) + (foot ? 1 : 0)) + 10;
}

/**
 * Run one autotable with the report's shared styling. Column widths, header repetition
 * and page breaks are the plugin's job; the cursor is moved to just below the table.
 */
function table(flow: Flow, options: UserOptions): void {
  autoTable(flow.doc, {
    theme: 'plain',
    startY: flow.y,
    margin: { left: MARGIN, right: MARGIN, top: TOP, bottom: FOOT },
    styles: {
      font: 'helvetica',
      fontSize: BODY,
      textColor: INK,
      cellPadding: { top: 2.5, bottom: 2.5, left: 0, right: 0 },
      overflow: 'ellipsize',
    },
    headStyles: {
      fontSize: SMALL - 0.5,
      fontStyle: 'bold',
      textColor: MUTED,
      lineWidth: { bottom: 0.5 },
      lineColor: RULE,
    },
    footStyles: { fontStyle: 'bold', textColor: INK, lineWidth: { top: 0.5 }, lineColor: RULE },
    ...options,
  });
  flow.y = ((flow.doc as TabledDoc).lastAutoTable?.finalY ?? flow.y) + 10;
}

/** Paint the model's color chip into the first column of a body row. */
function drawSwatch(data: CellHookData, colorFor: (index: number) => string | undefined): void {
  if (data.section !== 'body' || data.column.dataKey !== 'name') return;
  const color = colorFor(data.row.index);
  if (!color) return;
  const doc = data.doc as jsPDF;
  doc.setFillColor(color);
  doc.setDrawColor(mixColor(color, '#000000', 0.25));
  doc.setLineWidth(0.4);
  doc.rect(data.cell.x, data.cell.y + (data.cell.height - SWATCH) / 2, SWATCH, SWATCH, 'FD');
}

// ----- The report -----

/** Build the PDF for the currently selected configuration. */
export function buildLayoutPdf(input: PdfReportInput): jsPDF {
  const { config, selected, selection, t, fmt } = input;
  const date = input.date ?? new Date();

  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
    orientation: 'portrait',
    compress: input.compress ?? true,
  });
  doc.setProperties({
    title: t('pdf.docTitle'),
    creator: t('app.title'),
    subject: t('pdf.docTitle'),
  });
  const flow = new Flow(doc);

  const colorIndex = new Map(config.panelOptions.map((o, i) => [o.id, i]));
  const colorOf = (optionId: string) => panelColor(colorIndex.get(optionId) ?? 0);
  const nameOf = (optionId: string) =>
    config.panelOptions.find((o) => o.id === optionId)?.name ?? '';

  const layouts = config.surfaces
    .map((s) => selected[s.id] ?? null)
    .filter((l): l is Layout => l !== null);

  const rows = moduleRows(config.panelOptions, layouts);

  // ----- The plan's own QR code -----
  // Built before the header is laid out: whether there is a code decides whether the
  // title block gets the full width or shares it with the square on the right.
  const shared = input.shareUrlBase ? planToShare(config, layouts) : null;
  const qr = shared ? planQr(planUrl(input.shareUrlBase as string, shared)) : null;
  const headerW = qr ? flow.width - QR_SIDE - QR_GAP : flow.width;
  const headerTop = flow.y;

  // ----- Title -----
  flow.line(t('app.title'), { bold: true, size: 17, gap: 22 });
  flow.line(t('pdf.generated', { date: formatDate(date, fmt.locale) }), {
    size: SMALL,
    color: MUTED,
    gap: 16,
  });

  // ----- Summary -----
  drawSummary(flow, config, layouts, rows, headerW, t, fmt);
  if (shared && !qr) flow.line(t('pdf.qrTooLarge'), { size: SMALL, color: MUTED, gap: 14 });

  if (qr) {
    const bottom = drawQrBlock(flow, MARGIN + flow.width - QR_SIDE, headerTop, qr, shared!, rows, t, fmt);
    flow.y = Math.max(flow.y, bottom);
  }

  // ----- One section per surface -----
  const multi = config.surfaces.length > 1;
  for (const surface of config.surfaces) {
    drawSurfaceSection(flow, surface, selected[surface.id] ?? null, selection[surface.id], {
      config,
      colorOf,
      nameOf,
      t,
      fmt,
      showTable: multi,
    });
  }

  // ----- Bill of materials -----
  flow.need(4 + 17 + (rows.length === 0 ? LINE : tableHeight(rows.length, true)));
  flow.y += 4;
  flow.line(multi ? t('pdf.modulesAll') : t('pdf.modules'), { bold: true, size: 12, gap: 17 });
  if (rows.length === 0) {
    flow.line(t('pdf.noModules'), { color: MUTED });
  } else {
    drawModuleTable(flow, rows, t, fmt);
  }

  decoratePages(doc, t, fmt, date);
  return doc;
}

function formatDate(date: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/**
 * The figures block under the title: the totals of everything currently selected. Drawn
 * to `width` rather than the full text column, since the QR code shares the header row.
 */
function drawSummary(
  flow: Flow,
  config: Config,
  layouts: Layout[],
  rows: ModuleRow[],
  width: number,
  t: Translate,
  fmt: Formatters,
): void {
  const doc = flow.doc;
  const weight = sumField(rows, 'weight');
  const price = sumField(rows, 'price');
  const amount = (s: Sum, render: (v: number) => string) =>
    s.any ? `${s.partial ? '≥ ' : ''}${render(s.total)}` : '—';

  const figures: [string, string][] = [
    [t('pdf.totalPower'), `${fmt.num(layouts.reduce((s, l) => s + l.totalPower, 0), 0)} Wp`],
    [t('pdf.panelsLabel'), fmt.num(layouts.reduce((s, l) => s + l.panelCount, 0), 0)],
    [t('pdf.surfacesLabel'), fmt.num(config.surfaces.length, 0)],
    [t('pdf.panelArea'), fmt.area(layouts.reduce((s, l) => s + l.usedArea, 0))],
    [t('results.weight'), amount(weight, (v) => fmt.weight(v))],
    [t('results.price'), amount(price, (v) => fmt.price(v))],
  ];

  const boxH = 46;
  flow.need(boxH + 22);
  doc.setFillColor(PANEL_BG);
  doc.setDrawColor(RULE);
  doc.setLineWidth(0.5);
  doc.rect(MARGIN, flow.y, width, boxH, 'FD');

  const cellW = width / figures.length;

  // One label size for the whole row, stepped down until the longest fits its cell.
  // A cell is narrow when the QR code shares the header row, and the labels are single
  // words in German ("GESAMTLEISTUNG"), so neither wrapping nor truncating them is any
  // use — a quarter-point of type is invisible where a broken word is not.
  const labels = figures.map(([label]) => winAnsi(label.toUpperCase()));
  let labelSize = SMALL - 1.5;
  while (labelSize > 5 && labels.some((l) => flow.measure(l, labelSize) > cellW - 6)) {
    labelSize -= 0.25;
  }

  figures.forEach(([, value], i) => {
    const cx = MARGIN + cellW * i + cellW / 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(labelSize);
    doc.setTextColor(MUTED);
    doc.text(fitText(labels[i], cellW - 4, (x) => flow.measure(x, labelSize)), cx, flow.y + 15, {
      align: 'center',
    });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(INK);
    const text = fitText(winAnsi(value), cellW - 8, (s) => flow.measure(s, 11, true));
    doc.text(text, cx, flow.y + 33, { align: 'center' });
  });
  flow.y += boxH + 6;

  let settings = t('pdf.settings', {
    margin: fmt.num(config.edgeMargin, 0),
    gap: fmt.num(config.panelGap, 0),
  });
  if (config.minVoltage && config.minVoltage > 0) {
    settings += t('pdf.settingsVoltage', { volts: fmt.num(config.minVoltage) });
  }
  flow.line(settings, { size: SMALL, color: MUTED, gap: 16 });
  if (weight.partial || price.partial) {
    flow.line(t('results.partialNote'), { size: SMALL, color: MUTED, gap: 14 });
  }
}

/**
 * The QR square and its caption, in the header's right column. Returns the y it ends at,
 * so the caller can start the first surface below whichever column is taller.
 */
function drawQrBlock(
  flow: Flow,
  x: number,
  top: number,
  qr: PlanQr,
  shared: Config,
  rows: ModuleRow[],
  t: Translate,
  fmt: Formatters,
): number {
  const doc = flow.doc;
  drawQr(doc, qr, x, top, QR_SIDE);

  let y = top + QR_SIDE + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(INK);
  doc.text(winAnsi(t('pdf.qrCaption')), x + QR_SIDE / 2, y, { align: 'center' });
  y += 9;

  // What the code carries: the models of the plan itself, or — with nothing optimized to
  // take them from — the selected catalog. Saying which is the difference between a
  // scan that surprises someone and one that does not.
  const note =
    rows.length > 0
      ? t('pdf.qrModels', { count: shared.panelOptions.length })
      : t('pdf.qrCatalog');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(MUTED);
  for (const line of wrapText(winAnsi(note), QR_SIDE, (s) => flow.measure(s, 6.5), 3)) {
    doc.text(line, x + QR_SIDE / 2, y, { align: 'center' });
    y += 7.5;
  }
  return y;
}

/** Heading, scaled drawing, stats line and — with several surfaces — its own table. */
function drawSurfaceSection(
  flow: Flow,
  surface: Surface,
  layout: Layout | null,
  selection: { index: number; count: number } | undefined,
  ctx: {
    config: Config;
    colorOf: (id: string) => string;
    nameOf: (id: string) => string;
    t: Translate;
    fmt: Formatters;
    showTable: boolean;
  },
): void {
  const { config, colorOf, nameOf, t, fmt } = ctx;
  const HEADING = 17;
  const STATS = 14;
  const SCALE_ROOM = 20;
  const MIN_PLAN = 110;

  // The per-surface table belongs with the drawing it breaks down, so it is part of the
  // room the section asks for, and the drawing gives way to it rather than the reverse.
  const rows = layout ? moduleRows(config.panelOptions, [layout]) : [];
  const tableRoom = ctx.showTable && rows.length > 0 ? tableHeight(rows.length) : 0;

  flow.y += 6;
  flow.need(HEADING + MIN_PLAN + SCALE_ROOM + STATS + tableRoom);
  flow.line(
    t('pdf.surfaceHeading', {
      name: surface.name,
      width: fmt.num(surface.width, 0),
      height: fmt.num(surface.height, 0),
    }),
    { bold: true, size: 12, gap: HEADING },
  );

  if (surface.width > 0 && surface.height > 0) {
    const natural = (surface.height / surface.width) * flow.width;
    const available = flow.room - STATS - SCALE_ROOM - tableRoom;
    const planH = Math.max(MIN_PLAN, Math.min(natural, available, 330));
    const box: Box = { x: MARGIN, y: flow.y, w: flow.width, h: planH };
    const plan = drawSurfacePlan(flow, box, surface, layout, config, colorOf, nameOf, t, fmt);
    drawScaleBar(flow, plan, plan.w / surface.width, t, fmt);
    flow.y += planH + SCALE_ROOM;
  }

  if (!layout) {
    flow.line(t('results.notOptimized'), { color: MUTED });
    return;
  }

  const option =
    selection && selection.count > 0
      ? t('pdf.optionOf', { index: selection.index + 1, count: selection.count })
      : '';
  const stats = t('results.meta', {
    panels: t('results.panelCount', { count: layout.panelCount }),
    coverage: fmt.num(Math.round(layout.coverage * 100), 0),
    area: fmt.area(layout.usedArea),
  });
  flow.line(`${fmt.num(layout.totalPower, 0)} Wp · ${stats}${option ? ` · ${option}` : ''}`, {
    gap: STATS,
  });

  if (layout.placements.length === 0) {
    flow.line(t('results.noFitSurface'), { color: MUTED });
    return;
  }
  if (!ctx.showTable) return;

  table(flow, {
    columns: [
      { header: t('pdf.colModel'), dataKey: 'name' },
      { header: t('pdf.colSize'), dataKey: 'size' },
      { header: t('pdf.colPower'), dataKey: 'wp' },
      { header: t('pdf.colQty'), dataKey: 'qty' },
      { header: t('pdf.colTotalPower'), dataKey: 'total' },
    ],
    body: rows.map((r) => ({
      name: winAnsi(modelName(r, t)),
      size: winAnsi(sizeCell(r, t, fmt)),
      wp: fmt.num(r.wp, 0),
      qty: fmt.num(r.qty, 0),
      total: fmt.num(r.totalPower, 0),
    })),
    columnStyles: {
      name: { cellPadding: { top: 2.5, bottom: 2.5, left: SWATCH + 4, right: 4 } },
      size: { cellWidth: 74 },
      wp: { cellWidth: 44, halign: 'right' },
      qty: { cellWidth: 34, halign: 'right' },
      total: { cellWidth: 60, halign: 'right' },
    },
    didDrawCell: (data) => drawSwatch(data, (i) => rows[i]?.color),
  });
}

/** The model name, with the flexible marker the results panel also shows. */
function modelName(row: ModuleRow, t: Translate): string {
  return row.flexible ? `${row.name} (${t('results.flexTag')})` : row.name;
}

function sizeCell(row: ModuleRow, t: Translate, fmt: Formatters): string {
  return t('pdf.sizeCell', { width: fmt.num(row.width, 0), height: fmt.num(row.height, 0) });
}

/** The full bill of materials, with weight and price columns when the catalog has them. */
function drawModuleTable(flow: Flow, rows: ModuleRow[], t: Translate, fmt: Formatters): void {
  const weight = sumField(rows, 'weight');
  const price = sumField(rows, 'price');
  const dash = { content: '—', styles: { textColor: MUTED } };

  const columns = [
    { header: t('pdf.colModel'), dataKey: 'name' },
    { header: t('pdf.colSize'), dataKey: 'size' },
    { header: t('pdf.colPower'), dataKey: 'wp' },
    { header: t('pdf.colQty'), dataKey: 'qty' },
    { header: t('pdf.colTotalPower'), dataKey: 'total' },
  ];
  const columnStyles: UserOptions['columnStyles'] = {
    name: { cellPadding: { top: 2.5, bottom: 2.5, left: SWATCH + 4, right: 4 } },
    size: { cellWidth: 68 },
    wp: { cellWidth: 40, halign: 'right' },
    qty: { cellWidth: 30, halign: 'right' },
    total: { cellWidth: 56, halign: 'right' },
  };
  // Columns nothing in the catalog can fill would be a page of em dashes; leave them out
  // and let the table breathe instead.
  if (weight.any) {
    columns.push({ header: t('results.weight'), dataKey: 'weight' });
    columnStyles.weight = { cellWidth: 58, halign: 'right' };
  }
  if (price.any) {
    columns.push({ header: t('results.price'), dataKey: 'price' });
    columnStyles.price = { cellWidth: 58, halign: 'right' };
  }

  const body = rows.map((r) => {
    const row: Record<string, string | typeof dash> = {
      name: winAnsi(modelName(r, t)),
      size: winAnsi(sizeCell(r, t, fmt)),
      wp: fmt.num(r.wp, 0),
      qty: fmt.num(r.qty, 0),
      total: fmt.num(r.totalPower, 0),
    };
    if (weight.any) row.weight = r.weight === null ? dash : winAnsi(fmt.weight(r.weight));
    if (price.any) row.price = r.price === null ? dash : winAnsi(fmt.price(r.price));
    return row;
  });

  const totals: Record<string, string | { content: string; styles: { textColor: string } }> = {
    name: winAnsi(t('pdf.total')),
    size: '',
    wp: '',
    qty: fmt.num(rows.reduce((s, r) => s + r.qty, 0), 0),
    total: {
      content: `${fmt.num(rows.reduce((s, r) => s + r.totalPower, 0), 0)} Wp`,
      styles: { textColor: ACCENT },
    },
  };
  if (weight.any) {
    totals.weight = winAnsi(`${weight.partial ? '≥ ' : ''}${fmt.weight(weight.total)}`);
  }
  if (price.any) totals.price = winAnsi(`${price.partial ? '≥ ' : ''}${fmt.price(price.total)}`);

  table(flow, {
    columns,
    body,
    foot: [totals],
    showFoot: 'lastPage',
    columnStyles,
    didDrawCell: (data) => drawSwatch(data, (i) => rows[i]?.color),
  });

  if (weight.partial || price.partial) {
    flow.line(t('results.partialNote'), { size: SMALL, color: MUTED, gap: 12 });
  }
}

/**
 * The running header and footer, added once every page exists — the page count in the
 * footer is only known then.
 */
function decoratePages(doc: jsPDF, t: Translate, fmt: Formatters, date: Date): void {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(RULE);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, 34, width - MARGIN, 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(SMALL - 1);
    doc.setTextColor(MUTED);
    doc.text(winAnsi(t('app.title')), MARGIN, 28);
    doc.text(winAnsi(formatDate(date, fmt.locale)), width - MARGIN, 28, { align: 'right' });
    doc.text(
      winAnsi(t('pdf.page', { page: fmt.num(page, 0), count: fmt.num(pages, 0) })),
      width - MARGIN,
      height - 28,
      { align: 'right' },
    );
  }
}
