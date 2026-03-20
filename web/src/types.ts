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
  tastingDate: string;
  publicationDate: string;
  setting: string;
  purchasedProvided: string;
  temp: string;
  hyperlink: string;
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
}
