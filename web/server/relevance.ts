import type { Wine } from '../src/types.js';
import { fold, foldWords } from '../src/lib/text.js';

// Where a term matched decides how much it counts. A whole-word hit on the
// winery name is the strongest signal there is; a fragment buried mid-word in a
// tasting note is the weakest thing we still call a match.
//
// The bottom `sub` tier is deliberate: it keeps every result that the old
// plain-substring search returned, just ranked beneath the real hits. That is
// what stops a search for "Kiona" burying the Kiona winery under wines merely
// made from Kiona Vineyard fruit, without dropping tasting-note matches.
const FIELD_TIERS: { field: keyof Wine; whole: number; prefix: number; sub: number }[] = [
  { field: 'brandName',    whole: 100, prefix: 80, sub: 4 },
  { field: 'wineName',     whole: 60,  prefix: 45, sub: 3 },
  { field: 'mainVarietal', whole: 60,  prefix: 45, sub: 3 },
  { field: 'varietyStyle', whole: 55,  prefix: 40, sub: 3 },
  { field: 'ava',          whole: 40,  prefix: 30, sub: 2 },
  { field: 'region',       whole: 40,  prefix: 30, sub: 2 },
  { field: 'vintage',      whole: 40,  prefix: 30, sub: 2 },
  { field: 'review',       whole: 10,  prefix: 6,  sub: 2 },
];

interface FoldedWine {
  text: string[];    // folded field text, parallel to FIELD_TIERS
  words: string[][]; // folded field words, parallel to FIELD_TIERS
}

// Folding 3,000+ rows on every keystroke would be wasteful, so each wine is
// folded once and remembered. A WeakMap keyed on the wine object means webhook
// upserts (which replace the object) invalidate their own entry for free.
const foldCache = new WeakMap<Wine, FoldedWine>();

function foldWine(wine: Wine): FoldedWine {
  const cached = foldCache.get(wine);
  if (cached) return cached;

  const entry: FoldedWine = { text: [], words: [] };
  for (const { field } of FIELD_TIERS) {
    const raw = (wine[field] as string) ?? '';
    entry.text.push(fold(raw));
    entry.words.push(foldWords(raw));
  }
  foldCache.set(wine, entry);
  return entry;
}

/** Split a raw query into folded terms. */
export function queryTerms(query: string): string[] {
  return foldWords(query);
}

/** Score one wine against pre-folded query terms.
 *  Returns null when any term matches nowhere — preserving the AND semantics
 *  the search has always had. Otherwise returns the summed best-field score. */
export function scoreWine(wine: Wine, terms: string[]): number | null {
  if (terms.length === 0) return 0;
  const folded = foldWine(wine);
  let total = 0;

  for (const term of terms) {
    let best = 0;
    for (let i = 0; i < FIELD_TIERS.length; i++) {
      const tier = FIELD_TIERS[i];
      // Only the best tier for this field can beat what we already have.
      if (tier.whole <= best) continue;

      const words = folded.words[i];
      if (words.includes(term)) {
        best = tier.whole;
        continue;
      }
      if (tier.prefix > best && words.some((w) => w.startsWith(term))) {
        best = tier.prefix;
        continue;
      }
      if (tier.sub > best && folded.text[i].includes(term)) {
        best = tier.sub;
      }
    }
    if (best === 0) return null; // this term matched nothing — wine is out
    total += best;
  }

  return total;
}
