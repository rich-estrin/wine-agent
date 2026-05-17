import type { Wine } from '../types';
import { numericScore } from '../types';

const TYPE_BADGE: Record<string, { gradient: string; text: string }> = {
  red:        { gradient: 'from-[#4a1520] to-[#7b2d3e]', text: '#ffffff' },
  white:      { gradient: 'from-[#c49a10] to-[#f5d96a]', text: '#2a1a00' },
  'rosé':     { gradient: 'from-[#d4607a] to-[#f8b8ca]', text: '#3a0818' },
  rose:       { gradient: 'from-[#d4607a] to-[#f8b8ca]', text: '#3a0818' },
  orange:     { gradient: 'from-[#7a4520] to-[#b8682a]', text: '#ffffff' },
  sparkling:  { gradient: 'from-[#d4c040] to-[#f8f090]', text: '#2a1a00' },
  dessert:    { gradient: 'from-[#111111] to-[#2a2a2a]', text: '#ffffff' },
  fortified:  { gradient: 'from-[#3d1f0a] to-[#6b3510]', text: '#ffffff' },
};
const DEFAULT_BADGE = { gradient: 'from-[#1a1410] to-[#2d2520]', text: '#ffffff' };

function typeBadge(type: string) {
  return TYPE_BADGE[type?.toLowerCase() ?? ''] ?? DEFAULT_BADGE;
}

function parseStarRating(rating: string): number | null {
  if (!rating || !rating.includes('*')) return null;
  const full = (rating.match(/\*/g) || []).length;
  const half = /½|1\/2/.test(rating) ? 0.5 : 0;
  return full + half;
}

function StarRow({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-[1px] pr-1 pt-1 pl-1">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = i <= count ? 1 : i - 0.5 <= count ? 0.5 : 0;
        const id = `star-${i}-${count}`;
        return (
          <svg key={i} width="14" height="14" viewBox="0 0 24 24">
            {fill === 0.5 && (
              <defs>
                <linearGradient id={id}>
                  <stop offset="50%" stopColor="#FF9900" />
                  <stop offset="50%" stopColor="#FF9900" stopOpacity="0.2" />
                </linearGradient>
              </defs>
            )}
            <path
              d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01z"
              fill={fill === 0.5 ? `url(#${id})` : '#FF9900'}
              fillOpacity={fill === 0 ? 0.18 : 1}
            />
          </svg>
        );
      })}
    </div>
  );
}

export default function WineCard({
  wine,
  onClick,
}: {
  wine: Wine;
  onClick: () => void;
}) {
  const scoreStr = numericScore(wine.rating);
  const starCount = parseStarRating(wine.rating);
  const { gradient, text: badgeText } = typeBadge(wine.type);

  const priceNum = parseFloat((wine.price ?? '').replace(/[^\d.]/g, ''));
  const hasPrice = !isNaN(priceNum) && wine.price !== 'N/A';
  const priceDisplay = hasPrice ? `$${Math.round(priceNum)}` : null;

  // Line 2: varietyStyle · ava · stateProvince
  const metaParts = [wine.varietyStyle, wine.ava, wine.stateProvince].filter(Boolean);

  return (
    <button
      onClick={onClick}
      className={`wine-card-animate w-full text-left bg-white border border-warm-border rounded-[4px] px-4 py-[14px] md:px-5
        grid gap-3 md:gap-4 items-start
        hover:shadow-[0_4px_18px_rgba(26,20,16,0.1)] hover:border-gold/40 hover:-translate-y-px
        transition-all duration-200
        ${starCount !== null
          ? 'grid-cols-[auto_1fr]'
          : 'grid-cols-[46px_1fr] md:grid-cols-[52px_1fr]'}`}
    >
      {/* Score badge or star row */}
      {starCount !== null ? (
        <StarRow count={starCount} />
      ) : (
        <div
          className={`w-[46px] h-[46px] md:w-[52px] md:h-[52px] rounded-[3px] flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${gradient} relative overflow-hidden`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
          {scoreStr ? (
            <span className="font-cormorant text-[21px] md:text-[24px] font-medium leading-none relative z-10" style={{ color: badgeText }}>
              {scoreStr}
            </span>
          ) : (
            <span className="font-cormorant text-[11px] font-light italic relative z-10 px-1 text-center leading-tight" style={{ color: badgeText, opacity: 0.6 }}>
              {wine.rating || '—'}
            </span>
          )}
        </div>
      )}

      {/* Body */}
      <div className="min-w-0">
        {/* Line 1: Winery · Varietal Label · Designation · Vintage + price */}
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <div className="flex items-baseline flex-wrap gap-x-1.5 min-w-0">
            <span className="font-cormorant text-[17px] md:text-[18px] font-semibold text-ink leading-tight">
              {wine.brandName}
            </span>
            {wine.mainVarietal && (
              <span className="font-cormorant text-[16px] md:text-[17px] text-muted leading-tight">
                {wine.mainVarietal}
              </span>
            )}
            {wine.wineName && wine.wineName !== wine.mainVarietal && (
              <span className="font-cormorant text-[16px] md:text-[17px] font-light italic text-[#5a5044] leading-tight">
                {wine.wineName}
              </span>
            )}
            {wine.vintage && (
              <span className="font-cormorant text-[15px] md:text-[16px] font-light text-muted">
                {wine.vintage}
              </span>
            )}
          </div>
          {priceDisplay && (
            <span className="font-cormorant text-[17px] md:text-[18px] font-normal text-ink/80 flex-shrink-0 leading-tight">
              {priceDisplay}
            </span>
          )}
        </div>

        {/* Line 2: Varietal Style · Appellation · State/Province */}
        {metaParts.length > 0 && (
          <div className="flex items-center flex-wrap gap-x-1 mb-1.5">
            {metaParts.map((part, i) => (
              <span key={i} className="text-[11px] text-muted">
                {part}{i < metaParts.length - 1 && <span className="ml-1 opacity-40">·</span>}
              </span>
            ))}
          </div>
        )}

        {/* Review preview */}
        {wine.review && (
          <p className="text-[12px] leading-[1.65] text-[#6a6055] font-light line-clamp-2">
            {wine.review}
          </p>
        )}
      </div>
    </button>
  );
}
