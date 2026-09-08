/**
 * Colors for panel models. Two models that can be on screen at the same time must never
 * share one, or a plan drawn from a large catalog reads as a single model; see
 * {@link assignPanelColors}.
 */

/**
 * The color pool, ordered. The first eight are the app's long-standing accents (they are
 * also the `--accent*` custom properties in `app.css`); the rest were chosen to sit as
 * far from those — and from each other — as the eight already sit apart, measured in
 * OKLab. Every entry is light enough for the black labels the canvas draws on top, and
 * they differ mostly in hue so they survive the wash-out tint the PDF prints them with.
 */
export const PANEL_PALETTE: readonly string[] = [
  '#4a9eff', // blue
  '#3fb950', // green
  '#f5a623', // amber
  '#bc6cff', // purple
  '#ff6bb8', // pink
  '#2dd4bf', // teal
  '#f97316', // orange
  '#e5534b', // red
  '#bef264', // lime
  '#c4b5fd', // violet
  '#a8a29e', // stone
  '#fda4af', // rose
  '#b8a13a', // olive
  '#7dd3fc', // sky
  '#c98bd6', // plum
  '#06b6d4', // cyan
];

/** The color a model falls back to when nothing places it: its slot in the pool. */
export function panelColor(index: number): string {
  return PANEL_PALETTE[index % PANEL_PALETTE.length];
}

/** Split `#rrggbb` into its channels. Unparseable input reads as black. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1], 16) : 0;
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

type Lab = [number, number, number];

/**
 * sRGB to OKLab, whose euclidean distance tracks how different two colors *look* — plain
 * RGB distance does not, and picking colors apart is the whole point here.
 */
function oklab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** How far apart two colors look, 0 being identical. */
export function colorDistance(a: string, b: string): number {
  return labDistance(oklab(a), oklab(b));
}

function labDistance(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const PALETTE_LAB = PANEL_PALETTE.map(oklab);

/** The models each option of one surface places — one entry per option. */
export type SurfaceOptions = readonly (readonly string[])[];

/**
 * Pick a color for every model, keeping the ones that can be seen together apart.
 *
 * `bySurface` is the computed options grouped by the surface they belong to. Everything
 * drawn at once has to be distinguishable, and every surface shows one of its options at
 * a time, so two models clash when they share an option *or* when they sit on different
 * surfaces — either way a single view can hold both. Two models on the same surface but
 * in different options never appear together and may share a color, which is what lets a
 * catalog far larger than the palette still come out legible.
 *
 * `optionIds` is the catalog in its stored order. It decides which models get a color at
 * all, and breaks every tie, so the result depends only on the inputs.
 */
export function assignPanelColors(
  optionIds: readonly string[],
  bySurface: Iterable<SurfaceOptions>,
): Map<string, string> {
  const slot = new Map(optionIds.map((id, i) => [id, i]));
  // Two grades of clash: models sharing an option are drawn side by side and *must*
  // differ; models on different surfaces merely can be shown together. Keeping them
  // apart lets a catalog that outgrows the palette give up the weaker claim first.
  const sameOption = new Map<string, Set<string>>(optionIds.map((id) => [id, new Set()]));
  const sameView = new Map<string, Set<string>>(optionIds.map((id) => [id, new Set()]));
  const link = (into: Map<string, Set<string>>, a: string, b: string) => {
    if (a === b || !into.has(a) || !into.has(b)) return;
    into.get(a)!.add(b);
    into.get(b)!.add(a);
  };

  const perSurface: string[][] = [];
  for (const options of bySurface) {
    const placed = new Set<string>();
    for (const option of options) {
      const ids = [...new Set(option)];
      for (const a of ids) {
        placed.add(a);
        for (const b of ids) link(sameOption, a, b);
      }
    }
    perSurface.push([...placed]);
  }
  // A model placed on two surfaces lands on both sides of this and so ends up clashing
  // with nearly everything — right, since it can turn up opposite any of them.
  for (let i = 0; i < perSurface.length; i++) {
    for (let j = i + 1; j < perSurface.length; j++) {
      for (const a of perSurface[i]) {
        for (const b of perSurface[j]) link(sameView, a, b);
      }
    }
  }

  // Color the most constrained models first (Welsh-Powell): by the time a model with few
  // neighbours is reached the pool is still wide open, whereas the reverse order paints
  // the crowded ones into a corner.
  const degree = (id: string) => sameOption.get(id)!.size + sameView.get(id)!.size;
  const order = [...optionIds].sort((a, b) => degree(b) - degree(a) || slot.get(a)! - slot.get(b)!);

  const colors = new Map<string, string>();
  for (const id of order) {
    const inOption = new Set<string>();
    const inView = new Set<string>();
    const neighbours: Lab[] = [];
    const seen = (into: Set<string>, from: Set<string>) => {
      for (const other of from) {
        const color = colors.get(other);
        if (color === undefined) continue; // not colored yet; it will avoid us instead
        into.add(color);
        neighbours.push(oklab(color));
      }
    };
    seen(inOption, sameOption.get(id)!);
    seen(inView, sameView.get(id)!);

    // Walk the pool from this model's own slot, so a catalog whose models never meet
    // keeps exactly the colors it has today. Prefer a color no one it shares an option
    // with uses, then one no one it shares a view with uses, then the one that looks
    // least like any of them; ties fall to whichever came first in the walk.
    const preferred = slot.get(id)! % PANEL_PALETTE.length;
    let best = PANEL_PALETTE[preferred];
    let bestOption = -1;
    let bestView = -1;
    let bestGap = -1;
    for (let step = 0; step < PANEL_PALETTE.length; step++) {
      const i = (preferred + step) % PANEL_PALETTE.length;
      const color = PANEL_PALETTE[i];
      const freeOption = inOption.has(color) ? 0 : 1;
      const freeView = inView.has(color) ? 0 : 1;
      const gap = neighbours.length
        ? Math.min(...neighbours.map((n) => labDistance(n, PALETTE_LAB[i])))
        : Infinity;
      const better =
        freeOption !== bestOption
          ? freeOption > bestOption
          : freeView !== bestView
            ? freeView > bestView
            : gap > bestGap;
      if (better) {
        best = color;
        bestOption = freeOption;
        bestView = freeView;
        bestGap = gap;
      }
    }
    colors.set(id, best);
  }
  return colors;
}
