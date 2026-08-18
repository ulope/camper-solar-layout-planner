import type { AllowedPanels, Config, KeepOut, Surface } from './types';

const STORAGE_KEY = 'camper-solar-layout:config:v1';

/**
 * Payload schema version. Version 1 had a single `roof` surface with a flat `keepOuts`
 * list; version 2 replaced both with `surfaces`. The storage *key* deliberately stays at
 * `:v1` — a v1 payload has to be read and migrated anyway, so a second key would only add
 * dual-key bookkeeping, and exported files carry no key at all and need the in-payload
 * discriminator regardless.
 */
const CONFIG_VERSION = 2;

/** A sensible starting configuration with one surface and one example panel model. */
export function defaultConfig(): Config {
  return {
    surfaces: [
      {
        id: 'surface-roof',
        name: 'Roof',
        width: 300,
        height: 180,
        keepOuts: [{ id: 'hatch-1', label: 'Roof hatch', x: 120, y: 60, w: 50, h: 50 }],
        allowedPanels: 'both',
      },
    ],
    edgeMargin: 3,
    panelGap: 2,
    gridSnap: 1,
    panelOptions: [
      { id: 'panel-1', name: '100 W mono', width: 100, height: 50, power: 100, weight: 5.5, price: 89 },
      { id: 'panel-2', name: '175 W mono', width: 148, height: 67, power: 175, weight: 9.5, price: 159 },
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
    name: typeof s.name === 'string' && s.name !== '' ? s.name : `Surface ${index + 1}`,
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
          name: 'Roof',
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

/** Serialize a config for manual JSON export. */
export function exportConfig(config: Config): string {
  return JSON.stringify({ version: CONFIG_VERSION, ...config }, null, 2);
}

/** Parse an imported JSON string, returning null when invalid. */
export function importConfig(text: string): Config | null {
  try {
    return migrateConfig(JSON.parse(text));
  } catch {
    return null;
  }
}
