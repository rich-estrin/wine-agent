import type { Wine } from '../types';
import { numericScore } from '../types';

function scoreBadgeGradient(score: number | null): string {
  if (score === null) return 'from-[#1a1410] to-[#2d2520]';
  if (score >= 95) return 'from-[#57192a] to-[#7b2d3e]';
  if (score >= 92) return 'from-[#283a50] to-[#3b5570]';
  if (score >= 88) return 'from-[#3a2a18] to-[#5c4225]';
  return 'from-[#1e1812] to-[#2d2822]';
}

function PriceDisplay({ price }: { price: string }) {
  if (!price || price === 'N/A') {
    return <span className="text-sm text-muted">N/A</span>;
  }
  const stripped = price.replace(/[^\d.]/g, '');
  const num = parseFloat(stripped);
  if (isNaN(num)) return <span className="text-sm text-muted">{price}</span>;
  return (
    <span className="font-cormorant text-[22px] font-normal text-ink tracking-tight leading-none">
      <span className="text-[22px] font-light text-muted">$</span>
      {Math.round(num)}
    </span>
  );
}

export default function WineCard({
  wine,
  onClick,
}: {
  wine: Wine;
  onClick: () => void;
}) {
  const scoreStr = numericScore(wine.rating); // e.g. "92" or null
  const scoreNum = scoreStr ? parseInt(scoreStr, 10) : null;
  const gradient = scoreBadgeGradient(scoreNum);

  return (
    <button
      onClick={onClick}
      className="wine-card-animate w-full text-left bg-white border border-warm-border rounded-[4px] px-4 py-[18px] md:px-5
        grid grid-cols-[46px_1fr] md:grid-cols-[52px_1fr_auto] gap-3 md:gap-4 items-start
        hover:shadow-[0_4px_18px_rgba(26,20,16,0.1)] hover:border-gold/40 hover:-translate-y-px
        transition-all duration-200"
    >
      {/* Score badge */}
      <div
        className={`w-[46px] h-[46px] md:w-[52px] md:h-[52px] rounded-[3px] flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${gradient} relative overflow-hidden`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
        {scoreStr ? (
          <span className="font-cormorant text-[21px] md:text-[24px] font-medium text-white leading-none relative z-10">
            {scoreStr}
          </span>
        ) : (
          <span className="font-cormorant text-[13px] font-light italic text-parchment/60 relative z-10 px-1 text-center leading-tight">
            {wine.rating || '—'}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="min-w-0">
        {/* Winery + wine name + vintage */}
        <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-0 mb-1">
          <span className="font-cormorant text-[17px] md:text-[18px] font-medium text-ink leading-tight">
            {wine.brandName}
          </span>
          {wine.wineName && (
            <span className="font-cormorant text-[17px] md:text-[18px] font-light italic text-[#3d3028] leading-tight">
              {wine.wineName}
            </span>
          )}
          {wine.vintage && (
            <span className="font-cormorant text-[17px] md:text-[18px] font-light text-muted">
              {wine.vintage}
            </span>
          )}
        </div>

        {/* Meta row: varietal pill + region */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {wine.mainVarietal && (
            <span className="text-[10px] font-medium tracking-[0.07em] uppercase text-[#7b2d3e] bg-[rgba(123,45,62,0.07)] border border-[rgba(123,45,62,0.18)] px-2 py-[2px] rounded-full">
              {wine.mainVarietal}
            </span>
          )}
          {wine.ava && (
            <span className="text-[12px] text-muted">{wine.ava}</span>
          )}
          {/* Mobile price inline */}
          {wine.price && wine.price !== 'N/A' && (
            <span className="md:hidden font-cormorant text-[15px] font-normal text-ink/70 ml-auto">
              {wine.price}
            </span>
          )}
        </div>

        {/* Review */}
        {wine.review && (
          <p className="text-[13px] leading-[1.65] text-[#5a5044] font-light">
            {wine.review}
          </p>
        )}
      </div>

      {/* Price column — desktop only */}
      <div className="hidden md:flex flex-col items-end pt-0.5 flex-shrink-0">
        <PriceDisplay price={wine.price} />
      </div>
    </button>
  );
}
