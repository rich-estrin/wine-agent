import { describe, it, expect } from 'vitest';
import { highlightRanges } from './highlight';
import { foldWords } from './text';

/** Slice the ranges back out of the source, which is what the component does. */
const marked = (text: string, query: string) =>
  highlightRanges(text, foldWords(query)).map(([a, b]) => text.slice(a, b));

describe('highlightRanges', () => {
  it('marks a plain match', () => {
    expect(marked('garden herbs on the finish', 'garden')).toEqual(['garden']);
  });

  it('marks every occurrence', () => {
    expect(marked('Merlot, more Merlot, still Merlot', 'merlot'))
      .toEqual(['Merlot', 'Merlot', 'Merlot']);
  });

  // The offset mapping is the whole point: NFD decomposition changes string
  // length, so a match found in folded text cannot be sliced from the original
  // without translating indices back.
  describe('offset mapping across accents', () => {
    it('marks accented text from an unaccented query', () => {
      expect(marked('Notes of Sémillon and citrus.', 'semillon')).toEqual(['Sémillon']);
    });

    it('marks unaccented text from an accented query', () => {
      expect(marked('Notes of Semillon and citrus.', 'Sémillon')).toEqual(['Semillon']);
    });

    it('does not drift when accents appear BEFORE the match', () => {
      // Two accented words ahead of the target — a naive slice lands short by
      // one character per accent.
      expect(marked('Gård and Itä both make Sémillon here.', 'semillon')).toEqual(['Sémillon']);
    });

    it('does not drift when several accents precede the match', () => {
      expect(marked('Carménère, Rhône, Mourvèdre, then Merlot.', 'merlot')).toEqual(['Merlot']);
    });

    it('marks a word that is itself multiply accented', () => {
      expect(marked('A little Carménère in the blend.', 'carmenere')).toEqual(['Carménère']);
    });
  });

  it('merges overlapping matches rather than nesting them', () => {
    expect(marked('Cabernet Sauvignon', 'cabernet cabernet sauv')).toEqual(['Cabernet', 'Sauv']);
  });

  it('merges adjacent matches into one range', () => {
    // "red" and "wood" abut inside "redwood".
    expect(marked('redwood barrels', 'red wood')).toEqual(['redwood']);
  });

  it('ignores single-character terms, which would speckle the whole note', () => {
    expect(marked('a bit of oak', 'a')).toEqual([]);
  });

  it('returns nothing for an empty query', () => {
    expect(marked('anything at all', '')).toEqual([]);
  });

  it('returns nothing for empty text', () => {
    expect(marked('', 'merlot')).toEqual([]);
  });

  it('returns nothing when the term is absent', () => {
    expect(marked('Cabernet Sauvignon', 'zinfandel')).toEqual([]);
  });

  it('produces ranges in ascending order', () => {
    const ranges = highlightRanges('herbs then garden then herbs', foldWords('garden herbs'));
    const starts = ranges.map(([a]) => a);
    expect(starts).toEqual([...starts].sort((x, y) => x - y));
  });
});
