/**
 * Colors for panel models. Two models placed on the same layout must never share one,
 * or a plan drawn from a large catalog reads as a single model; see
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

/**
 * Pick a color for every model, keeping models that appear on the same layout apart.
 *
 * `groups` is one entry per computed layout: the ids of the models it places. Two models
 * that never share a layout may share a color — nothing ever draws them together — which
 * is what lets a catalog far larger than the palette still come out legible.
 *
 * `optionIds` is the catalog in its stored order. It decides which models get a color at
 * all, and breaks every tie, so the result depends only on the inputs.
 */
export function assignPanelColors(
  optionIds: readonly string[],
  groups: Iterable<readonly string[]>,
): Map<string, string> {
  const slot = new Map(optionIds.map((id, i) => [id, i]));
  const conflicts = new Map<string, Set<string>>(optionIds.map((id) => [id, new Set<string>()]));
  for (const group of groups) {
    const ids = [...new Set(group)].filter((id) => conflicts.has(id));
    for (const a of ids) {
      for (const b of ids) if (a !== b) conflicts.get(a)!.add(b);
    }
  }

  // Color the most constrained models first (Welsh-Powell): by the time a model with few
  // neighbours is reached the pool is still wide open, whereas the reverse order paints
  // the crowded ones into a corner.
  const order = [...optionIds].sort((a, b) => {
    const byDegree = conflicts.get(b)!.size - conflicts.get(a)!.size;
    return byDegree !== 0 ? byDegree : slot.get(a)! - slot.get(b)!;
  });

  const colors = new Map<string, string>();
  for (const id of order) {
    const taken = new Set<string>();
    const neighbours: Lab[] = [];
    for (const other of conflicts.get(id)!) {
      const color = colors.get(other);
      if (color === undefined) continue; // not colored yet; it will avoid us instead
      taken.add(color);
      neighbours.push(oklab(color));
    }

    // Walk the pool from this model's own slot, so a catalog whose models never meet
    // keeps exactly the colors it has today. Prefer a color no neighbour uses, then the
    // one that looks least like them; ties fall to whichever came first in the walk.
    const preferred = slot.get(id)! % PANEL_PALETTE.length;
    let best = PANEL_PALETTE[preferred];
    let bestFree = -1;
    let bestGap = -1;
    for (let step = 0; step < PANEL_PALETTE.length; step++) {
      const i = (preferred + step) % PANEL_PALETTE.length;
      const color = PANEL_PALETTE[i];
      const free = taken.has(color) ? 0 : 1;
      const gap = neighbours.length
        ? Math.min(...neighbours.map((n) => labDistance(n, PALETTE_LAB[i])))
        : Infinity;
      if (free > bestFree || (free === bestFree && gap > bestGap)) {
        best = color;
        bestFree = free;
        bestGap = gap;
      }
    }
    colors.set(id, best);
  }
  return colors;
}
