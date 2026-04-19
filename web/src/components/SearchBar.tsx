import { useState, useEffect } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

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
        placeholder="Search winery, varietal, vintage… (press Enter)"
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
