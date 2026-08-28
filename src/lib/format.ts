// Shared display formatting and input coercion helpers.
//
// The display helpers take a BCP-47 locale because figures follow the UI language:
// German writes "9,5 kg" and "89 €" where English writes "9.5 kg" and "€89".
// `createFormatters` binds one locale once; `src/lib/i18n` exposes the bound set as a
// reactive store so a language switch re-renders every figure on screen.

/** Currency used for panel prices. Single point of change. */
export const CURRENCY = '€';
const CURRENCY_CODE = 'EUR';

/** Fallback locale, and the one the non-reactive helpers below default to. */
export const DEFAULT_LOCALE = 'en';

// Intl formatters are comparatively expensive to construct and are asked for on every
// render, so each (locale, shape) pair is built once.
const cache = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, options);
    cache.set(key, f);
  }
  return f;
}

/** Trim trailing zeros: 9.50 → "9.5" ("9,5" in German), 9.00 → "9". */
export function fmtNum(n: number, locale = DEFAULT_LOCALE, digits = 1): string {
  return numberFormat(locale, { maximumFractionDigits: digits }).format(n);
}

/** A fixed number of decimals, for readouts that should not jump width as they tick. */
export function fmtFixed(n: number, locale = DEFAULT_LOCALE, digits = 1): string {
  return numberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function fmtWeight(kg: number, locale = DEFAULT_LOCALE): string {
  return `${fmtNum(kg, locale)} kg`;
}

/** A price with trailing zeros trimmed: 89 → "€89" / "89 €". */
export function fmtPrice(amount: number, locale = DEFAULT_LOCALE): string {
  return numberFormat(locale, {
    style: 'currency',
    currency: CURRENCY_CODE,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** A price kept at two decimals, for per-Wp rates where the cents carry the signal. */
export function fmtPriceExact(amount: number, locale = DEFAULT_LOCALE): string {
  return numberFormat(locale, {
    style: 'currency',
    currency: CURRENCY_CODE,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function fmtArea(cm2: number, locale = DEFAULT_LOCALE): string {
  return `${numberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cm2 / 10000)} m²`;
}

/** The locale-bound formatter set the UI works with. */
export type Formatters = {
  locale: string;
  currency: string;
  num: (n: number, digits?: number) => string;
  fixed: (n: number, digits?: number) => string;
  weight: (kg: number) => string;
  price: (amount: number) => string;
  priceExact: (amount: number) => string;
  area: (cm2: number) => string;
  /** Numeric-aware name collator, so "Model 2" sorts before "Model 10". */
  collator: Intl.Collator;
};

export function createFormatters(locale: string): Formatters {
  return {
    locale,
    currency: CURRENCY,
    num: (n, digits = 1) => fmtNum(n, locale, digits),
    fixed: (n, digits = 1) => fmtFixed(n, locale, digits),
    weight: (kg) => fmtWeight(kg, locale),
    price: (amount) => fmtPrice(amount, locale),
    priceExact: (amount) => fmtPriceExact(amount, locale),
    area: (cm2) => fmtArea(cm2, locale),
    collator: new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }),
  };
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
