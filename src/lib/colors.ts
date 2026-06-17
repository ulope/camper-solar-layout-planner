// Stable, visually distinct colors for panel models, indexed by their order
// in the panel-options list.
const PALETTE = [
  '#4a9eff', // blue
  '#3fb950', // green
  '#f5a623', // amber
  '#bc6cff', // purple
  '#ff6bb8', // pink
  '#2dd4bf', // teal
  '#f97316', // orange
  '#e5534b', // red
];

export function panelColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
