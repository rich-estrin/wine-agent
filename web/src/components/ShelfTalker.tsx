import type { Wine } from '../types';
import { numericScore } from '../types';

function formatShelfDate(raw: string): string {
  if (!raw) return '';
  const datePart = raw.split(/[\sT]/)[0];
  const d = new Date(datePart + 'T00:00:00');
  if (isNaN(d.getTime())) return datePart;
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function toInitials(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  // Already looks like initials (e.g. "S.S." or short single token)
  if (trimmed.length <= 5 || !trimmed.includes(' ')) return trimmed;
  return trimmed.split(/\s+/).map(p => p[0].toUpperCase() + '.').join('');
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

  const titleParts: string[] = [];
  if (wine.brandName) titleParts.push(wine.brandName);
  if (wine.vintage) titleParts.push(wine.vintage);
  const wineLabel = wine.wineName || wine.mainVarietal;
  if (wineLabel) titleParts.push(wineLabel);
  if (wine.ava) titleParts.push(`(${wine.ava})`);
  const title = titleParts.join(' ');

  const reviewer = toInitials(wine.reviewer ?? '');
  const pubDate = wine.publicationDate ? formatShelfDate(wine.publicationDate) : '';

  return (
    <div id="shelf-talker" aria-hidden="true">
      <div id="shelf-talker-inner">

        {/* Score */}
        {scoreStr && (
          <div className="st-score-block">
            <div className="st-score-number">{scoreStr}</div>
            <div className="st-score-label">POINTS</div>
          </div>
        )}

        {starCount !== null && (
          <div className="st-score-block">
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
          </div>
        )}

        {/* Designation badge */}
        {wine.specialDesignation && (
          <div className="st-badge-row">
            <span className="st-badge">{wine.specialDesignation}</span>
          </div>
        )}

        {/* Wine title */}
        <div className="st-title">{title}</div>

        {/* Review text */}
        {wine.review && (
          <p className="st-review">{wine.review}</p>
        )}

        {/* Byline */}
        {(reviewer || pubDate) && (
          <div className="st-byline">
            {reviewer && <strong>— {reviewer}</strong>}
            {reviewer && pubDate && '  '}
            {pubDate && <em>Published {pubDate}</em>}
          </div>
        )}

      </div>
    </div>
  );
}
