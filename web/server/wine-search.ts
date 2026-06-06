import type { Wine } from '../src/types.js';
import { parsePrice, parseRating, parseDate, parseFilterValue, compareValues, sortWines } from './wine-utils.js';

// Fields populated from single-select dropdowns / grouped trees. These match
// exactly (case-insensitive) against a comma-separated OR list rather than by
// substring, fixing e.g. varietal "Ca" matching every Cabernet.
const EXACT_MATCH_FIELDS = new Set(['mainVarietal', 'type', 'region', 'stateProvince', 'specialDesignation']);

export function searchWines(
  wines: Wine[],
  params: { query: string; limit?: number; sort_by?: string; sort_order?: 'asc' | 'desc' },
): Wine[] {
  const { query, limit = 20, sort_by, sort_order = 'desc' } = params;
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  let results = wines.filter((wine) => {
    const text = [
      wine.wineName, wine.brandName, wine.review, wine.ava,
      wine.region, wine.mainVarietal, wine.varietyStyle, wine.vintage,
    ].join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  });
  if (sort_by) results = sortWines(results, sort_by, sort_order);
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
  if (sort_by) results = sortWines(results, sort_by, sort_order);
  return results.slice(0, limit);
}

function matchesFilter(wine: Wine, key: string, filterValue: string): boolean {
  if (key === 'scoreMin') {
    const n = parseFloat(wine.rating);
    return !wine.rating.includes('*') && !isNaN(n) && n >= parseFloat(filterValue);
  }
  if (key === 'scoreMax') {
    const n = parseFloat(wine.rating);
    return !wine.rating.includes('*') && !isNaN(n) && n <= parseFloat(filterValue);
  }
  if (key === 'priceMin') {
    const n = parsePrice(wine.price);
    return n !== 9999 && n >= parseFloat(filterValue);
  }
  if (key === 'priceMax') {
    const n = parsePrice(wine.price);
    return n !== 9999 && n <= parseFloat(filterValue);
  }
  if (key === 'ava') {
    const allowed = filterValue.split(',').map((s) => s.trim().toLowerCase());
    return allowed.includes(wine.ava.toLowerCase());
  }
  // Dropdown-selected fields: exact, case-insensitive match against a
  // comma-separated OR list (single selections are a 1-element list). This is
  // what makes "Cabernet Sauvignon" not also match "Cabernet Franc", and lets
  // grouped options (region by state, designation groups) match any member.
  if (EXACT_MATCH_FIELDS.has(key)) {
    const wineValue = ((wine[key as keyof Wine] as string) ?? '').toLowerCase();
    const allowed = filterValue.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    return allowed.includes(wineValue);
  }
  if (key === 'vintageMin') {
    const v = parseInt(wine.vintage);
    return !isNaN(v) && v >= parseInt(filterValue);
  }
  if (key === 'vintageMax') {
    const v = parseInt(wine.vintage);
    return !isNaN(v) && v <= parseInt(filterValue);
  }

  const wineValue = wine[key as keyof Wine] as string;
  if (wineValue === undefined) return false;

  const { operator, value } = parseFilterValue(filterValue);
  switch (key) {
    case 'price':   return compareValues(parsePrice(wineValue), operator, parseFloat(value));
    case 'rating':  return compareValues(parseRating(wineValue), operator, parseFloat(value));
    case 'vintage': return compareValues(parseInt(wineValue) || 0, operator, parseInt(value) || 0);
    case 'publicationDate':
    case 'tastingDate':
      return compareValues(parseDate(wineValue).getTime(), operator, parseDate(value).getTime());
    default:
      return operator === '=' ? wineValue.toLowerCase().includes(value.toLowerCase()) : false;
  }
}

export function getWineDetails(
  wines: Wine[],
  params: { wine_name: string; exact_match?: boolean },
): Wine[] {
  const { wine_name, exact_match = false } = params;
  const search = wine_name.toLowerCase();
  return wines.filter((wine) => {
    const name = wine.wineName.toLowerCase();
    const full = `${wine.brandName} ${wine.wineName}`.toLowerCase();
    return exact_match
      ? name === search || full === search
      : name.includes(search) || full.includes(search);
  });
}
