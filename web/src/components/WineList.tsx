import type { Wine } from '../types';
import WineCard from './WineCard';

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
      <div className="text-center py-16 font-cormorant text-[18px] italic text-muted">
        Searching wines…
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
    <div className="flex flex-col gap-2.5">
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
