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
             mainVarietal: 'Albariño', stateProvince: 'Oregon',
             region: 'Southern Oregon (OR)' }),
  makeWine({ id: 'rioja',     brandName: 'Import Cellars', wineName: 'Rioja Crianza', ava: 'Rioja',
             vintage: '2019', price: '$25', rating: '90', type: 'Red',
             mainVarietal: 'Tempranillo', stateProvince: 'America' }),
];

const search = (q: string) => ids(searchWines(wines, { query: q, limit: 99 }));
const filter = (filters: Record<string, string>) =>
  ids(filterWines(wines, { filters, limit: 99 })).sort();

describe('searchWines — accent folding', () => {
  it('finds accented winery names without the accent', () => {
    expect(search('Ita')).toEqual(['ita']);
    expect(search('Gard')).toEqual(['gard']);
  });

  it('finds an accented wine name without the accent', () => {
    expect(search('semillon')).toEqual(['semillon']);
  });

  it('finds unaccented spellings from an accented query', () => {
    expect(search('Sémillon')).toEqual(['semillon']);
  });
});

describe('searchWines — searchable fields', () => {
  it('searches the producer name', () => {
    expect(search('Woodward')).toEqual(['woodward']);
  });

  it('searches the vintage', () => {
    expect(search('2018')).toEqual(['woodward']);
  });

  it('searches the full wine name', () => {
    expect(search('Crianza')).toEqual(['rioja']);
  });

  it('searches the varietal, which the wine name need not mention', () => {
    expect(search('Tempranillo')).toEqual(['rioja']);
    expect(search('Syrah')).toEqual(['ita']);
  });

  it('combines producer and vintage in one query', () => {
    expect(search('Woodward 2018')).toEqual(['woodward']);
    expect(search('Woodward 2019')).toEqual([]);
  });

  it('does not search the tasting note', () => {
    // Woodward Canyon's review mentions Merlot; Gård is a Merlot by varietal.
    expect(search('Merlot')).toEqual(['gard']);
    expect(search('herbs')).toEqual([]);
  });

  it('searches the appellation', () => {
    expect(search('Umpqua')).toEqual(['albarino']);
    expect(search('Walla')).toEqual(['ita', 'woodward']);
  });

  it('finds a multi-word appellation typed in full', () => {
    expect(search('Red Mountain')).toEqual(['kiona', 'fidelitas']);
  });

  it('does not search the home region — that stays a filter', () => {
    // Abacela's home region is Southern Oregon; only its appellation is indexed.
    expect(search('Southern')).toEqual([]);
  });
});

describe('searchWines — apostrophes', () => {
  // A local set: these rows exist to be searched by name, and adding them to
  // the shared list above would shift the price/varietal assertions there.
  // Two spellings, because the export holds both — an ASCII quote and a
  // typographic one — and neither should need the reader to type it.
  const apostrophes: Wine[] = [
    makeWine({ id: 'lecole',  brandName: "L'Ecole No. 41", wineName: 'Frenchtown',
               mainVarietal: 'Merlot' }),
    makeWine({ id: 'colters', brandName: 'Colter’s Creek', wineName: 'Koos Koos Kia',
               mainVarietal: 'Syrah' }),
    makeWine({ id: 'plain',   brandName: 'Woodward Canyon', wineName: 'Old Vines',
               mainVarietal: 'Merlot' }),
  ];
  const search = (q: string) => ids(searchWines(apostrophes, { query: q, limit: 99 }));

  it('finds L\'Ecole when the apostrophe is left out', () => {
    expect(search('lecole')).toEqual(['lecole']);
  });

  it('finds it with the apostrophe typed, either spelling', () => {
    expect(search("L'Ecole")).toEqual(['lecole']);
    expect(search('L’Ecole')).toEqual(['lecole']);
  });

  it('still finds it by the part after the apostrophe', () => {
    expect(search('ecole')).toEqual(['lecole']);
  });

  it('applies to possessives, on the typographic apostrophe too', () => {
    expect(search('colters')).toEqual(['colters']);
    expect(search("colter's")).toEqual(['colters']);
    expect(search('colter')).toEqual(['colters']);
  });

  it('does not match an elision that is not there', () => {
    expect(search('lecoles')).toEqual([]);
    expect(search('xecole')).toEqual([]);
  });
});

describe('searchWines — prefix matching', () => {
  it('matches the start of a word', () => {
    expect(search('Wood')).toEqual(['woodward']);
    expect(search('Cab')).toEqual(['kiona', 'fidelitas', 'woodward']);
  });

  it('matches a word anywhere in the field, not just the first', () => {
    expect(search('Vintners')).toEqual(['gard']);
  });

  it('does not match inside a word', () => {
    expect(search('idelitas')).toEqual([]);
    expect(search('ernet')).toEqual([]);
  });

  it('leaves the source order alone when no sort is given', () => {
    expect(search('cabernet')).toEqual(['kiona', 'fidelitas', 'woodward']);
  });

  it('honours an explicit sort', () => {
    const byPrice = ids(searchWines(wines, { query: 'cabernet', limit: 99, sort_by: 'price', sort_order: 'desc' }));
    expect(byPrice[0]).toBe('woodward');
  });

  it('applies the limit', () => {
    expect(searchWines(wines, { query: 'cabernet', limit: 1 })).toHaveLength(1);
  });
});

describe('searchWines — matching semantics', () => {
  it('requires all terms, though not in the same field', () => {
    // Kiona's own bottling matches on the brand; Fidelitas names the vineyard.
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
