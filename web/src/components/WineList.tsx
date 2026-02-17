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
      <div className="text-center py-12 text-gray-500">
        Searching wines...
      </div>
    );
  }

  if (wines.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        No wines found. Try a different search or adjust your filters.
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-3">
        Showing {wines.length} wine{wines.length !== 1 ? 's' : ''}
      </p>
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        {wines.map((wine) => (
          <WineCard
            key={`${wine.id}-${wine.wineName}`}
            wine={wine}
            onClick={() => onSelect(wine)}
          />
        ))}
      </div>
    </div>
  );
}
