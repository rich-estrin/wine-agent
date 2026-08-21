import { useState, useEffect, useRef } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

// Long enough that a normal typing rhythm doesn't fire a request per keystroke,
// short enough that pausing feels like the results are keeping up.
const DEBOUNCE_MS = 500;

export default function SearchBar({
  value,
  onSearch,
}: {
  value: string;
  onSearch: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  // Sync when parent clears the query externally
  useEffect(() => {
    if (value === '') setDraft('');
  }, [value]);

  // The search runs itself once typing settles — no Enter needed, and deleting
  // the last character clears the search the same way typing the first one
  // started it. `onSearch` is a setState, so it is safe to leave out of the
  // deps; keying only off the draft is what keeps the timer from restarting on
  // every parent render.
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  useEffect(() => {
    const trimmed = draft.trim();
    if (trimmed === value) return; // already applied — nothing to schedule
    const timer = setTimeout(() => onSearchRef.current(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, value]);

  // Enter still works, and skips the wait.
  const commit = (v: string) => onSearch(v.trim());

  const clear = () => {
    setDraft('');
    onSearch('');
  };

  return (
    <div className="relative">
      <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-gold opacity-70" />
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(draft);
          if (e.key === 'Escape') clear();
        }}
        placeholder="Search winery, varietal, appellation…"
        className="w-full pl-10 pr-8 py-2.5 font-cormorant font-light text-[15px] text-ink bg-white border border-warm-border rounded-[3px] placeholder:italic placeholder-muted/60 focus:outline-none focus:border-gold/60 transition-colors"
      />
      {draft && (
        <button
          onClick={clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
          aria-label="Clear search"
        >
          <XMarkIcon className="h-[14px] w-[14px]" />
        </button>
      )}
    </div>
  );
}
