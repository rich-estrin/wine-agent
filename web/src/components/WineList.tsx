import type { Wine } from '../types';
import WineCard from './WineCard';

function SkeletonCard() {
  return (
    <div className="w-full bg-white border border-warm-border rounded-[4px] px-4 py-[14px] md:px-5 grid grid-cols-[46px_1fr] md:grid-cols-[52px_1fr] gap-3 md:gap-4 animate-pulse">
      <div className="w-[46px] h-[46px] md:w-[52px] md:h-[52px] rounded-[3px] bg-warm-border/70" />
      <div className="space-y-2.5 py-1">
        <div className="h-[14px] bg-warm-border/70 rounded w-3/5" />
        <div className="h-[11px] bg-warm-border/50 rounded w-2/5" />
      </div>
    </div>
  );
}

export default function WineList({
  wines,
  loading,
  onSelect,
}: {
  wines: Wine[];
  loading: boolean;
  onSelect: (wine: Wine) => void;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-2.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (wines.length === 0) {
    return (
      <div className="text-center py-16 font-cormorant text-[18px] italic text-muted">
        No wines found. Try a different search or adjust your filters.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2.5">
      {wines.map((wine) => (
        <WineCard
          key={`${wine.id}-${wine.wineName}`}
          wine={wine}
          onClick={() => onSelect(wine)}
        />
      ))}
    </div>
  );
}
