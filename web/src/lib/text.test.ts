import { describe, it, expect } from 'vitest';
import { fold, foldWords, foldIncludes } from './text';

describe('fold', () => {
  it('strips accents so a plain query matches accented text', () => {
    expect(fold('Itä')).toBe('ita');
    expect(fold('Gård')).toBe('gard');
    expect(fold('Sémillon')).toBe('semillon');
    expect(fold('Carménère')).toBe('carmenere');
    expect(fold('Albariño')).toBe('albarino');
    expect(fold('Rhône')).toBe('rhone');
  });

  it('lowercases', () => {
    expect(fold('CABERNET')).toBe('cabernet');
  });

  it('is idempotent — folding folded text changes nothing', () => {
    expect(fold(fold('Mourvèdre'))).toBe(fold('Mourvèdre'));
  });

  it('leaves unaccented text alone apart from case', () => {
    expect(fold('Walla Walla Valley')).toBe('walla walla valley');
  });

  it('tolerates empty and nullish input', () => {
    expect(fold('')).toBe('');
    expect(fold(undefined as unknown as string)).toBe('');
    expect(fold(null as unknown as string)).toBe('');
  });

  it('treats precomposed and decomposed spellings as equal', () => {
    // "é" as one code point vs "e" + combining acute — both occur in real data.
    expect(fold('café')).toBe(fold('café'));
  });
});

describe('foldWords', () => {
  it('splits on punctuation and hyphens', () => {
    expect(foldWords('Rhône-Style Blend')).toEqual(['rhone', 'style', 'blend']);
    expect(foldWords('Walla Walla Valley (WA/OR)')).toEqual(['walla', 'walla', 'valley', 'wa', 'or']);
  });

  it('keeps digits, so a vintage is a searchable word', () => {
    expect(foldWords('2022 Reserve')).toEqual(['2022', 'reserve']);
  });

  it('drops empty segments from runs of punctuation', () => {
    expect(foldWords('  ...  ')).toEqual([]);
    expect(foldWords('')).toEqual([]);
  });
});

describe('foldIncludes', () => {
  it('matches ignoring case and accents in both directions', () => {
    expect(foldIncludes('Barnard Griffin Sémillon', 'semillon')).toBe(true);
    expect(foldIncludes('Barnard Griffin Semillon', 'Sémillon')).toBe(true);
  });

  it('still matches mid-word, which is what the filter boxes want', () => {
    expect(foldIncludes('Cabernet Sauvignon', 'ernet')).toBe(true);
  });

  it('is false when the needle is absent', () => {
    expect(foldIncludes('Merlot', 'syrah')).toBe(false);
  });

  it('treats an empty needle as matching', () => {
    expect(foldIncludes('anything', '')).toBe(true);
  });
});
