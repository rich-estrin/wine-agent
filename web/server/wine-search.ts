import type { Wine } from '../src/types.js';
import {
  parsePriceOrNull, parseRatingOrNull, parseVintageOrNull, parseDateOrNull, parseCasesOrNull,
  parseFilterValue, compareValues, sortWines,
} from './wine-utils.js';
import { fold, foldWords, foldSearchWords } from '../src/lib/text.js';

// Fields populated from single-select dropdowns / grouped trees. These match
// exactly (case-insensitive) against a comma-separated OR list rather than by
// substring, fixing e.g. varietal "Ca" matching every Cabernet.
const EXACT_MATCH_FIELDS = new Set(['mainVarietal', 'type', 'region', 'stateProvince', 'specialDesignation']);

// What the search box looks at, and nothing else. Producer and vintage are what
// people type; the full wine name catches the rest. Varietal is here because a
// wine named "Estate Red" is still a Tempranillo, and nothing in its name says
// so. The appellation is here because readers type one ("Goose Gap") expecting
// the wines from it, and the Appellation filter is buried under Advanced. The
// tasting note is deliberately absent — matching prose turned a search for a
// winery into a list of every review that happened to mention it.
const SEARCH_FIELDS: (keyof Wine)[] = ['brandName', 'vintage', 'wineName', 'mainVarietal', 'ava'];

// Folding 3,000+ rows on every keystroke would be wasteful, so each wine's
// searchable words are computed once and remembered. A WeakMap keyed on the
// wine object means webhook upserts (which replace the object) invalidate their
// own entry for free.
const wordCache = new WeakMap<Wine, string[]>();

function searchWords(wine: Wine): string[] {
  const cached = wordCache.get(wine);
  if (cached) return cached;
  const words = SEARCH_FIELDS.flatMap((field) => foldSearchWords((wine[field] as string) ?? ''));
  wordCache.set(wine, words);
  return words;
}

/** True when every query term begins a word in one of the search fields.
 *  Prefix, not substring: "gard" finds "Gård Vintners" but not "garden", and
 *  all terms must match somewhere (AND), though not in the same field.
 *  The indexed words include apostrophe elisions, so "lecole" finds "L'Ecole". */
function matchesQuery(wine: Wine, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const words = searchWords(wine);
  return terms.every((term) => words.some((w) => w.startsWith(term)));
}

/** Full-text search over producer, vintage, wine name, varietal and appellation.
 *  Matching only — the caller decides the order. */
export function searchWines(
  wines: Wine[],
  params: { query: string; limit?: number; sort_by?: string; sort_order?: 'asc' | 'desc' },
): Wine[] {
  const { query, limit = 20, sort_by, sort_order = 'desc' } = params;
  const terms = foldWords(query);

  let results = wines.filter((wine) => matchesQuery(wine, terms));
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
  if (key === 'casesMin') {
    const n = parseCasesOrNull(wine.cases);
    return n !== null && n >= parseFloat(filterValue);
  }
  if (key === 'casesMax') {
    const n = parseCasesOrNull(wine.cases);
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
    case 'cases': {
      const n = parseCasesOrNull(wineValue);
      return n !== null && compareValues(n, operator, parseInt(value) || 0);
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
