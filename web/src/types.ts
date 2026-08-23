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
  /** Varietal label with the variety-style fallback — what the Varietal filter
   *  and the search index match on, so a blend is still findable by its style. */
  mainVarietal: string;
  /** The Varietal Label field alone, blank for blends. Optional: caches and
   *  fixtures written before this field existed don't carry it. */
  varietalLabel?: string;
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
  cases: string;
  stateProvince: string;
  source: string;
  reviewer: string;
}

export function formatPrice(price: string): string {
  if (!price || price === 'N/A') return price;
  const n = parseFloat(price.replace(/[$,]/g, ''));
  return isNaN(n) ? price : `$${price.replace(/^\$/, '')}`;
}

export function numericScore(rating: string): string | null {
  if (!rating || rating.includes('*')) return null;
  const n = parseFloat(rating);
  return isNaN(n) ? null : rating;
}

export interface Meta {
  varietals: string[];
  regions: string[];
  types: string[];
  avaList: string[];
  stateProvinces: string[];
  specialDesignations: string[];
  /** Highest reported case production in the data — the top of the Cases
   *  slider. Optional: an older API build doesn't send it. */
  casesMax?: number;
}
