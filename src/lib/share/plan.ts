/**
 * The shareable plan: a configuration squeezed small enough to travel inside a QR code
 * on the exported PDF, and read back when the app is opened at the link that code holds.
 *
 * Three things make it fit, in order of how much each buys:
 *
 * 1. **Only the panels the plan uses.** A catalog is a workbench — one real one runs to
 *    43 models — while a plan is what got placed, usually a handful. Carrying the
 *    placed models rather than the whole catalog is the difference between a code that
 *    scans off a printed page and one that does not. The JSON export stays the way to
 *    move a whole catalog; see {@link planToShare}.
 * 2. **A positional encoding.** Ids and keys go; the shape carries the meaning. Ids are
 *    regenerated on the way back in — nothing outside a config refers to them.
 * 3. **Deflate.** The payload is a few hundred bytes, which is well below the size where
 *    LZMA's adaptive model starts to pay for itself, so plain deflate is as small as
 *    anything else here and needs no library the browser lacks.
 *
 * Values are stored exactly as entered: real catalogs carry prices in cents (133.61) and
 * sizes to a millimetre (154.6), and a plan that came back with different numbers than it
 * left with would be worse than no plan at all.
 */

import { deflateSync, inflateSync } from 'fflate';
import { migrateConfig } from '../persistence';
import type { AllowedPanels, Config, Layout, PanelOption, Surface } from '../types';
import { isPanelEnabled } from '../panels';
import { fromBase32, toBase32 } from './base32';
import { PLAN_FRAGMENT_KEY } from './fragment';

export { PLAN_FRAGMENT_KEY, planFromFragment } from './fragment';

/**
 * Payload format version, first element of the encoded array. Bump it for a change that
 * an older decoder would read wrongly; {@link decodePlan} refuses what it does not know,
 * which is the honest outcome for a link from a newer app.
 */
const FORMAT = 1;

/** Surface panel policy, stored as its index. */
const ALLOWED: AllowedPanels[] = ['both', 'rigid', 'flexible'];

/** Panel model flags, packed into one number. */
const FLAG_FLEXIBLE = 1;
const FLAG_DISABLED = 2;

type EncodedKeepOut = [label: string, x: number, y: number, w: number, h: number];
type EncodedSurface = [
  name: string,
  width: number,
  height: number,
  allowed: number,
  keepOuts: EncodedKeepOut[],
];
type EncodedPanel = [
  name: string,
  width: number,
  height: number,
  power: number,
  voltage: number,
  current: number,
  weight: number,
  price: number,
  flags: number,
];
type EncodedPlan = [
  format: number,
  edgeMargin: number,
  panelGap: number,
  gridSnap: number,
  minVoltage: number,
  surfaces: EncodedSurface[],
  panels: EncodedPanel[],
];

/** An optional numeric field: absent is stored as 0, which reads back as absent. */
const opt = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

const undef = (value: number): number | undefined => (value > 0 ? value : undefined);

/**
 * The configuration a report's QR code should carry: the surfaces exactly as they are,
 * with the catalog reduced to the models actually placed in the layouts shown.
 *
 * With nothing optimized there are no placed models and the plan would restore a
 * catalog-less config, which is not worth scanning, so the selected models come along
 * instead — the geometry is the part that took work to enter either way.
 */
export function planToShare(config: Config, layouts: Layout[]): Config {
  const placed = new Set(layouts.flatMap((l) => l.placements.map((p) => p.optionId)));
  const used = config.panelOptions.filter((o) => placed.has(o.id));
  return { ...config, panelOptions: used.length > 0 ? used : config.panelOptions.filter(isPanelEnabled) };
}

function encodeSurface(s: Surface): EncodedSurface {
  return [
    s.name,
    s.width,
    s.height,
    Math.max(0, ALLOWED.indexOf(s.allowedPanels)),
    s.keepOuts.map((k): EncodedKeepOut => [k.label ?? '', k.x, k.y, k.w, k.h]),
  ];
}

function encodePanel(o: PanelOption): EncodedPanel {
  return [
    o.name,
    o.width,
    o.height,
    o.power,
    opt(o.voltage),
    opt(o.current),
    opt(o.weight),
    opt(o.price),
    (o.flexible ? FLAG_FLEXIBLE : 0) | (isPanelEnabled(o) ? 0 : FLAG_DISABLED),
  ];
}

/** Compact, deflate and base32 a configuration into the payload a QR code carries. */
export function encodePlan(config: Config): string {
  const plan: EncodedPlan = [
    FORMAT,
    config.edgeMargin,
    config.panelGap,
    config.gridSnap,
    opt(config.minVoltage),
    config.surfaces.map(encodeSurface),
    config.panelOptions.map(encodePanel),
  ];
  const json = new TextEncoder().encode(JSON.stringify(plan));
  return toBase32(deflateSync(json, { level: 9 }));
}

/** Ids are regenerated on the way in; a plan carries none, and nothing outside needs them. */
let counter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;

const isArray = Array.isArray;
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Read a payload back into a configuration, or null when it is not one: truncated,
 * mistyped, from a newer format, or simply another QR code entirely. The decoded shape is
 * handed to {@link migrateConfig}, the same validator the file import and the autosave go
 * through, so a plan can never enter the app by a laxer door than a JSON file.
 */
export function decodePlan(payload: string): Config | null {
  try {
    const bytes = fromBase32(payload.trim());
    if (!bytes || bytes.length === 0) return null;
    const plan = JSON.parse(new TextDecoder().decode(inflateSync(bytes))) as unknown;
    if (!isArray(plan) || plan[0] !== FORMAT) return null;

    const [, edgeMargin, panelGap, gridSnap, minVoltage, surfaces, panels] = plan as EncodedPlan;
    if (!isArray(surfaces) || !isArray(panels)) return null;

    return migrateConfig({
      version: 2,
      edgeMargin: num(edgeMargin),
      panelGap: num(panelGap),
      gridSnap: num(gridSnap),
      minVoltage: num(minVoltage),
      surfaces: surfaces.map((s) => {
        const [name, width, height, allowed, keepOuts] = isArray(s) ? s : ([] as never[]);
        return {
          id: newId('surface'),
          name: str(name),
          width: num(width),
          height: num(height),
          allowedPanels: ALLOWED[num(allowed)] ?? 'both',
          keepOuts: (isArray(keepOuts) ? keepOuts : []).map((k) => {
            const [label, x, y, w, h] = isArray(k) ? k : ([] as never[]);
            return { id: newId('keepout'), label: str(label), x: num(x), y: num(y), w: num(w), h: num(h) };
          }),
        };
      }),
      panelOptions: panels.map((p) => {
        const [name, width, height, power, voltage, current, weight, price, flags] = isArray(p)
          ? p
          : ([] as never[]);
        const bits = num(flags);
        return {
          id: newId('panel'),
          name: str(name),
          width: num(width),
          height: num(height),
          power: num(power),
          voltage: undef(num(voltage)),
          current: undef(num(current)),
          weight: undef(num(weight)),
          price: undef(num(price)),
          flexible: (bits & FLAG_FLEXIBLE) !== 0,
          enabled: (bits & FLAG_DISABLED) === 0,
        };
      }),
    });
  } catch {
    // Corrupt base32, a failed inflate, malformed JSON — all mean the same thing here.
    return null;
  }
}

/**
 * What identifies a panel model across two catalogs. Ids cannot: a plan carries none and
 * they are regenerated on the way in. These five fields are what makes a model the model
 * it is — what it is called, the footprint it occupies and the power it returns — and
 * they are exactly the fields a placement depends on. Price and weight are deliberately
 * out: a model whose price was corrected after the PDF was printed is still that model.
 */
const identity = (o: PanelOption): string =>
  [o.name, o.width, o.height, o.power, o.flexible === true].join('\u0000');

export type PlanImport = {
  config: Config;
  /** True when the existing catalog was kept because it already had every model. */
  keptCatalog: boolean;
};

/**
 * Reconcile a scanned plan with the catalog already loaded.
 *
 * A plan carries only the models it places, so scanning one on the machine that holds the
 * full catalog would otherwise trade 43 models for the 7 in the picture. When the current
 * catalog already contains every model the plan uses, the plan has nothing to add and the
 * catalog is kept exactly as it is — deselections included, since it is the user's
 * workbench and a scan is not a request to rearrange it. Otherwise the plan's own models
 * come in, because a plan whose panels are missing cannot be re-optimized at all.
 */
export function withExistingCatalog(incoming: Config, current: Config): PlanImport {
  const have = new Set(current.panelOptions.map(identity));
  const keptCatalog = incoming.panelOptions.every((o) => have.has(identity(o)));
  return {
    config: keptCatalog ? { ...incoming, panelOptions: current.panelOptions } : incoming,
    keptCatalog,
  };
}

/**
 * The link a QR code points at: the app's own address plus the payload in the fragment.
 *
 * The app's own, so a self-hosted or locally served copy prints codes that come back to
 * itself; the fragment rather than the query, so the plan is never sent to whatever
 * server hosts the page.
 */
export function planUrl(base: string, config: Config): string {
  const clean = base.split('#')[0].split('?')[0];
  return `${clean}#${PLAN_FRAGMENT_KEY}=${encodePlan(config)}`;
}
