import { writable, derived, get } from 'svelte/store';
import type { Config, Layout, KeepOut, PanelOption } from './types';
import { loadConfig, saveConfig } from './persistence';
import { optimizeVariants } from './optimize';
import { optimizeThorough } from './optimizeThorough';

/** How hard the optimizer searches. 'fast' is the instant sweep; 'thorough' runs ~5s. */
export type OptimizerEffort = 'fast' | 'thorough';
const EFFORT_KEY = 'camper-solar-layout:effort:v1';
const THOROUGH_BUDGET_MS = 5000;
const THOROUGH_SEED = 0x5ca1ab1e;

function loadEffort(): OptimizerEffort {
  try {
    return localStorage.getItem(EFFORT_KEY) === 'thorough' ? 'thorough' : 'fast';
  } catch {
    return 'fast';
  }
}

/** The single source of truth for the planner, hydrated from localStorage. */
export const config = writable<Config>(loadConfig());

/** Distinct optimization results, best first (empty until Optimize is run). */
export const layouts = writable<Layout[]>([]);

/** Index of the result currently shown on the canvas. */
export const selectedLayout = writable<number>(0);

/** The layout currently displayed, or null when none has been computed. */
export const layout = derived(
  [layouts, selectedLayout],
  ([$layouts, $i]) => $layouts[$i] ?? null,
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

/** True while a thorough (worker) optimization is running. */
export const optimizing = writable<boolean>(false);

/** Live progress from a running thorough optimization. */
export const optimizeProgress = writable<{ bestPower: number; elapsedMs: number }>({
  bestPower: 0,
  elapsedMs: 0,
});

// Autosave: debounce writes back to localStorage on every config change.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
config.subscribe((c) => {
  layoutStale.set(true);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveConfig(c), 250);
});

function applyResults(results: Layout[]): void {
  layouts.set(results);
  selectedLayout.set(0);
  layoutStale.set(false);
}

let worker: Worker | null = null;
// Best layouts streamed so far from the worker, kept so Cancel can apply them.
let streamedLayouts: Layout[] = [];

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
    applyResults(optimizeVariants(get(config)));
    return;
  }
  runThorough();
}

/** Run the thorough optimizer in a Web Worker, streaming progress; falls back to sync. */
function runThorough(): void {
  disposeWorker();
  const cfg = get(config);
  streamedLayouts = [];
  optimizeProgress.set({ bestPower: 0, elapsedMs: 0 });
  optimizing.set(true);

  try {
    worker = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }

  if (!worker) {
    // No worker support: run synchronously (blocks, but still produces a result).
    applyResults(optimizeThorough(cfg, { budgetMs: THOROUGH_BUDGET_MS, seed: THOROUGH_SEED }));
    optimizing.set(false);
    return;
  }

  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    if (msg.type === 'progress') {
      optimizeProgress.set({ bestPower: msg.bestPower, elapsedMs: msg.elapsedMs });
      if (msg.layouts?.length) streamedLayouts = msg.layouts as Layout[];
    } else if (msg.type === 'done') {
      applyResults(msg.layouts as Layout[]);
      optimizing.set(false);
      disposeWorker();
    }
  };
  worker.postMessage({ type: 'run', config: cfg, budgetMs: THOROUGH_BUDGET_MS, seed: THOROUGH_SEED });
}

/**
 * Stop a running thorough optimization and keep the best result found so far.
 * The worker runs a synchronous loop and cannot receive a message mid-run, so we
 * terminate it and apply the most recently streamed layouts.
 */
export function cancelOptimize(): void {
  if (!worker) return;
  disposeWorker();
  if (streamedLayouts.length) applyResults(streamedLayouts);
  optimizing.set(false);
}

/** Clear any computed results (e.g. after import/reset). */
export function clearLayouts(): void {
  layouts.set([]);
  selectedLayout.set(0);
}

/** Total roof area for coverage display. */
export const roofArea = derived(config, ($c) => $c.roof.width * $c.roof.height);

let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

// ----- Mutation helpers (keep components thin) -----

export function addPanelOption(): void {
  config.update((c) => ({
    ...c,
    panelOptions: [
      ...c.panelOptions,
      { id: makeId('panel'), name: 'New panel', width: 100, height: 50, power: 100 },
    ],
  }));
}

export function updatePanelOption(id: string, patch: Partial<PanelOption>): void {
  config.update((c) => ({
    ...c,
    panelOptions: c.panelOptions.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }));
}

export function removePanelOption(id: string): void {
  config.update((c) => ({ ...c, panelOptions: c.panelOptions.filter((p) => p.id !== id) }));
}

export function addKeepOut(rect: { x: number; y: number; w: number; h: number }): string {
  const id = makeId('keepout');
  config.update((c) => ({
    ...c,
    keepOuts: [...c.keepOuts, { id, label: 'Keep-out', ...rect }],
  }));
  return id;
}

export function updateKeepOut(id: string, patch: Partial<KeepOut>): void {
  config.update((c) => ({
    ...c,
    keepOuts: c.keepOuts.map((k) => (k.id === id ? { ...k, ...patch } : k)),
  }));
}

export function removeKeepOut(id: string): void {
  config.update((c) => ({ ...c, keepOuts: c.keepOuts.filter((k) => k.id !== id) }));
}

export function updateRoof(patch: Partial<Config['roof']>): void {
  config.update((c) => ({ ...c, roof: { ...c.roof, ...patch } }));
}

export function setConfig(next: Config): void {
  config.set(next);
}
