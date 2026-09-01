/**
 * Text sanitising for the PDF export.
 *
 * The report is set in Helvetica, one of the base-14 fonts every PDF viewer carries, so
 * nothing has to be embedded — but those fonts are written with `WinAnsiEncoding` and
 * have no glyph outside it. Handed a character it cannot encode, jsPDF silently falls
 * back to writing the *whole* string as UTF-16, which a base-14 font then renders as
 * mojibake. Panel, surface and keep-out names are free text, so that is a real input.
 *
 * Everything drawn therefore passes through {@link winAnsi} first: characters the
 * encoding has are kept, the few the app itself emits from outside it are transliterated,
 * and anything left over becomes `?` — visibly missing rather than quietly corrupting the
 * line it appears in.
 */

/**
 * The characters WinAnsi puts in 0x80…0x9F, where Latin-1 has control codes: typographic
 * punctuation, the euro sign and a handful of accented letters.
 */
const WINANSI_PUNCTUATION = new Set([
  '€',
  '‚',
  'ƒ',
  '„',
  '…',
  '†',
  '‡',
  'ˆ',
  '‰',
  'Š',
  '‹',
  'Œ',
  'Ž',
  '‘',
  '’',
  '“',
  '”',
  '•',
  '–',
  '—',
  '˜',
  '™',
  'š',
  '›',
  'œ',
  'ž',
  'Ÿ',
]);

/**
 * Characters the app's own messages and formatters produce that WinAnsi lacks, written
 * as something it has. `≥` carries meaning in the totals — "this sum leaves out models
 * with no price" — so it becomes `>=` rather than a lost character.
 */
const TRANSLITERATE: Record<string, string> = {
  '≥': '>=',
  '≤': '<=',
  '−': '-', // U+2212 minus, which the results panel uses for a negative offset
  '→': '->',
  '↔': '<->',
  '↕': '^v',
};

/** Stands in for a character with no glyph and no transliteration. */
const UNKNOWN = '?';

/** Rewrite `text` into the subset of characters Helvetica can actually draw. */
export function winAnsi(text: string): string {
  let out = '';
  for (const ch of text) {
    const replacement = TRANSLITERATE[ch];
    if (replacement !== undefined) {
      out += replacement;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) out += ch;
    else out += WINANSI_PUNCTUATION.has(ch) ? ch : UNKNOWN;
  }
  return out;
}

/**
 * Trim `text` until `measure` says it fits `maxWidth`, appending an ellipsis when
 * anything was cut. Returns an empty string when not even the ellipsis fits.
 */
export function fitText(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string {
  if (measure(text) <= maxWidth) return text;
  const ellipsis = '…';
  if (measure(ellipsis) > maxWidth) return '';
  let cut = text;
  while (cut.length > 0 && measure(cut + ellipsis) > maxWidth) cut = cut.slice(0, -1);
  return cut.trimEnd() + ellipsis;
}
