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

/**
 * Charge-end voltage of a nominal system voltage, in V: 3.65 V per LiFePO4 cell over 8 or
 * 16 cells. A "24 V" system charges nowhere near 24 V, and the other common chemistries
 * land in the same place — a 7S/14S Li-ion NMC pack tops out at 29.4 / 58.8 V and AGM
 * absorption sits at 28.8 / 57.6 V — so one figure per system voltage covers them all.
 */
const CHARGE_END: Record<number, number> = { 24: 29.2, 48: 58.4 };

/**
 * The panel voltage a system is planned against: 95% of its charge-end voltage, plus 1 V.
 *
 * Deliberately below both the charge-end voltage and the ~5 V an MPPT wants to start:
 * a string that drops out over the last few percent of a charge costs almost nothing,
 * because the battery is nearly full by the time it does, whereas sizing for the full
 * charge-end plus start-up margin would rule out panels that carry all but the last
 * minutes of the charge. Voltage also falls with cell temperature, which the catalog does
 * not record — the same reason to leave headroom rather than demand it.
 */
const cutoffFor = (chargeEnd: number) => Math.round((0.95 * chargeEnd + 1) * 10) / 10;

export type SystemVoltagePreset = {
  system: number; // nominal system voltage, as the battery bank is spoken about
  chargeEnd: number; // V the bank actually charges to
  minVoltage: number; // V a string must reach to be planned for it
};

/** The one-click system voltages, in the order the picker shows them. */
export const SYSTEM_VOLTAGE_PRESETS: SystemVoltagePreset[] = [24, 48].map((system) => ({
  system,
  chargeEnd: CHARGE_END[system],
  minVoltage: cutoffFor(CHARGE_END[system]),
}));

/** The preset a threshold came from, when it matches one exactly. */
export function presetFor(minVoltage: number): SystemVoltagePreset | undefined {
  return SYSTEM_VOLTAGE_PRESETS.find((p) => p.minVoltage === minVoltage);
}

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
