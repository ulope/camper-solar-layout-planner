/**
 * Restoring a plan from the link a report's QR code carries.
 *
 * The payload rides in the URL *fragment*, so it never reaches whatever server hosts the
 * page — a scanned plan travels from the paper to the browser and no further.
 *
 * A scan replaces what the app currently holds, which is destructive, so it asks first
 * and says what it is about to do. The fragment is dropped either way: a plan that has
 * been offered once should not be offered again on every reload.
 */

import { get } from 'svelte/store';
import { config, clearLayouts, setConfig } from '../stores';
import { msg } from '../i18n';
import { decodePlan, withExistingCatalog } from './plan';
import { planFromFragment } from './fragment';

/** Take the plan out of the address bar without navigating or adding a history entry. */
function dropFragment(): void {
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    // Some embeddings disallow replaceState; leaving the fragment is harmless.
  }
}

/**
 * Look for a scanned plan in the URL and, with the user's say-so, make it the current
 * configuration. Called once at startup; a no-op when the URL carries no plan.
 */
export function restorePlanFromUrl(): boolean {
  const payload = planFromFragment(location.hash);
  if (!payload) return false;
  dropFragment();

  const incoming = decodePlan(payload);
  if (!incoming) {
    alert(msg('restore.invalid'));
    return false;
  }

  const { config: next, keptCatalog } = withExistingCatalog(incoming, get(config));
  const summary = msg('restore.confirm', {
    surfaces: msg('results.surfaceCount', { count: next.surfaces.length }),
    models: msg('restore.modelCount', { count: next.panelOptions.length }),
  });
  const catalog = msg(keptCatalog ? 'restore.keptCatalog' : 'restore.replacedCatalog');
  if (!confirm(`${summary}\n\n${catalog}`)) return false;

  setConfig(next);
  clearLayouts();
  return true;
}
