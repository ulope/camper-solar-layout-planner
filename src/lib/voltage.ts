import type { PanelOption, Placement } from './types';

/**
 * Minimum series-string voltage: a filter, not a ranking criterion.
 *
 * A 24 V or 48 V system cannot use a panel whose Vmp sits below the battery voltage, so
 * such a model must not be planned as a lone panel. Wired in series its voltages add up,
 * so the *same* model is perfectly usable once enough of them are on the vehicle — which
 * is exactly the readout the results panel already shows (all panels of one model as one
 * series string). The constraint is therefore a property of a layout's composition, not
 * of the catalog: a model is admissible when the layout places at least
 * {@link seriesCountFor} of it.
 */

// Guards against 24 / 12 landing at 2.0000000000000004 and demanding a third panel.
const EPS = 1e-9;

/** A model's Vmp when it has a usable one recorded, else undefined. */
export function panelVoltage(o: PanelOption): number | undefined {
  return typeof o.voltage === 'number' && o.voltage > 0 ? o.voltage : undefined;
}

/**
 * How many of this model must be wired in series to reach `minVoltage`.
 *
 * 1 when there is no threshold, and 1 for a model with no voltage recorded: an unknown
 * Vmp is not evidence of a low one, so the model keeps its old behaviour and the picker
 * warns about the gap instead of silently dropping it from every layout.
 */
export function seriesCountFor(o: PanelOption, minVoltage: number): number {
  const v = panelVoltage(o);
  if (!(minVoltage > 0) || v === undefined) return 1;
  return Math.max(1, Math.ceil(minVoltage / v - EPS));
}

/** Models that clear the threshold on their own, so any number of them may be placed. */
export function unrestrictedPanels(options: PanelOption[], minVoltage: number): PanelOption[] {
  return options.filter((o) => seriesCountFor(o, minVoltage) === 1);
}

/** Models that need company: how many of each a layout has to place to use it at all. */
export function restrictedPanels(
  options: PanelOption[],
  minVoltage: number,
): { option: PanelOption; needed: number }[] {
  return options
    .map((option) => ({ option, needed: seriesCountFor(option, minVoltage) }))
    .filter((r) => r.needed > 1);
}

/**
 * Drop every placement whose model falls short of `minVoltage` in series — i.e. models
 * the layout places fewer of than {@link seriesCountFor} demands. Removing one model's
 * panels never changes another's count, so a single pass is exact.
 *
 * Applied to a packing result rather than to the catalog beforehand, because whether a
 * sub-threshold model is allowed depends on how many of it the packer managed to place.
 * Dropping is also what keeps the search honest: the freed area is real free space that
 * a later refill can hand to a compliant model.
 */
export function enforceMinVoltage(
  placements: Placement[],
  options: PanelOption[],
  minVoltage: number,
): Placement[] {
  const needed = new Map(restrictedPanels(options, minVoltage).map((r) => [r.option.id, r.needed]));
  if (needed.size === 0) return placements;

  const counts = new Map<string, number>();
  for (const p of placements) counts.set(p.optionId, (counts.get(p.optionId) ?? 0) + 1);
  return placements.filter((p) => (counts.get(p.optionId) ?? 0) >= (needed.get(p.optionId) ?? 1));
}

/** A layout's placements, unchanged. */
const identity = (placements: Placement[]) => placements;

/**
 * The enforcement step to run after every packing pass. Returns {@link identity} when the
 * threshold restricts nothing in this catalog, so an unconstrained search behaves — and
 * costs — exactly as it did before the filter existed.
 */
export function minVoltageFilter(
  options: PanelOption[],
  minVoltage = 0,
): (placements: Placement[]) => Placement[] {
  if (restrictedPanels(options, minVoltage).length === 0) return identity;
  return (placements) => enforceMinVoltage(placements, options, minVoltage);
}

/** Whether a layout's composition already satisfies the threshold. */
export function satisfiesMinVoltage(
  placements: Placement[],
  options: PanelOption[],
  minVoltage: number,
): boolean {
  return enforceMinVoltage(placements, options, minVoltage).length === placements.length;
}
