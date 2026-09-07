import { msg } from './i18n';
import { summarize, taskFor, usableArea } from './optimize';
import type {
  AllowedPanels,
  Config,
  KeepOut,
  Layout,
  PanelOption,
  Placement,
  Surface,
} from './types';

const STORAGE_KEY = 'camper-solar-layout:config:v1';

/**
 * Payload schema version. Version 1 had a single `roof` surface with a flat `keepOuts`
 * list; version 2 replaced both with `surfaces`. The storage *key* deliberately stays at
 * `:v1` — a v1 payload has to be read and migrated anyway, so a second key would only add
 * dual-key bookkeeping, and exported files carry no key at all and need the in-payload
 * discriminator regardless.
 */
const CONFIG_VERSION = 2;

/**
 * A sensible starting configuration with one surface and two example panel models.
 *
 * The example names are translated at the moment they are created and then stored like
 * any other user-entered name, so a config keeps the wording it was made with rather
 * than silently renaming a saved plan on a language switch.
 */
export function defaultConfig(): Config {
  return {
    surfaces: [
      {
        id: 'surface-roof',
        name: msg('defaults.roof'),
        width: 300,
        height: 180,
        keepOuts: [{ id: 'hatch-1', label: msg('defaults.roofHatch'), x: 120, y: 60, w: 50, h: 50 }],
        allowedPanels: 'both',
      },
    ],
    edgeMargin: 3,
    panelGap: 2,
    gridSnap: 1,
    minVoltage: 0,
    panelOptions: [
      { id: 'panel-1', name: msg('defaults.panel100'), width: 100, height: 50, power: 100, weight: 5.5, price: 89 },
      { id: 'panel-2', name: msg('defaults.panel175'), width: 148, height: 67, power: 175, weight: 9.5, price: 159 },
    ],
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Anything unrecognized means "no restriction", which is how surfaces behaved before. */
const toAllowedPanels = (v: unknown): AllowedPanels =>
  v === 'rigid' || v === 'flexible' ? v : 'both';

/** Shared fields of both payload versions, or null when they don't check out. */
function commonFields(c: Record<string, unknown>) {
  if (!isNum(c.edgeMargin) || !isNum(c.panelGap) || !Array.isArray(c.panelOptions)) return null;
  return {
    edgeMargin: c.edgeMargin,
    panelGap: c.panelGap,
    // Absent in the earliest payloads, which predate the snap setting.
    gridSnap: isNum(c.gridSnap) ? c.gridSnap : 1,
    // Absent before the voltage filter existed, and 0 is how "no restriction" is stored,
    // so a missing or nonsensical value normalizes to the unrestricted behaviour.
    minVoltage: isNum(c.minVoltage) && c.minVoltage > 0 ? c.minVoltage : 0,
    panelOptions: c.panelOptions as Config['panelOptions'],
  };
}

function toSurface(value: unknown, index: number): Surface | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Record<string, unknown>;
  if (typeof s.id !== 'string' || !isNum(s.width) || !isNum(s.height)) return null;
  if (!Array.isArray(s.keepOuts)) return null;
  return {
    id: s.id,
    name:
      typeof s.name === 'string' && s.name !== ''
        ? s.name
        : msg('defaults.surface', { index: index + 1 }),
    width: s.width,
    height: s.height,
    keepOuts: s.keepOuts as KeepOut[],
    allowedPanels: toAllowedPanels(s.allowedPanels),
  };
}

/**
 * Normalize a parsed payload of either version into a current `Config`, or null when it
 * is corrupt or unrecognizable. Idempotent, so a freshly saved v2 payload round-trips
 * through it unchanged on every load.
 *
 * This is the single choke point for both localStorage and file import, so a v1 export
 * saved before multiple surfaces existed still loads losslessly: its roof becomes the
 * first surface and keeps its keep-outs.
 */
export function migrateConfig(value: unknown): Config | null {
  if (typeof value !== 'object' || value === null) return null;
  const c = value as Record<string, unknown>;
  const common = commonFields(c);
  if (!common) return null;

  // v2: already surface-based.
  if (Array.isArray(c.surfaces)) {
    const surfaces = c.surfaces.map(toSurface);
    if (surfaces.length === 0 || surfaces.some((s) => s === null)) return null;
    return { surfaces: surfaces as Surface[], ...common };
  }

  // v1: a single `roof` plus a flat keep-out list belonging to it.
  const roof = c.roof as Record<string, unknown> | undefined;
  if (roof && isNum(roof.width) && isNum(roof.height) && Array.isArray(c.keepOuts)) {
    return {
      surfaces: [
        {
          id: 'surface-roof',
          name: msg('defaults.roof'),
          width: roof.width,
          height: roof.height,
          keepOuts: c.keepOuts as KeepOut[],
          allowedPanels: 'both',
        },
      ],
      ...common,
    };
  }

  return null;
}

export function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    return migrateConfig(JSON.parse(raw)) ?? defaultConfig();
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(config: Config): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: CONFIG_VERSION, ...config }));
  } catch {
    // Ignore quota / private-mode errors; persistence is best-effort.
  }
}

/**
 * Serialize a config for manual JSON export, together with the layout shown for each
 * surface when one has been computed.
 *
 * The layouts are what an optimizer run took seconds to find and what every figure on
 * screen is about, and a thorough run searches randomly, so a re-run of an imported file
 * need not come back with the same plan. They travel under a key of their own rather than
 * inside the surfaces, so a reader that predates them — this app's own `migrateConfig`
 * included — still sees exactly the configuration it always did.
 */
export function exportConfig(config: Config, layouts: Record<string, Layout | null> = {}): string {
  const shown = config.surfaces.flatMap((s) => {
    const layout = layouts[s.id];
    return layout ? [[s.id, layout] as const] : [];
  });
  return JSON.stringify(
    {
      version: CONFIG_VERSION,
      ...config,
      ...(shown.length > 0 ? { layouts: Object.fromEntries(shown) } : {}),
    },
    null,
    2,
  );
}

/**
 * One placement, or null when it is not one. A placement naming a model the catalog does
 * not have is rejected rather than skipped: the layout around it would still be drawn,
 * one panel short and with totals to match, and a plan quietly missing a panel is worse
 * than one that is missing altogether.
 */
function toPlacement(value: unknown, byId: Map<string, PanelOption>): Placement | null {
  if (typeof value !== 'object' || value === null) return null;
  const p = value as Record<string, unknown>;
  if (typeof p.optionId !== 'string') return null;
  const option = byId.get(p.optionId);
  if (!option) return null;
  if (!isNum(p.x) || !isNum(p.y) || !isNum(p.w) || !isNum(p.h)) return null;
  return {
    optionId: p.optionId,
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    rotated: p.rotated === true,
    // A placement's power is its model's power by definition, so take it from the
    // catalog the file carries rather than trusting a second copy of the same number.
    power: option.power,
  };
}

function toLayout(
  value: unknown,
  surface: Surface,
  config: Config,
  byId: Map<string, PanelOption>,
): Layout | null {
  if (typeof value !== 'object' || value === null) return null;
  const { placements } = value as Record<string, unknown>;
  if (!Array.isArray(placements)) return null;
  const parsed = placements.map((p) => toPlacement(p, byId));
  if (parsed.some((p) => p === null)) return null;
  return summarize(parsed as Placement[], usableArea(taskFor(config, surface)));
}

/**
 * The layouts of a payload, keyed by surface id and limited to surfaces the config
 * actually has — an entry left behind by a surface that was since removed is simply
 * never read, exactly as in a live optimizer result.
 *
 * Every total is recomputed from the placements and the config it just validated rather
 * than read from the file, so a hand-edited payload cannot make the summary disagree with
 * the picture, and a coverage figure is always against the margins the file really sets.
 */
export function migrateLayouts(value: unknown, config: Config): Record<string, Layout> {
  if (typeof value !== 'object' || value === null) return {};
  const source = value as Record<string, unknown>;
  const byId = new Map(config.panelOptions.map((o) => [o.id, o]));
  const out: Record<string, Layout> = {};
  for (const surface of config.surfaces) {
    const layout = toLayout(source[surface.id], surface, config, byId);
    if (layout) out[surface.id] = layout;
  }
  return out;
}

/**
 * A config as read from a file, plus whatever layouts came with it: at most one per
 * surface, and none at all for a file written before anything was optimized, exported by
 * an older version, or carrying layouts that do not check out.
 */
export type ImportedPlan = { config: Config; layouts: Record<string, Layout> };

/** Parse an imported JSON string, returning null when invalid. */
export function importConfig(text: string): ImportedPlan | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    const config = migrateConfig(parsed);
    if (!config) return null;
    const { layouts } = parsed as Record<string, unknown>;
    return { config, layouts: migrateLayouts(layouts, config) };
  } catch {
    return null;
  }
}
