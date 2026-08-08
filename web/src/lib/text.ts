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

/** True when `haystack` contains `needle` ignoring case and accents. Use for
 *  the "filter this list as I type" boxes, not for ranked search. */
export function foldIncludes(haystack: string, needle: string): boolean {
  return fold(haystack).includes(fold(needle));
}
