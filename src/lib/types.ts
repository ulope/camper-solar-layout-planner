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
  weight?: number; // kg — optional, used by the "lighter" optimization criterion
  price?: number; // currency units — optional, used by the "cheaper" criterion
  enabled?: boolean; // false excludes the model from optimization; absent means selected
  flexible?: boolean; // true = bendable; absent or false means a rigid framed panel
};

/**
 * Which kinds of panel a surface will carry. A curved or thin sidewall may take only
 * flexible panels, a framed roof rack only rigid ones, and many surfaces take either.
 */
export type AllowedPanels = 'rigid' | 'flexible' | 'both';

/**
 * One area panels can be placed on — a roof, a sidewall, a garage hatch. Every surface
 * owns its keep-outs, whose coordinates are *surface-local* (origin at its top-left).
 */
export type Surface = {
  id: string;
  name: string;
  width: number; // cm
  height: number; // cm
  keepOuts: KeepOut[];
  allowedPanels: AllowedPanels;
};

export type Config = {
  surfaces: Surface[]; // invariant: at least one, enforced by migration and the mutators
  edgeMargin: number; // inset from a surface edge, cm — global, applies to every surface
  panelGap: number; // minimum spacing between panels / around keep-outs, cm
  gridSnap: number; // canvas edit snap step in cm; 0 = off, else 1 | 5 | 10
  panelOptions: PanelOption[]; // catalog shared by every surface
};

/**
 * Everything an optimizer needs to pack ONE surface: its geometry plus the global
 * settings that apply to it. Flat rather than nested so the packing code never has to
 * know whether a value is per-surface or global.
 */
export type SurfaceTask = {
  width: number;
  height: number;
  edgeMargin: number;
  panelGap: number;
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
  usableArea: number; // cm² of free surface area after margins & keep-outs
  coverage: number; // usedArea / usableArea, 0..1
};

/**
 * Optimization results for every surface, keyed by surface id. Keyed rather than
 * positional so renaming, reordering or removing a surface cannot silently re-point a
 * result at the wrong surface; consumers iterate `config.surfaces` and look ids up here,
 * so entries orphaned by a removed surface are simply never read.
 */
export type SurfaceResults = Record<string, Layout[]>;
