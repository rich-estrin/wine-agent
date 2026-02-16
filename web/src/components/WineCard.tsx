import type { Wine } from '../types';
import RatingDisplay from './RatingDisplay';

export default function WineCard({
  wine,
  onClick,
}: {
  wine: Wine;
  onClick: () => void;
}) {
  const reviewTeaser =
    wine.review.length > 120
      ? wine.review.slice(0, 120) + '...'
      : wine.review;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            {wine.brandName}
          </p>
          <h3 className="text-base font-semibold text-gray-900 truncate">
            {wine.wineName}
          </h3>
          <p className="text-sm text-gray-600 mt-0.5">
            {[wine.mainVarietal, wine.region, wine.vintage]
              .filter(Boolean)
              .join(' \u00b7 ')}
          </p>
        </div>
        <div className="text-right shrink-0">
          {wine.price && wine.price !== 'NA' && wine.price !== '$NA' && (
            <p className="text-base font-semibold text-gray-900">
              {wine.price}
            </p>
          )}
          <RatingDisplay rating={wine.rating} />
        </div>
      </div>
      {reviewTeaser && (
        <p className="mt-2 text-sm text-gray-500 line-clamp-2">
          {reviewTeaser}
        </p>
      )}
    </button>
  );
}
