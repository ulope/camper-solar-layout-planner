import { describe, it, expect } from 'vitest';
import { wrapText } from './textwrap';

// Fixed-width "font": every character is 10px wide, so widths are easy to reason about.
const measure = (t: string) => t.length * 10;
const wrap = (text: string, maxWidth: number, maxLines?: number) =>
  wrapText(text, maxWidth, measure, maxLines);

describe('wrapText', () => {
  it('keeps text that fits on a single line', () => {
    expect(wrap('100W panel', 200)).toEqual(['100W panel']);
  });

  it('breaks on whitespace when the text is too wide', () => {
    expect(wrap('Renogy 100W Flexible', 120)).toEqual(['Renogy 100W', 'Flexible']);
  });

  it('collapses surrounding and repeated whitespace', () => {
    expect(wrap('  Renogy   100W  ', 120)).toEqual(['Renogy 100W']);
  });

  it('breaks mid-word when a single word does not fit', () => {
    expect(wrap('Supercalifragilistic', 50)).toEqual(['Super', 'calif', 'ragil', 'istic']);
  });

  it('starts an over-long word on a fresh line', () => {
    expect(wrap('Solar Supercalifragilistic', 60)).toEqual([
      'Solar',
      'Superc',
      'alifra',
      'gilist',
      'ic',
    ]);
  });

  it('ellipsizes the last line when the text needs more lines than allowed', () => {
    expect(wrap('Renogy 100W Flexible Mono', 120, 2)).toEqual(['Renogy 100W', 'Flexible…']);
  });

  it('does not ellipsize when the wrapped text fits the line budget exactly', () => {
    expect(wrap('Renogy 100W Flexible', 120, 2)).toEqual(['Renogy 100W', 'Flexible']);
  });

  it('ellipsizes a single allowed line down to fit', () => {
    expect(wrap('Renogy 100W Flexible', 50, 1)).toEqual(['Reno…']);
  });

  it('returns nothing for empty text or a box with no room', () => {
    expect(wrap('', 100)).toEqual([]);
    expect(wrap('   ', 100)).toEqual([]);
    expect(wrap('Renogy', 0)).toEqual([]);
    expect(wrap('Renogy', 100, 0)).toEqual([]);
  });

  it('still emits one character per line when the box is narrower than a glyph', () => {
    expect(wrap('abc', 5)).toEqual(['a', 'b', 'c']);
  });
});
