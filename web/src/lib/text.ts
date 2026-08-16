/** Case- and accent-insensitive folding, shared by the server search and every
 *  client-side filter box so "Ita" finds "Itä" and "Gard" finds "Gård"
 *  everywhere text is compared. Decomposes to NFD, drops combining marks, then
 *  lowercases — "Sémillon" and "Semillon" both fold to "semillon". */
export function fold(s: string): string {
  return (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Split a folded string into comparable words. Punctuation and hyphens are
 *  separators, so "Rhône-Style" yields ["rhone", "style"] and a search for
 *  "rhone" matches it as a whole word rather than a mid-word fragment. */
export function foldWords(s: string): string[] {
  return fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

// Both apostrophes occur in the export — "L'Ecole No. 41" and "L’Ecole No. 41"
// are the same producer, spelled with an ASCII quote and a typographic one.
// Separate literals: a /g/ regex carries lastIndex between .test() calls.
const HAS_APOSTROPHE = /['’]/;
const APOSTROPHES = /['’]/g;
// Word characters plus the apostrophes, so a compound survives the split intact.
const NON_WORD = /[^\p{L}\p{N}'’]+/u;

/** `foldWords`, plus the elided form of any apostrophe compound: "L'Ecole"
 *  yields "l", "ecole" *and* "lecole", so a reader who types the name without
 *  the punctuation still finds it. The split words are kept, so "ecole" goes on
 *  matching — the elision is an extra key, never a replacement.
 *
 *  For indexing the searchable side only. Query terms stay on `foldWords`:
 *  typing "colter's" already splits into words the index holds. */
export function foldSearchWords(s: string): string[] {
  const words = foldWords(s);
  const elided = fold(s)
    .split(NON_WORD)
    .filter((token) => HAS_APOSTROPHE.test(token))
    .map((token) => token.replace(APOSTROPHES, ''))
    .filter(Boolean);
  return elided.length > 0 ? [...words, ...elided] : words;
}

/** True when `haystack` contains `needle` ignoring case and accents. Use for
 *  the "filter this list as I type" boxes, not for ranked search. */
export function foldIncludes(haystack: string, needle: string): boolean {
  return fold(haystack).includes(fold(needle));
}
