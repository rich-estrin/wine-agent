import type { Wine } from '../src/types.js';

/** Numeric price, or null when the wine has no usable price. The importer
 *  collapses empty, "NA" and "0" to "N/A" (see mapWPReview), so all three land
 *  here as null rather than as a sentinel number that would sort like a real
 *  price. */
export function parsePriceOrNull(priceStr: string): number | null {
  if (!priceStr) return null;
  const trimmed = priceStr.trim();
  if (trimmed === 'N/A' || trimmed === 'NA' || trimmed === '0') return null;
  const parsed = parseFloat(trimmed.replace(/[$,]/g, ''));
  return isNaN(parsed) ? null : parsed;
}

/** Numeric rating, or null when the wine is unrated. Star ratings come back on
 *  a 0–5 scale and point scores on their own scale — see the open question
 *  about sorting the two together. */
export function parseRatingOrNull(ratingStr: string): number | null {
  if (!ratingStr) return null;
  const numeric = parseFloat(ratingStr);
  if (!isNaN(numeric) && !ratingStr.includes('*')) return numeric;
  const stars = (ratingStr.match(/\*/g) || []).length;
  if (stars === 0) return null;
  return stars + (ratingStr.includes('1/2') || ratingStr.includes('½') ? 0.5 : 0);
}

export function parseVintageOrNull(vintageStr: string): number | null {
  const v = parseInt((vintageStr ?? '').trim(), 10);
  return isNaN(v) ? null : v;
}

export function parseDateOrNull(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.getTime();
}

/** Midnight UTC of the calendar day a date string names, or null when it names
 *  none. Sorting by review date compares the published *day*: two reviews that
 *  went out the same morning are a tie to be broken by rating, however many
 *  minutes apart their timestamps happen to be. The ISO prefix is read
 *  literally rather than through Date, whose handling of "2025-06-15" and
 *  "2025-06-15 09:30" differs by a timezone offset. */
export function parseDayOrNull(dateStr: string): number | null {
  if (!dateStr) return null;
  const iso = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseFilterValue(filterValue: string): { operator: string; value: string } {
  const match = filterValue.match(/^([><=]+)(.+)$/);
  if (match) return { operator: match[1], value: match[2].trim() };
  return { operator: '=', value: filterValue };
}

export function compareValues(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case '>':  return (actual as number) > (expected as number);
    case '<':  return (actual as number) < (expected as number);
    case '>=': return (actual as number) >= (expected as number);
    case '<=': return (actual as number) <= (expected as number);
    case '=':
    case '==': return actual === expected;
    default:   return false;
  }
}

/** The sortable value for a wine, or null when it has none. */
function sortValue(wine: Wine, sortBy: string): number | string | null {
  switch (sortBy) {
    case 'price':   return parsePriceOrNull(wine.price);
    case 'rating':  return parseRatingOrNull(wine.rating);
    case 'vintage': return parseVintageOrNull(wine.vintage);
    // Day granularity, so same-day reviews tie and fall through to the
    // rating tiebreak below rather than being ordered by their timestamps.
    case 'publicationDate': return parseDayOrNull(wine.publicationDate);
    case 'tastingDate':     return parseDateOrNull(wine.tastingDate);
    default: {
      const v = (wine[sortBy as keyof Wine] as string) ?? '';
      return v === '' ? null : v;
    }
  }
}

export function sortWines(
  wines: Wine[],
  sortBy: string,
  sortOrder: 'asc' | 'desc' = 'desc',
): Wine[] {
  return [...wines].sort((a, b) => {
    const aVal = sortValue(a, sortBy);
    const bVal = sortValue(b, sortBy);

    // Wines with no value sort last in BOTH directions — a wine with no price
    // is not the cheapest wine on "Lowest" nor the priciest on "Highest".
    if (aVal === null || bVal === null) {
      if (aVal === bVal) return 0;
      return aVal === null ? 1 : -1;
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return tieBreak(a, b, sortBy);
  });
}

/** Order two wines the primary sort could not separate. Only review date has
 *  one: a day's reviews are published as a batch, so leaving them in export
 *  order buried the day's best wine in the middle of it. Highest score first,
 *  in both directions — "Lowest" asks for the oldest reviews, not for the
 *  worst wine of the day — and unrated wines last, as everywhere else. */
function tieBreak(a: Wine, b: Wine, sortBy: string): number {
  if (sortBy !== 'publicationDate') return 0;
  const aRating = parseRatingOrNull(a.rating);
  const bRating = parseRatingOrNull(b.rating);
  if (aRating === null || bRating === null) {
    if (aRating === bRating) return 0;
    return aRating === null ? 1 : -1;
  }
  return bRating - aRating;
}
