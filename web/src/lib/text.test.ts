import { describe, it, expect } from 'vitest';
import { fold, foldWords, foldSearchWords, foldIncludes } from './text';

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

describe('foldSearchWords', () => {
  it('adds the elided form of an apostrophe compound', () => {
    // "lecole" is what people type for L'Ecole — the apostrophe is a separator,
    // so the split alone leaves "l" and "ecole" and neither is a prefix of it.
    expect(foldSearchWords("L'Ecole No. 41")).toEqual(['l', 'ecole', 'no', '41', 'lecole']);
  });

  it('handles the typographic apostrophe too — real data has both', () => {
    expect(foldSearchWords('Colter’s Creek')).toEqual(['colter', 's', 'creek', 'colters']);
    expect(foldSearchWords("Colter's Creek")).toEqual(foldSearchWords('Colter’s Creek'));
  });

  it('keeps the split words, so the un-elided spelling still matches', () => {
    // Both "ecole" and "lecole" must remain findable.
    expect(foldSearchWords("L'Ecole")).toContain('ecole');
    expect(foldSearchWords("L'Ecole")).toContain('lecole');
  });

  it('elides every compound in a string, not just the first', () => {
    expect(foldSearchWords("Coeur d'Alene o'Clock")).toEqual(
      ['coeur', 'd', 'alene', 'o', 'clock', 'dalene', 'oclock'],
    );
  });

  it('is identical to foldWords when there is no apostrophe', () => {
    expect(foldSearchWords('Walla Walla Valley')).toEqual(foldWords('Walla Walla Valley'));
    expect(foldSearchWords('Rhône-Style Blend')).toEqual(foldWords('Rhône-Style Blend'));
  });

  it('does not invent a word from a stray or trailing apostrophe', () => {
    // "Sharecropper's" elides to one real word; a bare quote adds nothing.
    expect(foldSearchWords("Sharecropper's")).toEqual(['sharecropper', 's', 'sharecroppers']);
    expect(foldSearchWords("'")).toEqual([]);
    expect(foldSearchWords("Reserve '")).toEqual(['reserve']);
  });

  it('tolerates empty and nullish input', () => {
    expect(foldSearchWords('')).toEqual([]);
    expect(foldSearchWords(undefined as unknown as string)).toEqual([]);
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
