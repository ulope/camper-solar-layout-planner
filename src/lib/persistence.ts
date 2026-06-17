import type { Config } from './types';

const STORAGE_KEY = 'camper-solar-layout:config:v1';

/** A sensible starting configuration with one example panel model. */
export function defaultConfig(): Config {
  return {
    roof: { width: 300, height: 180 },
    edgeMargin: 3,
    panelGap: 2,
    gridSnap: 1,
    keepOuts: [{ id: 'hatch-1', label: 'Roof hatch', x: 120, y: 60, w: 50, h: 50 }],
    panelOptions: [
      { id: 'panel-1', name: '100 W mono', width: 100, height: 50, power: 100 },
      { id: 'panel-2', name: '175 W mono', width: 148, height: 67, power: 175 },
    ],
  };
}

/** Best-effort validation so a corrupt or stale payload falls back to defaults. */
function isValidConfig(value: unknown): value is Config {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  const roof = c.roof as Record<string, unknown> | undefined;
  return (
    !!roof &&
    typeof roof.width === 'number' &&
    typeof roof.height === 'number' &&
    typeof c.edgeMargin === 'number' &&
    typeof c.panelGap === 'number' &&
    Array.isArray(c.keepOuts) &&
    Array.isArray(c.panelOptions)
  );
}

export function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const parsed = JSON.parse(raw);
    // Default fields that may be absent from older saved payloads.
    return isValidConfig(parsed) ? { gridSnap: 1, ...parsed } : defaultConfig();
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(config: Config): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore quota / private-mode errors; persistence is best-effort.
  }
}

/** Serialize a config for manual JSON export. */
export function exportConfig(config: Config): string {
  return JSON.stringify(config, null, 2);
}

/** Parse an imported JSON string, returning null when invalid. */
export function importConfig(text: string): Config | null {
  try {
    const parsed = JSON.parse(text);
    return isValidConfig(parsed) ? { gridSnap: 1, ...parsed } : null;
  } catch {
    return null;
  }
}
