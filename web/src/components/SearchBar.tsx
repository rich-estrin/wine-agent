import { useState, useEffect, useRef, useId } from 'react';
import { XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import type { SearchScope } from './Sidebar';

// Long enough that a normal typing rhythm doesn't fire a request per keystroke,
// short enough that pausing feels like the results are keeping up.
const DEBOUNCE_MS = 500;

// What the pill in the field says. Phones get the short form: the pill shares
// a narrow field with the query.
const PILL_LABEL: Record<SearchScope, { long: string; short: string }> = {
  '': { long: 'Default', short: 'Default' },
  notes: { long: 'Default + tasting notes', short: 'Default+' },
  winery: { long: 'Winery names only', short: 'Wineries' },
};

export default function SearchBar({
  value,
  onSearch,
  scope,
  onScopeChange,
}: {
  value: string;
  onSearch: (value: string) => void;
  scope: SearchScope;
  onScopeChange: (scope: SearchScope) => void;
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
      {/* The wrapper draws the field; the input inside is stripped of every
          border and shadow, because a host theme styles bare inputs and would
          otherwise draw a second box around the text. */}
      <div className="flex items-center bg-white border border-warm-border rounded-[3px] focus-within:border-gold/60 transition-colors">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(draft);
            if (e.key === 'Escape') clear();
          }}
          placeholder="Search winery, varietal, appellation…"
          aria-label="Search"
          className="flex-1 min-w-0 pl-3.5 pr-2 py-2.5 font-cormorant font-light text-[15px] text-ink placeholder:italic placeholder-muted/60 !bg-transparent !border-0 !rounded-none !shadow-none !h-auto !m-0 focus:!outline-none focus:!shadow-none"
        />
        {draft && (
          <button
            onClick={clear}
            className="flex-shrink-0 px-1.5 py-2 text-muted hover:text-ink transition-colors"
            aria-label="Clear search"
          >
            <XMarkIcon className="h-[14px] w-[14px]" />
          </button>
        )}
        <ScopeMenu scope={scope} onChange={onScopeChange} />
      </div>
    </div>
  );
}

/** The pill at the end of the search field and the popover it opens: two
 *  radios — the default fields, or the winery name alone — with "Include
 *  tasting notes" nested under the first, since it only widens the default. */
function ScopeMenu({
  scope,
  onChange,
}: {
  scope: SearchScope;
  onChange: (scope: SearchScope) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const name = useId();
  const winery = scope === 'winery';
  const label = PILL_LABEL[scope];

  // Close on an outside press or Escape.
  useEffect(() => {
    if (!open) return;
    const onPress = (e: MouseEvent | TouchEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPress);
    document.addEventListener('touchstart', onPress);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPress);
      document.removeEventListener('touchstart', onPress);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative flex-shrink-0 mr-1.5" data-testid="search-scope">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Search in: ${label.long}`}
        data-testid="search-scope-pill"
        className={`inline-flex items-center gap-1.5 !h-9 !m-0 px-3 rounded-full border border-wine text-[11px] focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-wine font-semibold tracking-[0.03em] whitespace-nowrap transition-colors ${
          open ? 'bg-wine text-parchment' : 'bg-[rgba(123,45,62,0.08)] text-wine hover:bg-[rgba(123,45,62,0.14)]'
        }`}
      >
        <span className="hidden sm:inline">{label.long}</span>
        <span className="sm:hidden">{label.short}</span>
        <ChevronDownIcon className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="group"
          aria-label="Search in"
          className="absolute right-0 w-[22rem] max-w-[calc(100vw-2.5rem)] top-full mt-2 z-30 bg-white border border-warm-border rounded-[6px] p-2 shadow-[0_12px_28px_rgba(26,20,16,0.18)]"
        >
          <div className={`rounded-[4px] pb-2 ${winery ? '' : 'bg-[#f1e7d3]'}`}>
            <label className="flex items-start gap-3 px-3 pt-3 pb-1.5 cursor-pointer">
              <input
                type="radio"
                name={name}
                checked={!winery}
                onChange={() => onChange('')}
                className="mt-0.5 w-5 h-5 accent-wine flex-shrink-0"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-semibold text-ink">Default</span>
                <span className="text-[12px] text-muted">Name, winery, appellation, varietal</span>
              </span>
            </label>
            <label
              className={`flex items-center gap-3 ml-11 pr-3 min-h-[44px] ${
                winery ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={scope === 'notes'}
                disabled={winery}
                onChange={(e) => onChange(e.target.checked ? 'notes' : '')}
                className="w-[18px] h-[18px] accent-wine flex-shrink-0"
              />
              <span className="text-[13px] text-ink">Include tasting notes</span>
            </label>
          </div>
          <label
            className={`flex items-center gap-3 mt-1 px-3 min-h-[44px] rounded-[4px] cursor-pointer ${
              winery ? 'bg-[#f1e7d3]' : ''
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={winery}
              onChange={() => onChange('winery')}
              className="w-5 h-5 accent-wine flex-shrink-0"
            />
            <span className="text-[14px] font-semibold text-ink">Winery name only</span>
          </label>
        </div>
      )}
    </div>
  );
}
