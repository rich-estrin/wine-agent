import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Mount to #wine-agent-root when embedded in WordPress, otherwise #root
const container = document.getElementById('wine-agent-root') ?? document.getElementById('root')!;
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);

/** Height of whatever the theme pins to the top of the viewport — a fixed or
 *  sticky nav bar. Scrolling the app flush to the viewport top would slide the
 *  search box underneath it, which is what put the search box "out of view"
 *  on mobile. Zero when nothing is pinned there. */
function pinnedHeaderHeight(): number {
  const x = Math.floor(window.innerWidth / 2);
  let bottom = 0;
  for (const el of document.elementsFromPoint(x, 1)) {
    const position = getComputedStyle(el).position;
    if (position === 'fixed' || position === 'sticky') {
      bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
    }
  }
  return bottom;
}

// On mobile, the WP theme header/banner pushes the search app below the fold.
// After first paint, scroll the app up to just under any pinned header so users
// land on the search UI rather than the banner. Desktop is left untouched, and
// we only nudge when the user hasn't already scrolled themselves.
if (window.matchMedia('(max-width: 767px)').matches) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (window.scrollY > 8) return; // user already scrolled — don't fight them
      const margin = pinnedHeaderHeight() + 8;
      const top = container.getBoundingClientRect().top + window.scrollY - margin;
      if (top > 8) window.scrollTo({ top, behavior: 'smooth' });
    });
  });
}
