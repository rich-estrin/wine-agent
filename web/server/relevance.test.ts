import { describe, it, expect } from 'vitest';
import { queryTerms, scoreWine } from './relevance.js';
import { makeWine } from '../test/factory.js';

const score = (wine: Parameters<typeof scoreWine>[0], q: string) => scoreWine(wine, queryTerms(q));

describe('queryTerms', () => {
  it('folds and splits the query', () => {
    expect(queryTerms('Gård Vintners')).toEqual(['gard', 'vintners']);
  });

  it('is empty for whitespace-only input', () => {
    expect(queryTerms('   ')).toEqual([]);
  });
});

describe('scoreWine — field precedence', () => {
  const winery = makeWine({ brandName: 'Kiona', wineName: 'Estate Cabernet' });
  const vineyard = makeWine({ brandName: 'Fidelitas', wineName: 'Kiona Vineyard Cabernet' });
  const note = makeWine({ brandName: 'Chinook', review: 'grown on the Kiona site' });

  it('ranks a winery-name hit above the same word in a wine name', () => {
    expect(score(winery, 'kiona')!).toBeGreaterThan(score(vineyard, 'kiona')!);
  });

  it('ranks a wine-name hit above the same word in a tasting note', () => {
    expect(score(vineyard, 'kiona')!).toBeGreaterThan(score(note, 'kiona')!);
  });

  it('ranks a varietal in the name above a varietal mentioned in a note', () => {
    const named = makeWine({ mainVarietal: 'Merlot' });
    const mentioned = makeWine({ review: 'a splash of Merlot rounds it out' });
    expect(score(named, 'merlot')!).toBeGreaterThan(score(mentioned, 'merlot')!);
  });

  it('ranks appellation above the tasting note', () => {
    const ava = makeWine({ ava: 'Red Mountain' });
    const mention = makeWine({ review: 'reminiscent of Red Mountain fruit' });
    expect(score(ava, 'red mountain')!).toBeGreaterThan(score(mention, 'red mountain')!);
  });
});

describe('scoreWine — match quality', () => {
  it('ranks a whole word above a word-prefix', () => {
    const exact = makeWine({ brandName: 'Kiona' });
    const prefix = makeWine({ brandName: 'Kionara Cellars' });
    expect(score(exact, 'kiona')!).toBeGreaterThan(score(prefix, 'kiona')!);
  });

  it('ranks a word-prefix above a mid-word substring', () => {
    const prefix = makeWine({ brandName: 'Gardner Estate' });
    const midWord = makeWine({ brandName: 'Bogardus' });
    expect(score(prefix, 'gard')!).toBeGreaterThan(score(midWord, 'gard')!);
  });

  // The tester's exact example: "Gard" must find Gård first, without dropping
  // the review that happens to say "garden herbs".
  it('ranks an accented winery above a mid-word note match', () => {
    const gard = makeWine({ brandName: 'Gård Vintners' });
    const herbs = makeWine({ brandName: 'Woodward Canyon', review: 'garden herbs on the finish' });
    expect(score(gard, 'gard')!).toBeGreaterThan(score(herbs, 'gard')!);
    expect(score(herbs, 'gard')).not.toBeNull(); // still a match, just a weaker one
  });
});

describe('scoreWine — matching rules', () => {
  it('is accent-insensitive', () => {
    expect(score(makeWine({ brandName: 'Itä' }), 'ita')).not.toBeNull();
    expect(score(makeWine({ brandName: 'Ita' }), 'itä')).not.toBeNull();
  });

  it('requires every term to match somewhere (AND, not OR)', () => {
    const wine = makeWine({ brandName: 'Kiona', wineName: 'Estate Cabernet' });
    expect(score(wine, 'kiona cabernet')).not.toBeNull();
    expect(score(wine, 'kiona zinfandel')).toBeNull();
  });

  it('lets terms match across different fields', () => {
    const wine = makeWine({ brandName: 'Kiona', ava: 'Red Mountain', vintage: '2020' });
    expect(score(wine, 'kiona red mountain 2020')).not.toBeNull();
  });

  it('sums across terms, so more matched terms scores higher', () => {
    const wine = makeWine({ brandName: 'Kiona', wineName: 'Estate Cabernet' });
    expect(score(wine, 'kiona cabernet')!).toBeGreaterThan(score(wine, 'kiona')!);
  });

  it('scores an empty query as zero rather than excluding everything', () => {
    expect(score(makeWine({ brandName: 'Kiona' }), '')).toBe(0);
  });

  it('returns null when nothing matches', () => {
    expect(score(makeWine({ brandName: 'Kiona' }), 'zinfandel')).toBeNull();
  });

  it('matches a vintage as a term', () => {
    expect(score(makeWine({ vintage: '2022' }), '2022')).not.toBeNull();
  });

  it('does not match on fields outside the index, such as the reviewer', () => {
    expect(score(makeWine({ reviewer: 'A. Taster' }), 'taster')).toBeNull();
  });
});
