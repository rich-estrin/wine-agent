import type { Wine } from '../src/types.js';

export function parsePrice(priceStr: string): number {
  if (!priceStr) return 9999;
  const trimmed = priceStr.trim();
  if (trimmed === 'N/A' || trimmed === 'NA' || trimmed === '0') return 9999;
  const parsed = parseFloat(trimmed.replace(/[$,]/g, ''));
  return isNaN(parsed) ? 9999 : parsed;
}

export function parseRating(ratingStr: string): number {
  if (!ratingStr) return 0;
  const numeric = parseFloat(ratingStr);
  if (!isNaN(numeric) && !ratingStr.includes('*')) return numeric;
  const stars = (ratingStr.match(/\*/g) || []).length;
  return stars + (ratingStr.includes('1/2') ? 0.5 : 0);
}

export function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date(0);
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date(0) : d;
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

export function sortWines(
  wines: Wine[],
  sortBy: string,
  sortOrder: 'asc' | 'desc' = 'desc',
): Wine[] {
  return [...wines].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;
    switch (sortBy) {
      case 'price':
        aVal = parsePrice(a.price); bVal = parsePrice(b.price); break;
      case 'rating':
        aVal = parseRating(a.rating); bVal = parseRating(b.rating); break;
      case 'publicationDate':
      case 'tastingDate':
        aVal = parseDate(a[sortBy as keyof Wine] as string).getTime();
        bVal = parseDate(b[sortBy as keyof Wine] as string).getTime();
        break;
      case 'vintage':
        aVal = parseInt(a.vintage) || 0; bVal = parseInt(b.vintage) || 0; break;
      default:
        aVal = (a[sortBy as keyof Wine] as string) || '';
        bVal = (b[sortBy as keyof Wine] as string) || '';
    }
    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });
}
