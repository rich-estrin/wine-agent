/**
 * Wine data structure matching the Google Sheets columns
 */
export interface Wine {
    id: string;
    brandName: string;
    wineName: string;
    ava: string;
    vintage: string;
    price: string;
    rating: string;
    review: string;
    region: string;
    type: string;
    mainVarietal: string;
    varietyStyle: string;
    tastingDate: string;
    publicationDate: string;
    setting: string;
    purchasedProvided: string;
    temp: string;
    hyperlink: string;
    specialDesignation: string;
    alcohol: string;
    closure: string;
    stateProvince: string;
    source: string;
    reviewer: string;
}
/**
 * Parse price string to number
 * @param priceStr - Price string like "$30" or "$45.99"
 * @returns Numeric price value (9999 for N/A prices)
 */
export declare function parsePrice(priceStr: string): number;
/**
 * Parse star rating to numeric value
 * @param ratingStr - Rating string like "***" or "*** 1/2"
 * @returns Numeric rating (e.g., 3.0, 3.5)
 */
export declare function parseRating(ratingStr: string): number;
/**
 * Parse date string to Date object
 * @param dateStr - Date string in various formats (e.g., "12/30/2014")
 * @returns Date object
 */
export declare function parseDate(dateStr: string): Date;
/**
 * Compare values with an operator
 * @param actual - Actual value from wine data
 * @param operator - Comparison operator (>, <, >=, <=, =)
 * @param expected - Expected value to compare against
 * @returns True if comparison is satisfied
 */
export declare function compareValues(actual: any, operator: string, expected: any): boolean;
/**
 * Extract operator and value from filter string
 * @param filterValue - Filter string like ">90" or "<50"
 * @returns Object with operator and value
 */
export declare function parseFilterValue(filterValue: string): {
    operator: string;
    value: string;
};
//# sourceMappingURL=types.d.ts.map