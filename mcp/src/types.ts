/**
 * Wine data structure matching the Google Sheets columns
 */
export interface Wine {
  id: string;
  brandName: string;
  wineName: string;
  ava: string;
  vintage: string;
  price: string; // e.g., "$30"
  rating: string; // e.g., "*** 1/2"
  review: string;
  region: string;
  type: string; // Red, White, Rosé, etc.
  mainVarietal: string; // Pinot Noir, Chardonnay, etc.
  tastingDate: string;
  publicationDate: string;
  setting: string;
  purchasedProvided: string;
  temp: string;
  hyperlink: string;
}

/**
 * Parse price string to number
 * @param priceStr - Price string like "$30" or "$45.99"
 * @returns Numeric price value
 */
export function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/[$,]/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse star rating to numeric value
 * @param ratingStr - Rating string like "***" or "*** 1/2"
 * @returns Numeric rating (e.g., 3.0, 3.5)
 */
export function parseRating(ratingStr: string): number {
  if (!ratingStr) return 0;

  // Count full stars
  const stars = (ratingStr.match(/\*/g) || []).length;

  // Check for half star
  const hasHalf = ratingStr.includes('1/2');

  return stars + (hasHalf ? 0.5 : 0);
}

/**
 * Parse date string to Date object
 * @param dateStr - Date string in various formats (e.g., "12/30/2014")
 * @returns Date object
 */
export function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date(0);

  // Try parsing as-is first
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // If that fails, return epoch
  return new Date(0);
}

/**
 * Compare values with an operator
 * @param actual - Actual value from wine data
 * @param operator - Comparison operator (>, <, >=, <=, =)
 * @param expected - Expected value to compare against
 * @returns True if comparison is satisfied
 */
export function compareValues(
  actual: any,
  operator: string,
  expected: any
): boolean {
  switch (operator) {
    case '>':
      return actual > expected;
    case '<':
      return actual < expected;
    case '>=':
      return actual >= expected;
    case '<=':
      return actual <= expected;
    case '=':
    case '==':
      return actual === expected;
    default:
      return false;
  }
}

/**
 * Extract operator and value from filter string
 * @param filterValue - Filter string like ">90" or "<50"
 * @returns Object with operator and value
 */
export function parseFilterValue(filterValue: string): {
  operator: string;
  value: string;
} {
  const match = filterValue.match(/^([><=]+)(.+)$/);
  if (match) {
    return { operator: match[1], value: match[2].trim() };
  }
  // No operator means exact match
  return { operator: '=', value: filterValue };
}
