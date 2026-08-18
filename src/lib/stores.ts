import { writable, derived, get } from 'svelte/store';
import type { Config, Layout, KeepOut, PanelOption, Surface, SurfaceResults } from './types';
import { loadConfig, saveConfig } from './persistence';
import { optimizeFastAll, optimizeThoroughAll } from './optimizeAll';
import { ALL_CRITERIA, DEFAULT_RANK, type RankOptions, type SecondaryCriterion } from './ranking';
import { isPanelEnabled } from './panels';

/** How hard the optimizer searches. 'fast' is the instant sweep; 'thorough' runs ~5s. */
export type OptimizerEffort = 'fast' | 'thorough';
const EFFORT_KEY = 'camper-solar-layout:effort:v1';
const RANK_KEY = 'camper-solar-layout:rank:v1';
const THOROUGH_BUDGET_MS = 5000;
const THOROUGH_SEED = 0x5ca1ab1e;

function loadEffort(): OptimizerEffort {
  try {
    return localStorage.getItem(EFFORT_KEY) === 'thorough' ? 'thorough' : 'fast';
  } catch {
    return 'fast';
  }
}

function loadRankOptions(): RankOptions {
  try {
    const raw = localStorage.getItem(RANK_KEY);
    if (!raw) return DEFAULT_RANK;
    const parsed = JSON.parse(raw) as Partial<RankOptions>;
    const criteria = Array.isArray(parsed.criteria)
      ? parsed.criteria.filter((c): c is SecondaryCriterion => ALL_CRITERIA.includes(c))
      : [];
    const tolerance =
      typeof parsed.tolerance === 'number' && parsed.tolerance >= 0 && parsed.tolerance <= 1
        ? parsed.tolerance
        : DEFAULT_RANK.tolerance;
    return { criteria: [...new Set(criteria)], tolerance };
  } catch {
    return DEFAULT_RANK;
  }
}

const initialConfig = loadConfig();

/** The single source of truth for the planner, hydrated from localStorage. */
export const config = writable<Config>(initialConfig);

/**
 * The surface the sidebar forms edit and new keep-outs belong to. Every surface is drawn
 * and optimized at once; this only decides what the forms act on.
 */
export const activeSurfaceId = writable<string>(initialConfig.surfaces[0].id);

/** Distinct optimization results per surface, best first (empty until Optimize is run). */
export const layoutsBySurface = writable<SurfaceResults>({});

/** Index of the alternative currently shown, per surface. Surfaces are chosen freely. */
export const selectedBySurface = writable<Record<string, number>>({});

/** The layout displayed for each surface, or null where none has been computed. */
export const selectedLayouts = derived(
  [config, layoutsBySurface, selectedBySurface],
  ([$config, $results, $selected]) => {
    const out: Record<string, Layout | null> = {};
    for (const s of $config.surfaces) {
      out[s.id] = $results[s.id]?.[$selected[s.id] ?? 0] ?? null;
    }
    return out;
  },
);

/** The surface the forms currently edit; falls back to the first one. */
export const activeSurface = derived(
  [config, activeSurfaceId],
  ([$config, $id]) => $config.surfaces.find((s) => s.id === $id) ?? $config.surfaces[0],
);

/** Whether the current config has changed since the layouts were computed. */
export const layoutStale = writable<boolean>(true);

/** Currently selected keep-out id (for highlighting/editing), or null. */
export const selectedKeepOut = writable<string | null>(null);

/** Selected optimizer effort, persisted separately from the layout config. */
export const optimizerEffort = writable<OptimizerEffort>(loadEffort());
optimizerEffort.subscribe((e) => {
  try {
    localStorage.setItem(EFFORT_KEY, e);
  } catch {
    // best-effort
  }
});

/**
 * Optional secondary ranking criteria + tolerance band, persisted separately from the
 * layout config. Changing them marks the layouts stale so the Optimize button pulses.
 */
export const rankOptions = writable<RankOptions>(loadRankOptions());
rankOptions.subscribe((r) => {
  layoutStale.set(true);
  try {
    localStorage.setItem(RANK_KEY, JSON.stringify(r));
  } catch {
    // best-effort
  }
});

/**
 * How many panel models are missing each optional field, so the criteria picker can warn
 * that a selected criterion is counting missing values as 0. Only selected models count —
 * a deselected one is never placed, so its gaps cannot skew a ranking.
 */
export const panelDataGaps = derived(config, ($c) => {
  const active = $c.panelOptions.filter(isPanelEnabled);
  return {
    total: active.length,
    weight: active.filter((p) => !(typeof p.weight === 'number' && p.weight > 0)).length,
    price: active.filter((p) => !(typeof p.price === 'number' && p.price > 0)).length,
  };
});

/** True while a thorough (worker) optimization is running. */
export const optimizing = writable<boolean>(false);

/** Live progress from a running thorough optimization, across all surfaces. */
export const optimizeProgress = writable<{
  bestPower: number; // combined over every surface
  elapsedMs: number;
  surfaceIndex: number;
  surfaceCount: number;
  surfaceName: string;
}>({ bestPower: 0, elapsedMs: 0, surfaceIndex: 0, surfaceCount: 1, surfaceName: '' });

// Autosave: debounce writes back to localStorage on every config change.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
config.subscribe((c) => {
  layoutStale.set(true);
  // Keep the active surface pointing at one that still exists (import, reset, removal).
  if (!c.surfaces.some((s) => s.id === get(activeSurfaceId))) {
    activeSurfaceId.set(c.surfaces[0].id);
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveConfig(c), 250);
});

function applyResults(results: SurfaceResults): void {
  layoutsBySurface.set(results);
  selectedBySurface.set(Object.fromEntries(Object.keys(results).map((id) => [id, 0])));
  layoutStale.set(false);
}

/** Show a different alternative for one surface, leaving the others as they are. */
export function selectSurfaceLayout(surfaceId: string, index: number): void {
  selectedBySurface.update((m) => ({ ...m, [surfaceId]: index }));
}

let worker: Worker | null = null;
// Best layouts streamed so far from the worker, kept so Cancel can apply them.
let streamedResults: SurfaceResults | null = null;

function disposeWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

/** Run the optimizer against the current config and store the results. */
export function runOptimize(): void {
  if (get(optimizerEffort) === 'fast') {
    disposeWorker();
    optimizing.set(false);
    applyResults(optimizeFastAll(get(config), 5, get(rankOptions)));
    return;
  }
  runThorough();
}

/** Run the thorough optimizer in a Web Worker, streaming progress; falls back to sync. */
function runThorough(): void {
  disposeWorker();
  const cfg = get(config);
  const rank = get(rankOptions);
  streamedResults = null;
  optimizeProgress.set({
    bestPower: 0,
    elapsedMs: 0,
    surfaceIndex: 0,
    surfaceCount: cfg.surfaces.length,
    surfaceName: cfg.surfaces[0].name,
  });
  optimizing.set(true);

  try {
    worker = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }

  if (!worker) {
    // No worker support: run synchronously (blocks, but still produces a result).
    applyResults(
      optimizeThoroughAll(cfg, { budgetMs: THOROUGH_BUDGET_MS, seed: THOROUGH_SEED, rank }),
    );
    optimizing.set(false);
    return;
  }

  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    if (msg.type === 'progress') {
      optimizeProgress.set({
        bestPower: msg.bestPower,
        elapsedMs: msg.elapsedMs,
        surfaceIndex: msg.surfaceIndex,
        surfaceCount: msg.surfaceCount,
        surfaceName: cfg.surfaces.find((s) => s.id === msg.surfaceId)?.name ?? '',
      });
      streamedResults = msg.resultsBySurface as SurfaceResults;
    } else if (msg.type === 'done') {
      applyResults(msg.resultsBySurface as SurfaceResults);
      optimizing.set(false);
      disposeWorker();
    }
  };
  worker.postMessage({
    type: 'run',
    config: cfg,
    budgetMs: THOROUGH_BUDGET_MS,
    seed: THOROUGH_SEED,
    rank,
  });
}

/**
 * Stop a running thorough optimization and keep the best result found so far.
 * The worker runs a synchronous loop and cannot receive a message mid-run, so we
 * terminate it and apply the most recently streamed layouts.
 */
export function cancelOptimize(): void {
  if (!worker) return;
  disposeWorker();
  if (streamedResults) applyResults(streamedResults);
  optimizing.set(false);
}

/** Clear any computed results (e.g. after import/reset). */
export function clearLayouts(): void {
  layoutsBySurface.set({});
  selectedBySurface.set({});
}

let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

// ----- Mutation helpers (keep components thin) -----

/** Append a panel model and return its new id. */
export function addPanelOption(init: Omit<PanelOption, 'id'>): string {
  const id = makeId('panel');
  config.update((c) => ({ ...c, panelOptions: [...c.panelOptions, { ...init, id }] }));
  return id;
}

export function updatePanelOption(id: string, patch: Partial<PanelOption>): void {
  config.update((c) => ({
    ...c,
    panelOptions: c.panelOptions.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }));
}

/** Include or exclude a model from optimization without deleting it. */
export function setPanelEnabled(id: string, enabled: boolean): void {
  updatePanelOption(id, { enabled });
}

export function removePanelOption(id: string): void {
  config.update((c) => ({ ...c, panelOptions: c.panelOptions.filter((p) => p.id !== id) }));
}

// ----- Surfaces -----

/** Append a surface and make it the active one; returns its new id. */
export function addSurface(): string {
  const id = makeId('surface');
  config.update((c) => ({
    ...c,
    surfaces: [
      ...c.surfaces,
      {
        id,
        name: `Surface ${c.surfaces.length + 1}`,
        width: 200,
        height: 100,
        keepOuts: [],
        allowedPanels: 'both',
      },
    ],
  }));
  activeSurfaceId.set(id);
  return id;
}

export function updateSurface(
  id: string,
  patch: Partial<Pick<Surface, 'name' | 'width' | 'height' | 'allowedPanels'>>,
): void {
  config.update((c) => ({
    ...c,
    surfaces: c.surfaces.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  }));
}

/**
 * Remove a surface, along with any results computed for it. The last surface is never
 * removed — the planner always has something to draw on.
 */
export function removeSurface(id: string): void {
  const current = get(config);
  if (current.surfaces.length <= 1) return;
  config.update((c) => ({ ...c, surfaces: c.surfaces.filter((s) => s.id !== id) }));
  const drop = <T,>(m: Record<string, T>) =>
    Object.fromEntries(Object.entries(m).filter(([key]) => key !== id));
  layoutsBySurface.update(drop);
  selectedBySurface.update(drop);
}

// ----- Keep-outs -----
// Keyed by keep-out id rather than by (surface, keep-out): ids are unique across the
// whole config, so callers that already hold one never need to know which surface owns it.

/** Add a keep-out to a surface, defaulting to the active one. */
export function addKeepOut(
  rect: { x: number; y: number; w: number; h: number },
  surfaceId: string = get(activeSurfaceId),
): string {
  const id = makeId('keepout');
  config.update((c) => ({
    ...c,
    surfaces: c.surfaces.map((s) =>
      s.id === surfaceId ? { ...s, keepOuts: [...s.keepOuts, { id, label: 'Keep-out', ...rect }] } : s,
    ),
  }));
  return id;
}

export function updateKeepOut(id: string, patch: Partial<KeepOut>): void {
  config.update((c) => ({
    ...c,
    surfaces: c.surfaces.map((s) =>
      s.keepOuts.some((k) => k.id === id)
        ? { ...s, keepOuts: s.keepOuts.map((k) => (k.id === id ? { ...k, ...patch } : k)) }
        : s,
    ),
  }));
}

export function removeKeepOut(id: string): void {
  config.update((c) => ({
    ...c,
    surfaces: c.surfaces.map((s) =>
      s.keepOuts.some((k) => k.id === id)
        ? { ...s, keepOuts: s.keepOuts.filter((k) => k.id !== id) }
        : s,
    ),
  }));
}

export function setConfig(next: Config): void {
  config.set(next);
}
