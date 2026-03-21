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
  const scoreStr = numericScore(wine.rating);
  const { gradient, text: badgeText } = typeBadge(wine.type);

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
          <span className="font-cormorant text-[21px] md:text-[24px] font-medium leading-none relative z-10" style={{ color: badgeText }}>
            {scoreStr}
          </span>
        ) : (
          <span className="font-cormorant text-[13px] font-light italic relative z-10 px-1 text-center leading-tight" style={{ color: badgeText, opacity: 0.6 }}>
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
