import { useState, useEffect, useRef, useId } from 'react';
import { ChevronDownIcon, CheckIcon } from '@heroicons/react/24/outline';

export const SORT_OPTIONS = [
  { value: 'rating', label: 'Rating' },
  { value: 'price', label: 'Price' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'publicationDate', label: 'Review Date' },
];

/** The sort picker. A native <select> opens the OS menu, which ignores the
 *  theme, so this draws its own list in the same style as the scope popover.
 *  `align="right"` opens the list from the right edge, for the narrow row where
 *  the control sits against the viewport's right side. */
export default function SortMenu({
  value,
  onChange,
  align = 'left',
  buttonClassName = '',
}: {
  value: string;
  onChange: (value: string) => void;
  align?: 'left' | 'right';
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0];

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPress = (e: MouseEvent | TouchEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPress);
    document.addEventListener('touchstart', onPress);
    // Land on the selected option so arrow keys start from it.
    root.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onPress);
      document.removeEventListener('touchstart', onPress);
    };
  }, [open]);

  const onListKey = (e: React.KeyboardEvent) => {
    const items = Array.from(
      root.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
    );
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[Math.min(i + 1, items.length - 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[Math.max(i - 1, 0)]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={root} className="relative flex" data-testid="sort-menu">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Sort by: ${current.label}`}
        data-testid="sort-menu-button"
        data-value={current.value}
        className={`inline-flex items-center justify-between gap-3 !h-auto !m-0 ${buttonClassName} pl-3.5 pr-3 text-[12px] font-medium text-ink bg-white border border-warm-border rounded-[3px] cursor-pointer whitespace-nowrap focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-wine`}
      >
        {current.label}
        <ChevronDownIcon className={`w-3 h-3 stroke-[3] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Sort by"
          onKeyDown={onListKey}
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} min-w-full top-full mt-2 z-30 bg-white border border-warm-border rounded-[6px] p-1.5 shadow-[0_12px_28px_rgba(26,20,16,0.18)]`}
        >
          {SORT_OPTIONS.map((o) => {
            const selected = o.value === value;
            return (
              <div
                key={o.value}
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                data-value={o.value}
                onClick={() => {
                  onChange(o.value);
                  close(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onChange(o.value);
                    close(true);
                  }
                }}
                className={`flex items-center justify-between gap-4 px-3 min-h-[36px] rounded-[4px] text-[13px] text-ink cursor-pointer whitespace-nowrap outline-none hover:bg-[#f1efeb] focus-visible:bg-[#f1efeb] ${
                  selected ? 'bg-[#f1efeb] font-semibold' : ''
                }`}
              >
                {o.label}
                {selected && <CheckIcon className="w-3.5 h-3.5 stroke-[2.5] text-wine" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
