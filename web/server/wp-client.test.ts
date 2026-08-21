import { describe, it, expect } from 'vitest';
import { mapWPReview, type WPReview } from './wp-client.js';

const review = (overrides: Partial<WPReview> = {}): WPReview => ({
  id: 1, brand_name: 'Kiona', wine_name: 'Estate Red', designation: '', variety_style: '',
  tasting_note: 'Dusty and dense.', rating: '92', price: '30', vintage: '2020',
  wine_type: 'red', variety: 'cabernet sauvignon', region: 'tri-cities (wa)',
  appellation: 'Red Mountain', publication_date: '2025-06-15', special_designation: '',
  alcohol: '14.1', closure: 'Cork', state_or_province: 'washington', source: 'Sample',
  reviewer: 'A. Taster', ...overrides,
});

describe('mapWPReview — price', () => {
  it('adds a leading $ when missing', () => {
    expect(mapWPReview(review({ price: '30' })).price).toBe('$30');
  });

  it('leaves an existing $ alone', () => {
    expect(mapWPReview(review({ price: '$30' })).price).toBe('$30');
  });

  it('normalises every spelling of "no price" to N/A', () => {
    for (const price of ['', 'NA', '0']) {
      expect(mapWPReview(review({ price })).price).toBe('N/A');
    }
  });
});

// These have been the source of real bugs: \b treats an accented letter as a
// word boundary, which uppercased the letter after it.
describe('mapWPReview — title casing', () => {
  it('title-cases plain values', () => {
    expect(mapWPReview(review({ variety: 'cabernet sauvignon' })).mainVarietal)
      .toBe('Cabernet Sauvignon');
    expect(mapWPReview(review({ wine_type: 'red' })).type).toBe('Red');
  });

  it('does not uppercase the letter after an accent', () => {
    expect(mapWPReview(review({ variety: 'mourvèdre' })).mainVarietal).toBe('Mourvèdre');
    expect(mapWPReview(review({ variety: 'carménère' })).mainVarietal).toBe('Carménère');
    expect(mapWPReview(review({ variety: 'albariño' })).mainVarietal).toBe('Albariño');
    expect(mapWPReview(review({ variety: 'sémillon' })).mainVarietal).toBe('Sémillon');
  });

  it('capitalises after a hyphen', () => {
    expect(mapWPReview(review({ variety_style: 'rhône-style blend' })).varietyStyle)
      .toBe('Rhône-Style Blend');
  });

  it('title-cases the state', () => {
    expect(mapWPReview(review({ state_or_province: 'british columbia' })).stateProvince)
      .toBe('British Columbia');
  });
});

describe('mapWPReview — region casing', () => {
  it('keeps state codes uppercase', () => {
    expect(mapWPReview(review({ region: 'tri-cities (wa)' })).region).toBe('Tri-Cities (WA)');
    expect(mapWPReview(review({ region: 'okanagan (bc)' })).region).toBe('Okanagan (BC)');
  });

  it('keeps compass abbreviations uppercase', () => {
    expect(mapWPReview(review({ region: 'seattle & nw (wa)' })).region).toBe('Seattle & NW (WA)');
  });

  it('keeps a two-state code uppercase', () => {
    expect(mapWPReview(review({ region: 'walla walla valley (wa/or)' })).region)
      .toBe('Walla Walla Valley (WA/OR)');
  });
});

describe('mapWPReview — appellation corrections', () => {
  it('fixes known lowercase spellings', () => {
    expect(mapWPReview(review({ appellation: 'columbia valley' })).ava).toBe('Columbia Valley');
    expect(mapWPReview(review({ appellation: 'walla walla valley' })).ava).toBe('Walla Walla Valley');
  });

  it('expands the shortened Ancient Lakes name', () => {
    expect(mapWPReview(review({ appellation: 'ancient lakes' })).ava)
      .toBe('Ancient Lakes of Columbia Valley');
  });

  it('leaves an unknown appellation as written', () => {
    expect(mapWPReview(review({ appellation: 'Rioja' })).ava).toBe('Rioja');
  });
});

describe('mapWPReview — dates and defaults', () => {
  it('passes an ISO date straight through', () => {
    expect(mapWPReview(review({ publication_date: '2025-06-15' })).publicationDate)
      .toBe('2025-06-15');
  });

  it('normalises a raw Ymd date', () => {
    expect(mapWPReview(review({ publication_date: '20141230' })).publicationDate)
      .toBe('2014-12-30');
  });

  it('stringifies the id', () => {
    expect(mapWPReview(review({ id: 42 })).id).toBe('42');
  });

  it('survives missing fields without throwing', () => {
    const sparse = mapWPReview({ id: 7 } as WPReview);
    expect(sparse.id).toBe('7');
    expect(sparse.brandName).toBe('');
    expect(sparse.price).toBe('N/A');
  });
});

describe('case production', () => {
  it('reads the cases meta key, separators stripped', () => {
    expect(mapWPReview(review({ cases: '1,200' })).cases).toBe('1200');
    expect(mapWPReview(review({ cases: '850' })).cases).toBe('850');
  });

  it('is blank when the review reports none', () => {
    expect(mapWPReview(review({})).cases).toBe('');
    expect(mapWPReview(review({ cases: '0' })).cases).toBe('');
  });
});
