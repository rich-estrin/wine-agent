import { Dialog, DialogPanel } from '@headlessui/react';
import { XMarkIcon, ArrowTopRightOnSquareIcon, PrinterIcon } from '@heroicons/react/24/outline';
import type { Wine } from '../types';
import { numericScore } from '../types';
import ShelfTalker from './ShelfTalker';

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
          <svg key={i} width="20" height="20" viewBox="0 0 24 24">
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

function formatDate(raw: string): string {
  if (!raw) return '';
  const datePart = raw.split(/[\sT]/)[0];
  const d = new Date(datePart + 'T00:00:00');
  if (isNaN(d.getTime())) return datePart;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] text-muted">{label}</p>
      <p className="text-[14px] text-ink">{value}</p>
    </div>
  );
}

export default function WineDetail({
  wine,
  onClose,
}: {
  wine: Wine | null;
  onClose: () => void;
}) {
  const scoreStr = wine ? numericScore(wine.rating ?? '') : null;
  const starCount = wine ? parseStarRating(wine.rating ?? '') : null;

  const priceNum = wine?.price ? parseFloat(wine.price.replace(/[^\d.]/g, '')) : NaN;
  const hasPrice = !isNaN(priceNum) && wine?.price !== 'N/A';

  return (
    <>
    {wine && <ShelfTalker wine={wine} />}
    <Dialog open={wine !== null} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px]" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-3 md:p-6">
        <DialogPanel className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-[6px] bg-cream shadow-2xl">
          {wine && (
            <>
              {/* Title */}
              <div className="relative px-6 md:px-8 pt-6 pb-4 border-b border-warm-border flex-shrink-0">
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-1.5 rounded-full text-muted hover:text-ink hover:bg-warm-border/60 transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
                <div className="pr-8">
                  <p className="text-[11px] font-medium tracking-[0.08em] uppercase text-muted mb-1">
                    {wine.brandName}
                  </p>
                  <h2 className="font-cormorant text-[20px] md:text-[24px] font-bold text-ink leading-tight">
                    {wine.wineName || wine.mainVarietal}
                    {wine.ava && (
                      <span className="font-light text-[17px] md:text-[20px]"> {wine.ava}</span>
                    )}
                    {wine.vintage && (
                      <span className="font-normal text-[17px] md:text-[19px] text-muted"> {wine.vintage}</span>
                    )}
                  </h2>
                </div>
              </div>

              {/* Two-column body — scrolls inside the fixed-height panel */}
              <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto">
                {/* Left: Additional details — below tasting notes on mobile */}
                <div className="order-2 md:order-1 w-full md:w-[240px] flex-shrink-0 px-6 md:px-7 py-5 border-t md:border-t-0 md:border-r border-warm-border">
                  <p className="text-[13px] font-medium text-ink mb-4">Additional details</p>
                  <div className="space-y-3">
                    {hasPrice && <DetailRow label="Price" value={`$${Math.round(priceNum)}`} />}
                    {wine.type && <DetailRow label="Wine Type" value={wine.type} />}
                    {wine.stateProvince && <DetailRow label="State/Province" value={wine.stateProvince} />}
                    {wine.alcohol && <DetailRow label="Alcohol %" value={wine.alcohol} />}
                    {wine.closure && <DetailRow label="Closure" value={wine.closure} />}
                    {wine.region && <DetailRow label="Home Region" value={wine.region} />}
                    {wine.source && <DetailRow label="Source" value={wine.source} />}
                    {wine.reviewer && <DetailRow label="Reviewer" value={wine.reviewer} />}
                  </div>

                  <button
                    onClick={() => window.print()}
                    className="mt-6 w-full flex items-center justify-center gap-2 px-3 py-2 text-[12px] text-muted border border-warm-border rounded-[3px] hover:border-ink/30 hover:text-ink transition-colors"
                  >
                    <PrinterIcon className="w-3.5 h-3.5" />
                    Print Shelf Talker
                  </button>

                  {wine.hyperlink && (
                    <a
                      href={wine.hyperlink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 w-full flex items-center justify-center gap-1.5 text-[11px] font-medium tracking-[0.06em] uppercase text-wine hover:text-wine-light transition-colors"
                    >
                      View full review
                      <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {/* Right: Tasting notes — first on mobile */}
                <div className="order-1 md:order-2 flex-1 min-w-0 px-6 md:px-7 py-5">
                  <p className="text-[13px] font-medium text-ink mb-4">Tasting Notes</p>

                  {/* Rating + review card — only shown when there's something to display */}
                  {(scoreStr || starCount !== null || wine.review || wine.specialDesignation || wine.publicationDate) && (
                  <div className="bg-[rgba(26,20,16,0.03)] border border-warm-border rounded-[4px] p-4 md:p-5">
                    {/* Mobile: score+meta row on top, review below. Desktop: score+meta left, review right. */}
                    <div className="flex flex-col md:flex-row md:gap-6">

                      {/* Score + meta — only rendered when at least one piece of meta exists */}
                      {(scoreStr || starCount !== null || wine.specialDesignation || wine.publicationDate) && (
                      <div className="flex-shrink-0 flex md:block items-start gap-4 pb-4 md:pb-0 border-b md:border-b-0 border-warm-border/60">
                        {/* Score — only when a rating exists */}
                        {(scoreStr || starCount !== null) && (
                          <div className="flex-shrink-0">
                            {starCount !== null ? (
                              <>
                                <p className="text-[9px] font-medium tracking-[0.1em] uppercase text-muted mb-2">Rating</p>
                                <StarRow count={starCount} />
                              </>
                            ) : (
                              <>
                                <p className="text-[9px] font-medium tracking-[0.1em] uppercase text-muted mb-1">Rating</p>
                                <p className="font-cormorant text-[48px] font-bold leading-none" style={{ color: '#b52b2b' }}>
                                  {scoreStr}
                                </p>
                              </>
                            )}
                          </div>
                        )}

                        {/* Designation + Published */}
                        <div className="flex-1 md:flex-none">
                          {wine.specialDesignation && (
                            <div className="md:mt-3">
                              <p className="text-[9px] font-medium tracking-[0.1em] uppercase text-muted mb-0.5">Designation</p>
                              <p className="text-[13px] font-medium text-ink">{wine.specialDesignation}</p>
                            </div>
                          )}
                          {wine.publicationDate && (
                            <div className="mt-3">
                              <p className="text-[9px] font-medium tracking-[0.1em] uppercase text-muted mb-0.5">Published</p>
                              <p className="text-[13px] text-ink">{formatDate(wine.publicationDate)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      )}

                      {/* Review text */}
                      {wine.review && (
                        <p className="flex-1 min-w-0 pt-4 md:pt-0 text-[14px] leading-[1.75] text-[#5a5044] font-light">
                          {wine.review}
                        </p>
                      )}
                    </div>
                  </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogPanel>
      </div>
    </Dialog>
    </>
  );
}
