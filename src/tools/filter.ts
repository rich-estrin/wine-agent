import { z } from 'zod';
import {
  Wine,
  parsePrice,
  parseRating,
  parseDate,
  parseFilterValue,
  compareValues,
} from '../types.js';

export const FilterWinesSchema = z.object({
  filters: z
    .record(z.string())
    .describe(
      'Key-value pairs for filtering. Use column names as keys. For numeric/date columns, use operators like ">90", "<50", ">=2012"'
    ),
  limit: z.number().optional().default(20).describe('Maximum number of results'),
  sort_by: z.string().optional().describe('Column to sort by'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc').describe('Sort direction'),
});

export type FilterWinesParams = z.infer<typeof FilterWinesSchema>;

/**
 * Filter wines by specific criteria
 */
export function filterWines(wines: Wine[], params: FilterWinesParams): Wine[] {
  const { filters, limit, sort_by, sort_order } = params;

  // Apply all filters (AND logic)
  let results = wines.filter((wine) => {
    return Object.entries(filters).every(([key, filterValue]) => {
      return matchesFilter(wine, key, filterValue);
    });
  });

  // Apply sorting if specified
  if (sort_by) {
    results = sortWines(results, sort_by, sort_order);
  }

  // Apply limit
  return results.slice(0, limit);
}

/**
 * Check if a wine matches a single filter criterion
 */
function matchesFilter(wine: Wine, key: string, filterValue: string): boolean {
  // Get the wine's value for this field
  const wineValue = (wine as any)[key];
  if (wineValue === undefined) {
    return false;
  }

  // Parse operator and expected value
  const { operator, value } = parseFilterValue(filterValue);

  // Handle different column types
  switch (key) {
    case 'price': {
      const actualPrice = parsePrice(wineValue);
      const expectedPrice = parseFloat(value);
      return compareValues(actualPrice, operator, expectedPrice);
    }

    case 'rating': {
      const actualRating = parseRating(wineValue);
      const expectedRating = parseFloat(value);
      return compareValues(actualRating, operator, expectedRating);
    }

    case 'vintage': {
      const actualVintage = parseInt(wineValue) || 0;
      const expectedVintage = parseInt(value) || 0;
      return compareValues(actualVintage, operator, expectedVintage);
    }

    case 'publicationDate':
    case 'tastingDate': {
      const actualDate = parseDate(wineValue);
      const expectedDate = parseDate(value);
      return compareValues(actualDate.getTime(), operator, expectedDate.getTime());
    }

    default: {
      // String fields: support partial matching (case-insensitive)
      if (operator === '=') {
        return wineValue.toLowerCase().includes(value.toLowerCase());
      }
      return false;
    }
  }
}

/**
 * Sort wines by a specified column
 */
function sortWines(wines: Wine[], sortBy: string, sortOrder: 'asc' | 'desc'): Wine[] {
  const sorted = [...wines].sort((a, b) => {
    let aVal: any;
    let bVal: any;

    // Get values based on column name
    switch (sortBy) {
      case 'price':
        aVal = parsePrice(a.price);
        bVal = parsePrice(b.price);
        break;
      case 'rating':
        aVal = parseRating(a.rating);
        bVal = parseRating(b.rating);
        break;
      case 'publicationDate':
      case 'tastingDate':
        aVal = parseDate((a as any)[sortBy]).getTime();
        bVal = parseDate((b as any)[sortBy]).getTime();
        break;
      case 'vintage':
        aVal = parseInt(a.vintage) || 0;
        bVal = parseInt(b.vintage) || 0;
        break;
      default:
        // String comparison for other fields
        aVal = ((a as any)[sortBy] || '').toString();
        bVal = ((b as any)[sortBy] || '').toString();
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  return sorted;
}
