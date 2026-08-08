import { fold, foldWords } from './text';

/** Fold a string while recording, for each folded character, the index of the
 *  original character it came from. Needed because folding changes length —
 *  "Sémillon" decomposes to "Sémillon" before the accent is dropped — so
 *  a match found in folded text can't be sliced out of the original directly. */
function foldWithMap(s: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    for (const ch of fold(s[i])) {
      folded += ch;
      map.push(i);
    }
  }
  return { folded, map };
}

/** Character ranges in `text` matching any search term, accent-insensitively.
 *  Overlapping and adjacent hits are merged. */
export function highlightRanges(text: string, terms: string[]): [number, number][] {
  // One-character terms would speckle the whole note; not worth marking.
  const wanted = terms.filter((t) => t.length >= 2);
  if (!text || wanted.length === 0) return [];

  const { folded, map } = foldWithMap(text);
  const hits: [number, number][] = [];

  for (const term of wanted) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at === -1) break;
      hits.push([map[at], map[at + term.length - 1] + 1]);
      from = at + term.length;
    }
  }
  if (hits.length === 0) return [];

  hits.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [hits[0]];
  for (const [start, end] of hits.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** Render `text` with the search terms marked. Falls back to plain text when
 *  there is no query, so it is safe to wrap any field unconditionally. */
export default function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = highlightRanges(text, foldWords(query));
  if (ranges.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        key={i}
        className="rounded-[2px] px-[1px] text-ink"
        style={{ background: 'rgba(184,146,74,0.32)' }}
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
