import { derived, get, writable } from 'svelte/store';
import { createFormatters, DEFAULT_LOCALE } from '../format';
import { en, type Catalog, type MessageKey } from './en';
import { de } from './de';
import { format, type MessageParams } from './messages';

export type { MessageKey } from './en';
export type { MessageParams } from './messages';

/** A language the UI can be shown in, labelled in its own tongue. */
export type LocaleInfo = { code: Locale; label: string; htmlLang: string };

export const CATALOGS = { en, de } satisfies Record<string, Catalog>;

export type Locale = keyof typeof CATALOGS;

/** Offered in the language picker, in this order. */
export const LOCALES: LocaleInfo[] = [
  { code: 'en', label: 'English', htmlLang: 'en' },
  { code: 'de', label: 'Deutsch', htmlLang: 'de' },
];

export const FALLBACK_LOCALE: Locale = DEFAULT_LOCALE as Locale;

const STORAGE_KEY = 'camper-solar-layout:locale:v1';

const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && value in CATALOGS;

/**
 * The best supported match for a list of BCP-47 tags, matching on the primary subtag so
 * "de-AT" and "de-CH" both land on German. Returns undefined when none matches.
 */
export function matchLocale(tags: readonly string[]): Locale | undefined {
  for (const tag of tags) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return undefined;
}

/**
 * Startup locale: an explicit earlier choice wins, then the browser's languages, then
 * English. Every step is guarded — this runs at module load, including under a test
 * runner with neither `localStorage` nor `navigator`.
 */
export function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Private mode / disabled storage: fall through to the browser languages.
  }
  try {
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    const tags = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
    return matchLocale(tags) ?? FALLBACK_LOCALE;
  } catch {
    return FALLBACK_LOCALE;
  }
}

/** The active UI language. */
export const locale = writable<Locale>(detectLocale());

export function setLocale(next: Locale): void {
  if (!isLocale(next)) return;
  locale.set(next);
}

// Persist the choice and keep the document in sync with it, so assistive tech,
// hyphenation and the browser's translation offer all see the right language.
locale.subscribe((code) => {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // best-effort
  }
  if (typeof document !== 'undefined') {
    const info = LOCALES.find((l) => l.code === code);
    document.documentElement.lang = info?.htmlLang ?? code;
    document.title = translate(code, 'app.title');
  }
});

/**
 * Look one message up in a given locale. Falls back to English for a key a locale is
 * somehow missing (only reachable if a catalog is built at runtime — the typed ones
 * cannot be), and to the key itself if English lacks it too, so nothing renders blank.
 */
export function translate(
  code: Locale,
  key: MessageKey,
  params?: MessageParams,
  escape = false,
): string {
  const message = CATALOGS[code]?.[key] ?? en[key];
  if (message === undefined) return key;
  return format(message, params, escape);
}

export type Translate = (key: MessageKey, params?: MessageParams) => string;

/** Reactive translator for components: `{$t('results.title')}`. */
export const t = derived(
  locale,
  ($locale): Translate =>
    (key, params) =>
      translate($locale, key, params),
);

/**
 * Reactive translator for the few messages that carry their own markup and are rendered
 * with `{@html}`. Message text is app-owned, but parameters can be user-entered names,
 * so those are HTML-escaped.
 */
export const tHtml = derived(
  locale,
  ($locale): Translate =>
    (key, params) =>
      translate($locale, key, params, true),
);

/**
 * Non-reactive translator for plain modules (default data, one-off dialogs). Components
 * should use the `t` store instead so they re-render on a language switch.
 */
export function msg(key: MessageKey, params?: MessageParams): string {
  return translate(get(locale), key, params);
}

/** Locale-bound number, currency and area formatters: `{$fmt.area(cm2)}`. */
export const fmt = derived(locale, ($locale) => createFormatters($locale));

/** Non-reactive formatters, for plain modules. */
export const formatters = () => createFormatters(get(locale));
