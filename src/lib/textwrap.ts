// Canvas text wrapping: the drawing code measures with the font it is about to
// paint, so wrapping only needs a measure callback and stays testable.

/** Measures a string's rendered width in px, at the caller's current font. */
export type Measure = (text: string) => number;

const ELLIPSIS = '…';

/** Greedily split an unbreakable word into chunks that each fit `maxWidth`. */
function breakWord(word: string, maxWidth: number, measure: Measure): string[] {
  const chunks: string[] = [];
  let chunk = '';
  for (const ch of word) {
    // Every chunk keeps at least one character, otherwise a glyph wider than
    // the box would loop forever.
    if (chunk && measure(chunk + ch) > maxWidth) {
      chunks.push(chunk);
      chunk = ch;
    } else {
      chunk += ch;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

/** Trim `text` until it plus an ellipsis fits `maxWidth`. */
function ellipsize(text: string, maxWidth: number, measure: Measure): string {
  let t = text;
  while (t.length > 0 && measure(t + ELLIPSIS) > maxWidth) t = t.slice(0, -1);
  return t.trimEnd() + ELLIPSIS;
}

/**
 * Wrap `text` into lines that each fit `maxWidth`, breaking on whitespace and
 * mid-word when a single word is too wide. When the result needs more than
 * `maxLines` lines the last kept line is ellipsized.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: Measure,
  maxLines = Infinity,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || maxWidth <= 0 || maxLines < 1) return [];

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (measure(word) <= maxWidth) {
      current = word;
      continue;
    }
    const chunks = breakWord(word, maxWidth, measure);
    lines.push(...chunks.slice(0, -1));
    current = chunks[chunks.length - 1] ?? '';
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[kept.length - 1] = ellipsize(kept[kept.length - 1], maxWidth, measure);
  return kept;
}
