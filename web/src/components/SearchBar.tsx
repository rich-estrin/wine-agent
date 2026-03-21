import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-gold opacity-70" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search winery, varietal, region…"
        className="w-full pl-10 pr-4 py-2.5 font-cormorant font-light italic text-[15px] text-ink bg-white border border-warm-border rounded-[3px] placeholder-muted/60 focus:outline-none focus:border-gold/60 transition-colors"
      />
    </div>
  );
}
