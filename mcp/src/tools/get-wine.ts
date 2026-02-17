import { z } from 'zod';
import { Wine } from '../types.js';

export const GetWineDetailsSchema = z.object({
  wine_name: z.string().describe('Name or partial name of the wine to find'),
  exact_match: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, requires exact match. If false, allows partial matches'),
});

export type GetWineDetailsParams = z.infer<typeof GetWineDetailsSchema>;

/**
 * Get detailed information about a specific wine
 */
export function getWineDetails(wines: Wine[], params: GetWineDetailsParams): Wine[] {
  const { wine_name, exact_match } = params;
  const searchLower = wine_name.toLowerCase();

  const results = wines.filter((wine) => {
    const wineName = wine.wineName.toLowerCase();
    const fullName = `${wine.brandName} ${wine.wineName}`.toLowerCase();

    if (exact_match) {
      return wineName === searchLower || fullName === searchLower;
    } else {
      // Partial match
      return wineName.includes(searchLower) || fullName.includes(searchLower);
    }
  });

  return results;
}
