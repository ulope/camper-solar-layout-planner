import type { PanelOption } from './types';

/**
 * A model counts as selected unless it was explicitly deselected, so configs saved
 * before the flag existed (and freshly added models) stay in the running.
 */
export function isPanelEnabled(o: PanelOption): boolean {
  return o.enabled !== false;
}

/** The models an optimizer may place: selected, with real dimensions and power. */
export function packablePanels(options: PanelOption[]): PanelOption[] {
  return options.filter((o) => isPanelEnabled(o) && o.width > 0 && o.height > 0 && o.power > 0);
}
