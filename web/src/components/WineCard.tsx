import type { Wine } from '../types';
import { formatPrice, numericScore } from '../types';
import RatingDisplay from './RatingDisplay';

export default function WineCard({
  wine,
  onClick,
}: {
  wine: Wine;
  onClick: () => void;
}) {

  const score = numericScore(wine.rating);

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all"
    >
      <div className="flex items-start gap-3">
        {/* Score badge */}
        {score && (
          <div className="shrink-0 flex items-center justify-center rounded w-14 h-14 bg-[#141617]">
            <span className="text-2xl font-bold text-[#deb77d] leading-none">{score}</span>
          </div>
        )}

        {/* Wine info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-base text-gray-900 truncate">
            <span className="font-semibold">{wine.brandName}</span>
            {wine.wineName && <span className="font-normal text-gray-600"> {wine.wineName}</span>}
            {wine.vintage && <span className="font-normal text-gray-400"> {wine.vintage}</span>}
          </h3>
          <p className="text-sm text-gray-600 mt-0.5">
            {[wine.mainVarietal, wine.ava]
              .filter(Boolean)
              .join(' \u00b7 ')}
          </p>
        </div>

        {/* Price + stars */}
        <div className="text-right shrink-0">
          <p className="text-base font-semibold text-gray-900">
            {formatPrice(wine.price)}
          </p>
          {!score && <RatingDisplay rating={wine.rating} />}
        </div>
      </div>
      {wine.review && (
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          {wine.review}
        </p>
      )}
    </button>
  );
}
