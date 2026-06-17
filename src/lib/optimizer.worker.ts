/// <reference lib="webworker" />
import type { Config } from './types';
import { optimizeThorough } from './optimizeThorough';

declare const self: DedicatedWorkerGlobalScope;

type RunMsg = { type: 'run'; config: Config; budgetMs: number; seed: number };
type CancelMsg = { type: 'cancel' };
type InMsg = RunMsg | CancelMsg;

let cancelled = false;

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    cancelled = true;
    return;
  }
  if (msg.type === 'run') {
    cancelled = false;
    const layouts = optimizeThorough(msg.config, {
      budgetMs: msg.budgetMs,
      seed: msg.seed,
      maxResults: 5,
      onProgress: (p) => self.postMessage({ type: 'progress', ...p }),
      shouldStop: () => cancelled,
    });
    self.postMessage({ type: 'done', layouts });
  }
};
