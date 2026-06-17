// Shared domain types. All measurements are in centimeters; power is in watt-peak (Wp).

export type Rect = { x: number; y: number; w: number; h: number };

export type KeepOut = Rect & { id: string; label?: string };

export type PanelOption = {
  id: string;
  name: string;
  width: number; // cm
  height: number; // cm
  power: number; // Wp
  voltage?: number; // V (e.g. Vmp) — optional, enables series/parallel wiring readout
  current?: number; // A (e.g. Imp) — optional, paired with voltage
};

export type Config = {
  roof: { width: number; height: number };
  edgeMargin: number; // inset from roof edge, cm
  panelGap: number; // minimum spacing between panels / around keep-outs, cm
  gridSnap: number; // canvas edit snap step in cm; 0 = off, else 1 | 5 | 10
  keepOuts: KeepOut[];
  panelOptions: PanelOption[];
};

export type Placement = {
  optionId: string;
  x: number;
  y: number;
  w: number; // placed footprint width (already oriented)
  h: number; // placed footprint height (already oriented)
  rotated: boolean; // true when the panel was turned 90°
  power: number; // Wp
};

export type Layout = {
  placements: Placement[];
  totalPower: number; // sum of Wp
  panelCount: number;
  usedArea: number; // cm² of panel area
  usableArea: number; // cm² of free roof area after margins & keep-outs
  coverage: number; // usedArea / usableArea, 0..1
};
