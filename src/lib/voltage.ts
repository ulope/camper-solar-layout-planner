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
 * {@link seriesCountFor} of it, in a count that can actually be wired onto chargers
 * (see {@link distributable}).
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

/** Whether `n` is prime. Only ever asked about panel counts, so trial division is ample. */
export function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
  return true;
}

/**
 * Whether `count` panels of a *restricted* model can be split across chargers.
 *
 * Such a model is only usable in series strings, and strings wired in parallel onto one
 * MPPT have to be the same length — so a count splits into `k` strings of `count / k`
 * only where `k` divides `count`. A prime count has no divisor but 1 and itself, which
 * leaves a single string of everything: one tracker carrying the whole model's power at
 * the full stacked voltage, with no way to spread it over the chargers actually on board.
 *
 * Counts up to 3 are exempt: they are the minimal strings the threshold itself asks for,
 * and one small string on one tracker is how such an array is wired anyway. From 5 up, a
 * prime count is rejected and the layout gives a panel back (see {@link admissibleCount});
 * that panel's area is then free for a model that can use it.
 */
export function distributable(count: number): boolean {
  return count <= 3 || !isPrime(count);
}

/**
 * How many of a restricted model a layout may keep, having placed `count` of them and
 * needing `needed` per string: the largest admissible count at or below `count`, or 0
 * when there is none (fewer placed than one string needs, or `needed` itself is a prime
 * above 3 and the surface holds exactly that many).
 *
 * The search never has to give back more than a single panel in practice — every prime
 * above 3 is odd, so `count - 1` is an even number ≥ 4 and therefore composite — but the
 * walk downwards is what makes that a consequence rather than an assumption.
 */
export function admissibleCount(count: number, needed: number): number {
  for (let n = count; n >= needed; n--) if (distributable(n)) return n;
  return 0;
}

/**
 * Cut every restricted model back to a count that can actually be wired: at least
 * {@link seriesCountFor} panels, in a number that splits across chargers
 * ({@link distributable}). A model short of one whole string loses all its panels; one
 * placed at a prime count above 3 gives a single panel back. Removing one model's panels
 * never changes another's count, so a single pass is exact.
 *
 * The panels kept are the first the packer placed. Every panel of a model is worth the
 * same Wp, so which one goes costs nothing either way, and dropping from the tail hands
 * back the most marginal position rather than one the packing was built around.
 *
 * Applied to a packing result rather than to the catalog beforehand, because whether a
 * sub-threshold model is allowed — and how many of it — depends on what the packer
 * managed to place. Dropping is also what keeps the search honest: the freed area is real
 * free space that a later refill can hand to a compliant model.
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

  // Per restricted model, how many panels are still allowed through; unrestricted models
  // never enter the map and so keep every placement.
  const budget = new Map<string, number>();
  for (const [id, n] of needed) budget.set(id, admissibleCount(counts.get(id) ?? 0, n));

  return placements.filter((p) => {
    const left = budget.get(p.optionId);
    if (left === undefined) return true;
    if (left <= 0) return false;
    budget.set(p.optionId, left - 1);
    return true;
  });
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
