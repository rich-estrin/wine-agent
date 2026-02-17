import { z } from 'zod';
import { Wine, parsePrice, parseRating, parseDate } from '../types.js';

export const SearchWinesSchema = z.object({
  query: z.string().describe('Search term(s) to find in wine data'),
  limit: z.number().optional().default(20).describe('Maximum number of results to return'),
  sort_by: z.string().optional().describe('Column to sort by (e.g., rating, price, vintage)'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc').describe('Sort direction'),
});

export type SearchWinesParams = z.infer<typeof SearchWinesSchema>;

/**
 * Search wines by full-text query across searchable fields
 */
export function searchWines(wines: Wine[], params: SearchWinesParams): Wine[] {
  const { query, limit, sort_by, sort_order } = params;

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 0);

  // Filter wines that match the search query
  let results = wines.filter((wine) => {
    // Searchable fields
    const searchableText = [
      wine.wineName,
      wine.brandName,
      wine.review,
      wine.ava,
      wine.region,
      wine.mainVarietal,
    ]
      .join(' ')
      .toLowerCase();

    // All query words must appear somewhere in the searchable text
    return queryWords.every((word) => searchableText.includes(word));
  });

  // Apply sorting if specified
  if (sort_by) {
    results = sortWines(results, sort_by, sort_order);
  }

  // Apply limit
  return results.slice(0, limit);
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
