import { describe, it, expect } from 'vitest';
import { fitText, winAnsi } from './text';

describe('winAnsi', () => {
  it('keeps ASCII and Latin-1 as they are', () => {
    expect(winAnsi('100 W mono')).toBe('100 W mono');
    expect(winAnsi('Dachfläche, Maße in cm')).toBe('Dachfläche, Maße in cm');
  });

  it('keeps the punctuation the app draws', () => {
    expect(winAnsi('300 × 180 cm · 3,10 m² · €89 — “x” …')).toBe('300 × 180 cm · 3,10 m² · €89 — “x” …');
  });

  it('transliterates the characters the app emits from outside the encoding', () => {
    expect(winAnsi('≥ 19 kg')).toBe('>= 19 kg');
    expect(winAnsi('−7,4%')).toBe('-7,4%');
  });

  it('replaces anything else with a visible placeholder', () => {
    expect(winAnsi('Ω 日 ☀')).toBe('? ? ?');
  });

  it('leaves an empty string alone', () => {
    expect(winAnsi('')).toBe('');
  });
});

describe('fitText', () => {
  // A stand-in for a font: every character is one unit wide.
  const measure = (s: string) => s.length;

  it('leaves text that fits untouched', () => {
    expect(fitText('100 W mono', 10, measure)).toBe('100 W mono');
  });

  it('ellipsizes text that does not fit, to within the budget', () => {
    const cut = fitText('A very long panel model name', 10, measure);
    expect(cut.endsWith('…')).toBe(true);
    expect(measure(cut)).toBeLessThanOrEqual(10);
  });

  it('returns nothing when not even the ellipsis fits', () => {
    expect(fitText('anything', 0, measure)).toBe('');
  });
});
