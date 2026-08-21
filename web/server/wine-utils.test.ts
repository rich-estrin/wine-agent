import { describe, it, expect } from 'vitest';
import {
  parsePriceOrNull, parseRatingOrNull, parseVintageOrNull, parseDateOrNull, parseDayOrNull, parseCasesOrNull, normalizeCases,
  parseFilterValue, compareValues, sortWines,
} from './wine-utils.js';
import { makeWine, ids } from '../test/factory.js';

describe('parsePriceOrNull', () => {
  it('parses the usual shapes', () => {
    expect(parsePriceOrNull('$45')).toBe(45);
    expect(parsePriceOrNull('45')).toBe(45);
    expect(parsePriceOrNull('$1,250')).toBe(1250);
    expect(parsePriceOrNull('$19.99')).toBe(19.99);
    expect(parsePriceOrNull('  $30  ')).toBe(30);
  });

  // The importer collapses empty, NA and 0 to "N/A"; all three mean unknown.
  it('returns null for every spelling of "no price"', () => {
    expect(parsePriceOrNull('')).toBeNull();
    expect(parsePriceOrNull('N/A')).toBeNull();
    expect(parsePriceOrNull('NA')).toBeNull();
    expect(parsePriceOrNull('0')).toBeNull();
    expect(parsePriceOrNull('not a price')).toBeNull();
  });
});

describe('parseRatingOrNull', () => {
  it('parses point scores', () => {
    expect(parseRatingOrNull('92')).toBe(92);
    expect(parseRatingOrNull('89.5')).toBe(89.5);
  });

  it('parses star ratings, including halves', () => {
    expect(parseRatingOrNull('****')).toBe(4);
    expect(parseRatingOrNull('***1/2')).toBe(3.5);
    expect(parseRatingOrNull('***½')).toBe(3.5);
  });

  it('returns null when unrated', () => {
    expect(parseRatingOrNull('')).toBeNull();
    expect(parseRatingOrNull('not rated')).toBeNull();
  });
});

describe('parseVintageOrNull / parseDateOrNull', () => {
  it('parses vintages', () => {
    expect(parseVintageOrNull('2022')).toBe(2022);
    expect(parseVintageOrNull('')).toBeNull();
    expect(parseVintageOrNull('NV')).toBeNull();
  });

  it('parses ISO dates', () => {
    expect(parseDateOrNull('2025-06-15')).toBe(new Date('2025-06-15').getTime());
    expect(parseDateOrNull('')).toBeNull();
    expect(parseDateOrNull('sometime')).toBeNull();
  });
});

describe('parseFilterValue', () => {
  it('splits a leading comparison operator', () => {
    expect(parseFilterValue('>=2012')).toEqual({ operator: '>=', value: '2012' });
    expect(parseFilterValue('<50')).toEqual({ operator: '<', value: '50' });
  });

  it('defaults to equality when there is no operator', () => {
    expect(parseFilterValue('Merlot')).toEqual({ operator: '=', value: 'Merlot' });
  });
});

describe('compareValues', () => {
  it('applies each operator', () => {
    expect(compareValues(5, '>', 3)).toBe(true);
    expect(compareValues(5, '<', 3)).toBe(false);
    expect(compareValues(3, '>=', 3)).toBe(true);
    expect(compareValues(3, '<=', 3)).toBe(true);
    expect(compareValues(3, '=', 3)).toBe(true);
    expect(compareValues(3, '==', 3)).toBe(true);
  });

  it('is false for an unknown operator', () => {
    expect(compareValues(3, '!!', 3)).toBe(false);
  });
});

describe('normalizeCases / parseCasesOrNull', () => {
  it('strips separators and the word', () => {
    expect(normalizeCases('1,200 cases')).toBe('1200');
    expect(normalizeCases('  850 ')).toBe('850');
  });

  it('treats blank and zero as "not reported"', () => {
    expect(normalizeCases('')).toBe('');
    expect(normalizeCases('0')).toBe('');
    expect(parseCasesOrNull('')).toBeNull();
    expect(parseCasesOrNull('0')).toBeNull();
  });

  it('parses a normalized value back to a number', () => {
    expect(parseCasesOrNull('1200')).toBe(1200);
    expect(parseCasesOrNull('1,200')).toBe(1200);
  });
});

describe('parseDayOrNull', () => {
  it('reads an ISO date as its own calendar day, timezone-free', () => {
    expect(parseDayOrNull('2025-06-15')).toBe(Date.UTC(2025, 5, 15));
  });

  it('drops a time component, so two times on a day are equal', () => {
    expect(parseDayOrNull('2025-06-15 09:30:00')).toBe(parseDayOrNull('2025-06-15'));
    expect(parseDayOrNull('2025-06-15T23:59:59')).toBe(parseDayOrNull('2025-06-15'));
  });

  it('is null for empty and unparseable values', () => {
    expect(parseDayOrNull('')).toBeNull();
    expect(parseDayOrNull('not a date')).toBeNull();
  });
});

describe('sortWines — wines with no value sort last in BOTH directions', () => {
  const wines = [
    makeWine({ id: 'cheap',    price: '$18', vintage: '2019', publicationDate: '2024-01-01', rating: '88' }),
    makeWine({ id: 'mid',      price: '$45', vintage: '2021', publicationDate: '2025-01-01', rating: '92' }),
    makeWine({ id: 'dear',     price: '$95', vintage: '2018', publicationDate: '2023-01-01', rating: '95' }),
    makeWine({ id: 'noprice',  price: 'N/A', vintage: '2020', publicationDate: '2025-06-01', rating: '93' }),
    makeWine({ id: 'zeroprice',price: '0',   vintage: '',     publicationDate: '',           rating: '' }),
  ];

  it('sorts by price descending, missing last', () => {
    expect(ids(sortWines(wines, 'price', 'desc'))).toEqual(['dear', 'mid', 'cheap', 'noprice', 'zeroprice']);
  });

  it('sorts by price ascending, missing still last', () => {
    expect(ids(sortWines(wines, 'price', 'asc'))).toEqual(['cheap', 'mid', 'dear', 'noprice', 'zeroprice']);
  });

  it('sorts by vintage with the missing vintage last in both directions', () => {
    expect(ids(sortWines(wines, 'vintage', 'desc')).at(-1)).toBe('zeroprice');
    expect(ids(sortWines(wines, 'vintage', 'asc')).at(-1)).toBe('zeroprice');
  });

  it('sorts by publication date with the missing date last in both directions', () => {
    expect(ids(sortWines(wines, 'publicationDate', 'desc')).at(-1)).toBe('zeroprice');
    expect(ids(sortWines(wines, 'publicationDate', 'asc')).at(-1)).toBe('zeroprice');
  });

  it('sorts unrated wines last in both directions', () => {
    expect(ids(sortWines(wines, 'rating', 'desc')).at(-1)).toBe('zeroprice');
    expect(ids(sortWines(wines, 'rating', 'asc')).at(-1)).toBe('zeroprice');
  });

  it('breaks a same-day tie by rating, highest first, in both directions', () => {
    // The example from the feedback: a day's batch led by the 94-point rosé.
    const sameDay = [
      makeWine({ id: 'sauv-blanc', publicationDate: '2025-07-01', rating: '93' }),
      makeWine({ id: 'rose',       publicationDate: '2025-07-01', rating: '94' }),
      makeWine({ id: 'red',        publicationDate: '2025-07-01', rating: '90' }),
      makeWine({ id: 'older',      publicationDate: '2025-06-01', rating: '99' }),
    ];
    expect(ids(sortWines(sameDay, 'publicationDate', 'desc')))
      .toEqual(['rose', 'sauv-blanc', 'red', 'older']);
    // "Lowest" reverses the dates, not the within-day order.
    expect(ids(sortWines(sameDay, 'publicationDate', 'asc')))
      .toEqual(['older', 'rose', 'sauv-blanc', 'red']);
  });

  it('ties on the published day, not the timestamp', () => {
    const timestamped = [
      makeWine({ id: 'morning', publicationDate: '2025-07-01 08:15:00', rating: '90' }),
      makeWine({ id: 'evening', publicationDate: '2025-07-01 19:40:00', rating: '95' }),
    ];
    expect(ids(sortWines(timestamped, 'publicationDate', 'desc')))
      .toEqual(['evening', 'morning']);
  });

  it('puts an unrated wine last within its own day', () => {
    const sameDay = [
      makeWine({ id: 'unrated', publicationDate: '2025-07-01', rating: '' }),
      makeWine({ id: 'rated',   publicationDate: '2025-07-01', rating: '88' }),
    ];
    expect(ids(sortWines(sameDay, 'publicationDate', 'desc'))).toEqual(['rated', 'unrated']);
  });

  it('does not mutate the input array', () => {
    const before = ids(wines);
    sortWines(wines, 'price', 'asc');
    expect(ids(wines)).toEqual(before);
  });

  it('is stable, so an existing order survives among equal values', () => {
    const tied = [
      makeWine({ id: 'first',  price: '$20' }),
      makeWine({ id: 'second', price: '$20' }),
      makeWine({ id: 'third',  price: '$20' }),
    ];
    expect(ids(sortWines(tied, 'price', 'desc'))).toEqual(['first', 'second', 'third']);
  });

  it('sorts string fields alphabetically, blanks last', () => {
    const byBrand = [
      makeWine({ id: 'blank', brandName: '' }),
      makeWine({ id: 'z', brandName: 'Zephyr' }),
      makeWine({ id: 'a', brandName: 'Abacela' }),
    ];
    expect(ids(sortWines(byBrand, 'brandName', 'asc'))).toEqual(['a', 'z', 'blank']);
  });
});
