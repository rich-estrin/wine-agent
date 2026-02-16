import { StarIcon } from '@heroicons/react/24/solid';
import { StarIcon as StarOutline } from '@heroicons/react/24/outline';

function parseRating(ratingStr: string): number {
  if (!ratingStr) return 0;
  const stars = (ratingStr.match(/\*/g) || []).length;
  const hasHalf = ratingStr.includes('1/2');
  return stars + (hasHalf ? 0.5 : 0);
}

export default function RatingDisplay({
  rating,
  size = 'sm',
}: {
  rating: string;
  size?: 'sm' | 'lg';
}) {
  const numericRating = parseRating(rating);
  const fullStars = Math.floor(numericRating);
  const hasHalf = numericRating % 1 !== 0;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  const iconClass = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: fullStars }).map((_, i) => (
        <StarIcon key={`full-${i}`} className={`${iconClass} text-amber-500`} />
      ))}
      {hasHalf && (
        <div className="relative">
          <StarOutline className={`${iconClass} text-amber-500`} />
          <div className="absolute inset-0 overflow-hidden w-1/2">
            <StarIcon className={`${iconClass} text-amber-500`} />
          </div>
        </div>
      )}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <StarOutline
          key={`empty-${i}`}
          className={`${iconClass} text-gray-300`}
        />
      ))}
      {size === 'lg' && (
        <span className="ml-1 text-sm text-gray-500">{rating}</span>
      )}
    </div>
  );
}
