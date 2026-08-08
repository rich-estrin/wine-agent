import { describe, it, expect } from 'vitest';
import { searchWines, filterWines, matchesFilter, getWineDetails } from './wine-search.js';
import { makeWine, ids } from '../test/factory.js';
import type { Wine } from '../src/types.js';

const wines: Wine[] = [
  makeWine({ id: 'kiona',     brandName: 'Kiona', wineName: 'Estate Cabernet Sauvignon',
             ava: 'Red Mountain', vintage: '2020', price: '$30', rating: '92',
             type: 'Red', mainVarietal: 'Cabernet Sauvignon', stateProvince: 'Washington' }),
  makeWine({ id: 'fidelitas', brandName: 'Fidelitas', wineName: 'Kiona Vineyard Cabernet',
             ava: 'Red Mountain', vintage: '2020', price: '$60', rating: '94',
             type: 'Red', mainVarietal: 'Cabernet Sauvignon', stateProvince: 'Washington' }),
  makeWine({ id: 'ita',       brandName: 'Itä', wineName: 'Estate Red', ava: 'Walla Walla Valley',
             vintage: '2021', price: '$45', rating: '93', type: 'Red',
             mainVarietal: 'Syrah', stateProvince: 'Washington' }),
  makeWine({ id: 'gard',      brandName: 'Gård Vintners', wineName: 'Grand Klasse',
             ava: 'Royal Slope', vintage: '2019', price: '$38', rating: '91',
             type: 'Red', mainVarietal: 'Merlot', stateProvince: 'Washington' }),
  makeWine({ id: 'semillon',  brandName: 'Barnard Griffin', wineName: 'Sémillon',
             ava: 'Columbia Valley', vintage: '2022', price: 'N/A', rating: '89',
             type: 'White', mainVarietal: 'Sémillon', stateProvince: 'Washington' }),
  makeWine({ id: 'woodward',  brandName: 'Woodward Canyon', wineName: 'Old Vines',
             ava: 'Walla Walla Valley', vintage: '2018', price: '$95', rating: '95',
             type: 'Red', mainVarietal: 'Cabernet Sauvignon', stateProvince: 'Washington',
             review: 'A blend with Merlot rounding the mid-palate; garden herbs on the finish.' }),
  makeWine({ id: 'albarino',  brandName: 'Abacela', wineName: 'Fiesta', ava: 'Umpqua Valley',
             vintage: '2022', price: '$22', rating: '90', type: 'White',
             mainVarietal: 'Albariño', stateProvince: 'Oregon' }),
  makeWine({ id: 'rioja',     brandName: 'Import Cellars', wineName: 'Rioja Crianza', ava: 'Rioja',
             vintage: '2019', price: '$25', rating: '90', type: 'Red',
             mainVarietal: 'Tempranillo', stateProvince: 'America' }),
];

const search = (q: string) => ids(searchWines(wines, { query: q, limit: 99 }));
const filter = (filters: Record<string, string>) =>
  ids(filterWines(wines, { filters, limit: 99 })).sort();

describe('searchWines — accent folding', () => {
  it('finds accented winery names without the accent', () => {
    expect(search('Ita')[0]).toBe('ita');
    expect(search('Gard')[0]).toBe('gard');
  });

  it('finds an accented varietal without the accent', () => {
    expect(search('semillon')).toEqual(['semillon']);
  });

  it('finds unaccented spellings from an accented query', () => {
    expect(search('Sémillon')).toEqual(['semillon']);
  });
});

describe('searchWines — ranking', () => {
  it('puts the winery above a wine that merely names its vineyard', () => {
    expect(search('Kiona')).toEqual(['kiona', 'fidelitas']);
  });

  it('puts a varietal in the name above one mentioned in a note', () => {
    expect(search('Merlot')).toEqual(['gard', 'woodward']);
  });

  it('keeps loose mid-word matches, ranked last', () => {
    // "garden herbs" in a review still matches "gard", behind Gård Vintners.
    expect(search('Gard')).toEqual(['gard', 'woodward']);
  });

  it('returns results relevance-ordered when no sort is given', () => {
    expect(search('cabernet')[0]).toBe('kiona'); // whole word in wineName beats the rest
  });

  it('honours an explicit sort, replacing the ranking', () => {
    const byPrice = ids(searchWines(wines, { query: 'cabernet', limit: 99, sort_by: 'price', sort_order: 'desc' }));
    expect(byPrice[0]).toBe('woodward');
  });

  it('leaves the order alone for sort_by=relevance', () => {
    const relevance = ids(searchWines(wines, { query: 'Kiona', limit: 99, sort_by: 'relevance' }));
    expect(relevance).toEqual(['kiona', 'fidelitas']);
  });

  it('applies the limit', () => {
    expect(searchWines(wines, { query: 'cabernet', limit: 1 })).toHaveLength(1);
  });
});

describe('searchWines — matching semantics', () => {
  it('requires all terms', () => {
    expect(search('Kiona Cabernet')).toEqual(['kiona', 'fidelitas']);
    expect(search('Kiona Riesling')).toEqual([]);
  });

  it('returns nothing when the query matches nothing', () => {
    expect(search('zinfandel')).toEqual([]);
  });

  it('returns everything for an empty query', () => {
    expect(search('')).toHaveLength(wines.length);
  });
});

describe('filterWines', () => {
  it('filters on an exact dropdown value', () => {
    expect(filter({ mainVarietal: 'Merlot' })).toEqual(['gard']);
  });

  it('does not let one varietal match another with the same prefix', () => {
    expect(filter({ mainVarietal: 'Cabernet' })).toEqual([]);
  });

  it('accepts a comma-separated OR list — this is what backs multi-select', () => {
    expect(filter({ type: 'White,Red' })).toHaveLength(wines.length);
    expect(filter({ stateProvince: 'Oregon,America' })).toEqual(['albarino', 'rioja']);
  });

  it('matches dropdown values accent-insensitively', () => {
    expect(filter({ mainVarietal: 'Semillon' })).toEqual(['semillon']);
    expect(filter({ mainVarietal: 'Albarino' })).toEqual(['albarino']);
  });

  it('combines filters with AND', () => {
    expect(filter({ type: 'Red', stateProvince: 'America' })).toEqual(['rioja']);
  });

  it('filters by price range, excluding wines with no price', () => {
    expect(filter({ priceMin: '30', priceMax: '60' })).toEqual(['fidelitas', 'gard', 'ita', 'kiona']);
    expect(filter({ priceMin: '1' })).not.toContain('semillon');
  });

  it('filters by an inclusive vintage range', () => {
    expect(filter({ vintageMin: '2022', vintageMax: '2022' })).toEqual(['albarino', 'semillon']);
  });

  it('filters by score range', () => {
    expect(filter({ scoreMin: '94' })).toEqual(['fidelitas', 'woodward']);
  });

  it('filters by appellation as an OR list', () => {
    expect(filter({ ava: 'Red Mountain,Rioja' })).toEqual(['fidelitas', 'kiona', 'rioja']);
  });

  it('returns nothing for an unknown value rather than everything', () => {
    expect(filter({ type: 'Fortified' })).toEqual([]);
  });

  it('returns everything when no filters are given', () => {
    expect(filter({})).toHaveLength(wines.length);
  });
});

describe('matchesFilter', () => {
  const wine = makeWine({ price: '$40', rating: '92', vintage: '2020',
                          publicationDate: '2025-06-15', brandName: 'Gård Vintners' });

  it('supports comparison operators on numeric fields', () => {
    expect(matchesFilter(wine, 'price', '>30')).toBe(true);
    expect(matchesFilter(wine, 'price', '>50')).toBe(false);
    expect(matchesFilter(wine, 'rating', '>=92')).toBe(true);
    expect(matchesFilter(wine, 'vintage', '<2019')).toBe(false);
  });

  it('supports date comparison, which is how the Review Date facet works', () => {
    expect(matchesFilter(wine, 'publicationDate', '>=2025-01-01')).toBe(true);
    expect(matchesFilter(wine, 'publicationDate', '>=2026-01-01')).toBe(false);
  });

  it('excludes wines with no value rather than treating them as zero', () => {
    const noPrice = makeWine({ price: 'N/A', vintage: '', rating: '' });
    expect(matchesFilter(noPrice, 'price', '<10')).toBe(false);
    expect(matchesFilter(noPrice, 'vintage', '<2000')).toBe(false);
    expect(matchesFilter(noPrice, 'rating', '<50')).toBe(false);
  });

  it('falls back to accent-insensitive substring on free-text fields', () => {
    expect(matchesFilter(wine, 'brandName', 'gard')).toBe(true);
  });

  it('is false for a field the Wine type does not have', () => {
    expect(matchesFilter(wine, 'nonsense', 'x')).toBe(false);
  });
});

describe('getWineDetails', () => {
  it('finds by partial name across brand and wine name', () => {
    expect(ids(getWineDetails(wines, { wine_name: 'Old Vines' }))).toEqual(['woodward']);
    expect(ids(getWineDetails(wines, { wine_name: 'Woodward Canyon Old Vines' }))).toEqual(['woodward']);
  });

  it('folds accents', () => {
    expect(ids(getWineDetails(wines, { wine_name: 'semillon' }))).toEqual(['semillon']);
  });

  it('honours exact_match', () => {
    expect(getWineDetails(wines, { wine_name: 'Old', exact_match: true })).toHaveLength(0);
    expect(ids(getWineDetails(wines, { wine_name: 'Old Vines', exact_match: true }))).toEqual(['woodward']);
  });
});
