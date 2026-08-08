import type { Wine } from '../src/types.js';
import {
  parsePriceOrNull, parseRatingOrNull, parseVintageOrNull, parseDateOrNull,
  parseFilterValue, compareValues, sortWines,
} from './wine-utils.js';
import { queryTerms, scoreWine } from './relevance.js';
import { fold } from '../src/lib/text.js';

// Fields populated from single-select dropdowns / grouped trees. These match
// exactly (case-insensitive) against a comma-separated OR list rather than by
// substring, fixing e.g. varietal "Ca" matching every Cabernet.
const EXACT_MATCH_FIELDS = new Set(['mainVarietal', 'type', 'region', 'stateProvince', 'specialDesignation']);

/** Full-text search, ranked. Results come back ordered by relevance (best
 *  first) so callers that want relevance order can simply not re-sort. */
export function searchWines(
  wines: Wine[],
  params: { query: string; limit?: number; sort_by?: string; sort_order?: 'asc' | 'desc' },
): Wine[] {
  const { query, limit = 20, sort_by, sort_order = 'desc' } = params;
  const terms = queryTerms(query);

  const scored: { wine: Wine; score: number }[] = [];
  for (const wine of wines) {
    const score = scoreWine(wine, terms);
    if (score !== null) scored.push({ wine, score });
  }
  scored.sort((a, b) => b.score - a.score);
  let results = scored.map((s) => s.wine);

  // Any explicit sort other than relevance replaces the ranking. Array.sort is
  // stable, so relevance still breaks ties within equal ratings/prices.
  if (sort_by && sort_by !== 'relevance') results = sortWines(results, sort_by, sort_order);
  return results.slice(0, limit);
}

export function filterWines(
  wines: Wine[],
  params: { filters: Record<string, string>; limit?: number; sort_by?: string; sort_order?: 'asc' | 'desc' },
): Wine[] {
  const { filters, limit = 20, sort_by, sort_order = 'desc' } = params;
  let results = wines.filter((wine) =>
    Object.entries(filters).every(([key, val]) => matchesFilter(wine, key, val)),
  );
  if (sort_by && sort_by !== 'relevance') results = sortWines(results, sort_by, sort_order);
  return results.slice(0, limit);
}

export function matchesFilter(wine: Wine, key: string, filterValue: string): boolean {
  if (key === 'scoreMin') {
    const n = parseFloat(wine.rating);
    return !wine.rating.includes('*') && !isNaN(n) && n >= parseFloat(filterValue);
  }
  if (key === 'scoreMax') {
    const n = parseFloat(wine.rating);
    return !wine.rating.includes('*') && !isNaN(n) && n <= parseFloat(filterValue);
  }
  if (key === 'priceMin') {
    const n = parsePriceOrNull(wine.price);
    return n !== null && n >= parseFloat(filterValue);
  }
  if (key === 'priceMax') {
    const n = parsePriceOrNull(wine.price);
    return n !== null && n <= parseFloat(filterValue);
  }
  if (key === 'ava') {
    const allowed = filterValue.split(',').map((s) => fold(s.trim()));
    return allowed.includes(fold(wine.ava));
  }
  // Dropdown-selected fields: exact, accent- and case-insensitive match against
  // a comma-separated OR list (a single selection is a 1-element list). This is
  // what makes "Cabernet Sauvignon" not also match "Cabernet Franc", lets
  // grouped options (region by state, designation groups) match any member, and
  // carries multi-select straight through from the sidebar.
  if (EXACT_MATCH_FIELDS.has(key)) {
    const wineValue = fold((wine[key as keyof Wine] as string) ?? '');
    const allowed = filterValue.split(',').map((s) => fold(s.trim())).filter(Boolean);
    return allowed.includes(wineValue);
  }
  if (key === 'vintageMin') {
    const v = parseVintageOrNull(wine.vintage);
    return v !== null && v >= parseInt(filterValue);
  }
  if (key === 'vintageMax') {
    const v = parseVintageOrNull(wine.vintage);
    return v !== null && v <= parseInt(filterValue);
  }

  const wineValue = wine[key as keyof Wine] as string;
  if (wineValue === undefined) return false;

  const { operator, value } = parseFilterValue(filterValue);
  switch (key) {
    case 'price': {
      const n = parsePriceOrNull(wineValue);
      return n !== null && compareValues(n, operator, parseFloat(value));
    }
    case 'rating': {
      const n = parseRatingOrNull(wineValue);
      return n !== null && compareValues(n, operator, parseFloat(value));
    }
    case 'vintage': {
      const v = parseVintageOrNull(wineValue);
      return v !== null && compareValues(v, operator, parseInt(value) || 0);
    }
    case 'publicationDate':
    case 'tastingDate': {
      const t = parseDateOrNull(wineValue);
      const expected = parseDateOrNull(value);
      return t !== null && expected !== null && compareValues(t, operator, expected);
    }
    default:
      // Accent-insensitive substring — "Rhone" finds "Rhône".
      return operator === '=' ? fold(wineValue).includes(fold(value)) : false;
  }
}

export function getWineDetails(
  wines: Wine[],
  params: { wine_name: string; exact_match?: boolean },
): Wine[] {
  const { wine_name, exact_match = false } = params;
  const search = fold(wine_name);
  return wines.filter((wine) => {
    const name = fold(wine.wineName);
    const full = fold(`${wine.brandName} ${wine.wineName}`);
    return exact_match
      ? name === search || full === search
      : name.includes(search) || full.includes(search);
  });
}
