import type { Wine, Meta } from './types';

// When embedded in WordPress the plugin injects window.__WINE_AGENT_API_BASE__
// pointing at its own /wp-json/wine-agent/v1 routes, so every request is
// same-origin. Falls back to a relative path for standalone use.
const BASE: string =
  (typeof window !== 'undefined' && (window as any).__WINE_AGENT_API_BASE__) ||
  './api';

// Search is exactly as protected as the page hosting it, so the plugin also
// injects a REST nonce (without which WordPress runs every call logged out)
// and a signed token naming that page. Both are absent standalone, where the
// Node server needs neither.
function authHeaders(): Record<string, string> {
  const w = typeof window !== 'undefined' ? (window as any) : {};
  const headers: Record<string, string> = {};
  if (w.__WINE_AGENT_NONCE__) headers['X-WP-Nonce'] = w.__WINE_AGENT_NONCE__;
  if (w.__WINE_AGENT_PAGE__) headers['X-Wine-Agent-Page'] = w.__WINE_AGENT_PAGE__;
  return headers;
}

export interface SearchParams {
  q?: string;
  mainVarietal?: string;
  ava?: string;
  region?: string;
  type?: string;
  price?: string;
  rating?: string;
  priceMin?: string;
  priceMax?: string;
  scoreMin?: string;
  scoreMax?: string;
  vintageMin?: string;
  vintageMax?: string;
  casesMin?: string;
  casesMax?: string;
  vintage?: string;
  publicationDate?: string;
  stateProvince?: string;
  specialDesignation?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  /** '1' widens the search to the tasting note. Search only — never sent to
   *  /api/meta, which would read it as a filter. */
  notes?: string;
}

export async function searchWines(params: SearchParams): Promise<{ wines: Wine[]; total: number }> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  }
  const res = await fetch(`${BASE}/search?${searchParams}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

/** Filter dropdown options. Passing the active filters returns faceted
 *  options — each list narrowed by every OTHER filter — so Wine Type narrows
 *  Varietal and State narrows Appellation. Called with no arguments it returns
 *  the full unnarrowed lists. */
export async function fetchMeta(filters: SearchParams = {}): Promise<Meta> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') searchParams.set(key, String(value));
  }
  const qs = searchParams.toString();
  const res = await fetch(`${BASE}/meta${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Meta failed: ${res.status}`);
  return res.json();
}
