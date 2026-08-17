// Shared display formatting and input coercion helpers.

/** Currency symbol used for panel prices. Single point of change. */
export const CURRENCY = '€';

/** Trim trailing zeros: 9.50 → "9.5", 9.00 → "9". */
export function fmtNum(n: number, digits = 1): string {
  return Number.isInteger(n) ? String(n) : Number(n.toFixed(digits)).toString();
}

export function fmtWeight(kg: number): string {
  return `${fmtNum(kg)} kg`;
}

export function fmtPrice(amount: number): string {
  return `${CURRENCY}${fmtNum(amount, 2)}`;
}

export function fmtArea(cm2: number): string {
  return `${(cm2 / 10000).toFixed(2)} m²`;
}

// Accepts numbers as well as strings: Svelte's `bind:value` on <input type="number">
// yields a number (or null when the field is empty or unparseable).
type NumericInput = string | number | null | undefined;

/** Required numeric value: non-negative, invalid/empty coerces to 0. */
export function toNum(raw: NumericInput): number {
  return Math.max(0, Number(raw ?? 0) || 0);
}

/** Optional numeric value: empty clears it (undefined), otherwise a non-negative number. */
export function toOptNum(raw: NumericInput): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const t = typeof raw === 'string' ? raw.trim() : raw;
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Required numeric input event. */
export function num(e: Event): number {
  return toNum((e.target as HTMLInputElement).value);
}

/** Optional numeric input event: empty clears the field. */
export function optNum(e: Event): number | undefined {
  return toOptNum((e.target as HTMLInputElement).value);
}
