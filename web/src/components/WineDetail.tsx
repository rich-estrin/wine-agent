import { Dialog, DialogPanel } from '@headlessui/react';
import { XMarkIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import type { Wine } from '../types';
import { numericScore } from '../types';

const TYPE_GRADIENT: Record<string, { gradient: string; text: string }> = {
  red:       { gradient: 'from-[#4a1520] to-[#7b2d3e]', text: '#ffffff' },
  white:     { gradient: 'from-[#c49a10] to-[#f5d96a]', text: '#2a1a00' },
  'rosé':    { gradient: 'from-[#d4607a] to-[#f8b8ca]', text: '#3a0818' },
  rose:      { gradient: 'from-[#d4607a] to-[#f8b8ca]', text: '#3a0818' },
  sparkling: { gradient: 'from-[#d4c040] to-[#f8f090]', text: '#2a1a00' },
  dessert:   { gradient: 'from-[#111111] to-[#2a2a2a]', text: '#ffffff' },
  fortified: { gradient: 'from-[#3d1f0a] to-[#6b3510]', text: '#ffffff' },
};
const DEFAULT_GRADIENT = { gradient: 'from-[#1a1410] to-[#2d2520]', text: '#ffffff' };

function parseStarRating(rating: string): number | null {
  if (!rating || !rating.includes('*')) return null;
  const full = (rating.match(/\*/g) || []).length;
  const half = /½|1\/2/.test(rating) ? 0.5 : 0;
  return full + half;
}

function StarRow({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-[3px]">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = i <= count ? 1 : i - 0.5 <= count ? 0.5 : 0;
        const id = `dstar-${i}-${count}`;
        return (
          <svg key={i} width="18" height="18" viewBox="0 0 24 24">
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

function MetaPill({ label, accent }: { label: string; accent?: boolean }) {
  return accent ? (
    <span className="text-[10px] font-medium tracking-[0.07em] uppercase text-wine bg-[rgba(123,45,62,0.07)] border border-[rgba(123,45,62,0.18)] px-2.5 py-[3px] rounded-full">
      {label}
    </span>
  ) : (
    <span className="text-[10px] font-medium tracking-[0.07em] uppercase text-muted bg-[rgba(26,20,16,0.05)] border border-warm-border px-2.5 py-[3px] rounded-full">
      {label}
    </span>
  );
}

export default function WineDetail({
  wine,
  onClose,
}: {
  wine: Wine | null;
  onClose: () => void;
}) {
  const scoreStr = wine ? numericScore(wine.rating) : null;
  const starCount = wine ? parseStarRating(wine.rating ?? '') : null;
  const { gradient, text: badgeText } =
    wine ? (TYPE_GRADIENT[wine.type?.toLowerCase() ?? ''] ?? DEFAULT_GRADIENT) : DEFAULT_GRADIENT;

  const priceNum = wine?.price ? parseFloat(wine.price.replace(/[^\d.]/g, '')) : NaN;
  const hasPrice = !isNaN(priceNum) && wine?.price !== 'N/A';

  return (
    <Dialog open={wine !== null} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px]" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-3 md:p-6">
        <DialogPanel className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-[6px] bg-cream shadow-2xl">
          {wine && (
            <>
              {/* Header */}
              <div className="relative px-5 md:px-7 pt-6 pb-5 border-b border-warm-border">
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-1.5 rounded-full text-muted hover:text-ink hover:bg-warm-border/60 transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>

                <div className="flex gap-4 items-start pr-8">
                  {/* Score badge or star row */}
                  {starCount !== null ? (
                    <div className="pt-1 flex-shrink-0">
                      <StarRow count={starCount} />
                    </div>
                  ) : (
                    <div
                      className={`w-[60px] h-[60px] md:w-[68px] md:h-[68px] rounded-[4px] flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${gradient} relative overflow-hidden`}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
                      {scoreStr ? (
                        <span
                          className="font-cormorant text-[26px] md:text-[30px] font-medium leading-none relative z-10"
                          style={{ color: badgeText }}
                        >
                          {scoreStr}
                        </span>
                      ) : (
                        <span
                          className="font-cormorant text-[12px] font-light italic relative z-10 px-1 text-center leading-tight"
                          style={{ color: badgeText, opacity: 0.5 }}
                        >
                          {wine.rating || '—'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Name block */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-muted mb-0.5">
                      {wine.brandName}
                    </p>
                    <h2 className="font-cormorant text-[21px] md:text-[25px] font-medium text-ink leading-tight">
                      {wine.wineName}
                      {wine.vintage && (
                        <span className="font-light text-muted ml-2">{wine.vintage}</span>
                      )}
                    </h2>
                    {hasPrice && (
                      <p className="mt-1.5 font-cormorant text-[19px] text-ink/75 leading-none">
                        <span className="text-muted font-light text-[15px]">$</span>
                        {Math.round(priceNum)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Metadata pills */}
              {(wine.mainVarietal || wine.type || wine.ava || wine.region) && (
                <div className="px-5 md:px-7 py-4 border-b border-warm-border flex flex-wrap gap-2">
                  {wine.mainVarietal && <MetaPill label={wine.mainVarietal} accent />}
                  {wine.type && <MetaPill label={wine.type} accent />}
                  {wine.ava && <MetaPill label={wine.ava} />}
                  {wine.region && <MetaPill label={wine.region} />}
                </div>
              )}

              {/* Review */}
              {wine.review && (
                <div className="px-5 md:px-7 py-5 border-b border-warm-border">
                  <p className="text-[14px] leading-[1.75] text-[#5a5044] font-light">
                    {wine.review}
                  </p>
                </div>
              )}

              {/* Bottom meta */}
              {(wine.publicationDate || wine.tastingDate || wine.setting || wine.purchasedProvided) && (
                <div className="px-5 md:px-7 py-4 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-warm-border">
                  {wine.publicationDate && (
                    <div>
                      <p className="text-[10px] tracking-[0.08em] uppercase text-muted mb-0.5">Published</p>
                      <p className="text-[13px] text-ink">{wine.publicationDate}</p>
                    </div>
                  )}
                  {wine.tastingDate && (
                    <div>
                      <p className="text-[10px] tracking-[0.08em] uppercase text-muted mb-0.5">Tasted</p>
                      <p className="text-[13px] text-ink">{wine.tastingDate}</p>
                    </div>
                  )}
                  {wine.setting && (
                    <div>
                      <p className="text-[10px] tracking-[0.08em] uppercase text-muted mb-0.5">Setting</p>
                      <p className="text-[13px] text-ink">{wine.setting}</p>
                    </div>
                  )}
                  {wine.purchasedProvided && (
                    <div>
                      <p className="text-[10px] tracking-[0.08em] uppercase text-muted mb-0.5">Source</p>
                      <p className="text-[13px] text-ink">{wine.purchasedProvided}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Link */}
              {wine.hyperlink && (
                <div className="px-5 md:px-7 py-4">
                  <a
                    href={wine.hyperlink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.08em] uppercase text-wine hover:text-wine-light transition-colors"
                  >
                    View full review
                    <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                  </a>
                </div>
              )}
            </>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
