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

// On mobile, the WP theme header/banner pushes the search app below the fold.
// After first paint, scroll the app up to the top of the viewport so users land
// on the search UI rather than the banner. Desktop is left untouched, and we
// only nudge when the user hasn't already scrolled themselves.
if (window.matchMedia('(max-width: 767px)').matches) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (window.scrollY > 8) return; // user already scrolled — don't fight them
      const top = container.getBoundingClientRect().top + window.scrollY;
      if (top > 8) window.scrollTo({ top, behavior: 'smooth' });
    });
  });
}
