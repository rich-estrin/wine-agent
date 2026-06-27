import { createPortal } from 'react-dom';
import type { Wine } from '../types';
import { numericScore } from '../types';
import nwrLogo from '../assets/nwr-logo.svg?raw';

function formatShelfDate(raw: string): string {
  if (!raw) return '';
  const datePart = raw.split(/[\sT]/)[0];
  const d = new Date(datePart + 'T00:00:00');
  if (isNaN(d.getTime())) return datePart;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function parseStarRating(rating: string): number | null {
  if (!rating || !rating.includes('*')) return null;
  const full = (rating.match(/\*/g) || []).length;
  const half = /½|1\/2/.test(rating) ? 0.5 : 0;
  return full + half;
}

export default function ShelfTalker({ wine }: { wine: Wine }) {
  const scoreStr = numericScore(wine.rating ?? '');
  const starCount = parseStarRating(wine.rating ?? '');

  // Title: brand + vintage + wine name (or varietal)
  const titleParts: string[] = [];
  if (wine.brandName) titleParts.push(wine.brandName);
  if (wine.vintage) titleParts.push(wine.vintage);
  const wineLabel = wine.wineName || wine.mainVarietal;
  if (wineLabel) titleParts.push(wineLabel);
  const title = titleParts.join(' ');

  // Origin line: "{Type} wine from {State}"
  const type = (wine.type || '').trim();
  const state = (wine.stateProvince || '').trim();
  const originLine = type
    ? `${type} wine${state ? ` from ${state}` : ''}`
    : '';

  const reviewer = (wine.reviewer ?? '').trim();
  const pubDate = wine.publicationDate ? formatShelfDate(wine.publicationDate) : '';

  return createPortal(
    <div id="shelf-talker" aria-hidden="true">
      <div id="shelf-talker-inner">

        {/* Header: logo + score */}
        <div className="st-header">
          <div className="st-logo" dangerouslySetInnerHTML={{ __html: nwrLogo }} />
          {scoreStr && (
            <div className="st-score">
              <span className="st-score-number">{scoreStr}</span>
              <span className="st-score-pts">pts</span>
            </div>
          )}
          {scoreStr === '' && starCount !== null && (
            <div className="st-stars">
              {[1, 2, 3, 4, 5].map((i) => {
                const fill = i <= starCount ? 1 : i - 0.5 <= starCount ? 0.5 : 0;
                return (
                  <span key={i} className={`st-star ${fill === 1 ? 'st-star-full' : fill === 0.5 ? 'st-star-half' : 'st-star-empty'}`}>
                    ★
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Title */}
        {title && <div className="st-title">{title}</div>}

        {/* Appellation + origin */}
        {wine.ava && <div className="st-appellation">{wine.ava}</div>}
        {originLine && <div className="st-origin">{originLine}</div>}

        {/* Designation badge */}
        {wine.specialDesignation && (
          <div className="st-badge-row">
            <span className="st-badge">{wine.specialDesignation}</span>
          </div>
        )}

        {/* Review */}
        {wine.review && <p className="st-review">{wine.review}</p>}

        {/* Footer: reviewer + date */}
        {(reviewer || pubDate) && (
          <div className="st-byline">
            {reviewer}
            {reviewer && pubDate && ' · '}
            {pubDate}
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}
