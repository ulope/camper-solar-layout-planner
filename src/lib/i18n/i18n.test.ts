import { describe, it, expect } from 'vitest';
import { CATALOGS, LOCALES, matchLocale, translate, type Locale } from './index';
import { en, type MessageKey } from './en';
import { format, type Message } from './messages';

const codes = Object.keys(CATALOGS) as Locale[];
const keys = Object.keys(en) as MessageKey[];

/** Placeholder names a message uses, e.g. "{a} of {b}" → ["a", "b"]. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

/** Both plural forms of a message, or the single string. */
function variants(message: Message): string[] {
  return typeof message === 'string' ? [message] : [message.one, message.other];
}

describe('catalogs', () => {
  it('offers every catalog in the language picker', () => {
    expect(LOCALES.map((l) => l.code).sort()).toEqual([...codes].sort());
  });

  it.each(codes)('%s has exactly the English keys', (code) => {
    expect(Object.keys(CATALOGS[code]).sort()).toEqual([...keys].sort());
  });

  it.each(codes)('%s has no empty message', (code) => {
    for (const key of keys) {
      for (const text of variants(CATALOGS[code][key])) {
        expect(text.trim(), `${code}: ${key}`).not.toBe('');
      }
    }
  });

  it.each(codes)('%s uses the same placeholders as English', (code) => {
    for (const key of keys) {
      const expected = placeholders(variants(en[key]).join(' '));
      const actual = placeholders(variants(CATALOGS[code][key]).join(' '));
      // Plural forms repeat the placeholders, so compare the distinct sets.
      expect([...new Set(actual)], `${code}: ${key}`).toEqual([...new Set(expected)]);
    }
  });

  it.each(codes)('%s pluralizes wherever English does', (code) => {
    for (const key of keys) {
      expect(typeof CATALOGS[code][key], `${code}: ${key}`).toBe(typeof en[key]);
    }
  });
});

describe('format', () => {
  it('substitutes named placeholders', () => {
    expect(format('{a} of {b}', { a: 1, b: 2 })).toBe('1 of 2');
  });

  it('leaves an unfilled placeholder visible rather than blank', () => {
    expect(format('{a} of {b}', { a: 1 })).toBe('1 of {b}');
  });

  it('picks the plural form by count', () => {
    const message = { one: '{count} option', other: '{count} options' };
    expect(format(message, { count: 1 })).toBe('1 option');
    expect(format(message, { count: 3 })).toBe('3 options');
    expect(format(message, { count: 0 })).toBe('0 options');
  });

  it('escapes parameters only when the message is rendered as HTML', () => {
    expect(format('{name}', { name: '<b>' })).toBe('<b>');
    expect(format('{name}', { name: '<b>' }, true)).toBe('&lt;b&gt;');
  });
});

describe('translate', () => {
  it('returns the locale’s own wording', () => {
    expect(translate('en', 'results.title')).toBe('Results');
    expect(translate('de', 'results.title')).toBe('Ergebnisse');
  });

  it('interpolates and pluralizes per locale', () => {
    expect(translate('de', 'results.optionCount', { count: 1 })).toBe('1 Option');
    expect(translate('de', 'results.optionCount', { count: 4 })).toBe('4 Optionen');
  });

  it('falls back to English for an unknown locale', () => {
    expect(translate('fr' as Locale, 'results.title')).toBe('Results');
  });
});

describe('matchLocale', () => {
  it('matches on the primary subtag', () => {
    expect(matchLocale(['de-AT', 'en'])).toBe('de');
    expect(matchLocale(['de'])).toBe('de');
    expect(matchLocale(['en-GB'])).toBe('en');
  });

  it('skips unsupported languages', () => {
    expect(matchLocale(['fr-FR', 'de-CH'])).toBe('de');
  });

  it('returns undefined when nothing matches', () => {
    expect(matchLocale(['fr', 'es'])).toBeUndefined();
    expect(matchLocale([])).toBeUndefined();
  });
});
