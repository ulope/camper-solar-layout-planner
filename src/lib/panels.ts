import type { AllowedPanels, PanelOption } from './types';

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

/**
 * A model is rigid unless explicitly flagged flexible, so catalogs saved before the flag
 * existed keep the framed-panel behaviour they were planned with.
 */
export function isPanelFlexible(o: PanelOption): boolean {
  return o.flexible === true;
}

/**
 * The models a surface will carry. Independent of {@link isPanelEnabled}: the enable flag
 * is the user's global "consider this model at all", this is what one surface can mount.
 */
export function panelsAllowedOn(options: PanelOption[], allows: AllowedPanels): PanelOption[] {
  if (allows === 'both') return options;
  return options.filter((o) => isPanelFlexible(o) === (allows === 'flexible'));
}
