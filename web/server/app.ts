import express from 'express';
import type { Wine } from '../src/types.js';
import { mapWPReview, type WPReview } from './wp-client.js';
import { searchWines, filterWines, getWineDetails, matchesFilter } from './wine-search.js';
import { sortWines, parseCasesOrNull } from './wine-utils.js';
import { designationGroupLabels } from '../src/data/designation-groups.js';

/** The subset of a data client the API depends on. CSVClient, WPClient and
 *  FixtureClient all satisfy it, which is what lets tests run the real routes
 *  against a static dataset. */
export interface DataClient {
  getAllWines(): Wine[];
  upsertWine(wine: Wine): void;
  removeWine(id: string): void;
}

export interface AppOptions {
  /** Shared secret for X-Wine-Agent-Key / X-Webhook-Secret. Unset disables the check. */
  secret?: string;
}

// Known junk varietal values (data-entry typos) to keep out of the dropdown.
const VARIETAL_EXCLUSIONS = new Set(['Ca']);

// The filter keys the app sends, and the only ones either endpoint honours.
// An allowlist rather than a denylist, because /search and /meta are public
// and unauthenticated: anything else in the query string — a CDN cache-buster,
// a tracking tag, WordPress's own REST params, a typo — is ignored rather than
// read as a wine field. Read as a field, an unknown key matches no row and
// silently empties the page.
const FILTER_PARAMS = new Set([
  'mainVarietal', 'ava', 'region', 'type', 'stateProvince', 'specialDesignation',
  'priceMin', 'priceMax', 'scoreMin', 'scoreMax',
  'vintageMin', 'vintageMax', 'casesMin', 'casesMax',
  'publicationDate',
]);

/** Pull the recognised filter params out of a query string, dropping blanks. */
function collectFilters(params: Record<string, unknown>): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!FILTER_PARAMS.has(key)) continue;
    if (typeof value === 'string' && value.trim()) filters[key] = value;
  }
  return filters;
}

/** The largest page a caller may ask for. The app pages 40 at a time; the cap
 *  is what keeps `?limit=100000` from serialising the whole index into one
 *  response on a public endpoint. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/** The page window, clamped. Both numbers are caller-supplied: an unbounded
 *  limit is a free full-table dump, and a negative offset reaches the END of
 *  the results through `Array.prototype.slice`. */
function pageWindow(limitParam: unknown, offsetParam: unknown): { limit: number; offset: number } {
  const limit = parseInt(String(limitParam ?? ''), 10);
  const offset = parseInt(String(offsetParam ?? ''), 10);
  return {
    limit: Number.isNaN(limit) ? DEFAULT_LIMIT : Math.min(Math.max(limit, 1), MAX_LIMIT),
    offset: Number.isNaN(offset) ? 0 : Math.max(offset, 0),
  };
}

// ─── Filter dropdown metadata (faceted) ───────────────────────────────────────
// Each facet's options are computed from the wines matching every OTHER active
// filter, so choosing Wine Type = Red narrows the Varietal list and choosing a
// state narrows Appellation and Home Region. A facet never narrows itself —
// otherwise you could never change a selection you had already made.
//
// Because the options come from the rows themselves, this respects the data
// rather than a taxonomy: a white Cabernet Franc in the data means Cabernet
// Franc appears under Wine Type = White.
const FACETS: { key: string; controls: string; field: keyof Wine }[] = [
  { key: 'varietals',           controls: 'mainVarietal',       field: 'mainVarietal' },
  { key: 'regions',             controls: 'region',             field: 'region' },
  { key: 'types',               controls: 'type',               field: 'type' },
  { key: 'avaList',             controls: 'ava',                field: 'ava' },
  { key: 'stateProvinces',      controls: 'stateProvince',      field: 'stateProvince' },
  { key: 'specialDesignations', controls: 'specialDesignation', field: 'specialDesignation' },
];

/** The meta payload: one option list per facet, plus the numbers a range
 *  control needs to size itself. */
type MetaResponse = { casesMax: number } & Record<string, string[] | number>;

/** Largest reported case production in the data, for the top of the Cases
 *  slider. Computed over every wine, not the filtered pool — a range control
 *  whose end moves as you filter is impossible to aim. */
function highestCases(wines: Wine[]): number {
  return wines.reduce((max, w) => Math.max(max, parseCasesOrNull(w.cases) ?? 0), 0);
}

const unique = (values: string[]) =>
  [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

/** Build the Express app over a data client. Separated from server startup so
 *  tests can exercise the real routes without binding a port. */
export function createApp(dataClient: DataClient, options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  const secret = options.secret;

  // Middleware: validate X-Wine-Agent-Key on search/meta endpoints
  function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (secret && req.headers['x-wine-agent-key'] !== secret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  }

  // Keyed by the active filter set. Cleared wholesale by the webhook.
  let metaCache = new Map<string, MetaResponse>();
  // The largest production doesn't depend on the filters, so it is a property
  // of the dataset, not of a meta request. Scanned once and kept until a
  // webhook changes the data — otherwise every new filter combination paid for
  // another full pass over every wine to reach the same number.
  let casesMax: number | null = null;

  function buildMeta(filters: Record<string, string>): MetaResponse {
    const wines = dataClient.getAllWines();
    if (casesMax === null) casesMax = highestCases(wines);
    const result: MetaResponse = { casesMax };

    for (const facet of FACETS) {
      const others = Object.entries(filters).filter(([key]) => key !== facet.controls);
      const pool = others.length
        ? wines.filter((w) => others.every(([key, val]) => matchesFilter(w, key, val)))
        : wines;

      const values = unique(pool.map((w) => (w[facet.field] as string) ?? ''));
      result[facet.key] =
        facet.key === 'varietals'
          ? values.filter((v) => !VARIETAL_EXCLUSIONS.has(v))
          : facet.key === 'specialDesignations'
          ? designationGroupLabels(values)
          : values;
    }

    return result;
  }

  // Combined search + filter endpoint
  app.get('/api/search', requireApiKey, (req, res) => {
    try {
      const { q, limit, offset, sort_by, sort_order, notes, ...filterParams } = req.query;
      const query = typeof q === 'string' ? q.trim() : '';
      const filters = collectFilters(filterParams);
      // Opt-in prose search. Off by default, so an embed that knows nothing
      // about it keeps today's behaviour.
      const searchNotes = notes === '1' || notes === 'true';

      const sortOrd = sort_order === 'asc' ? 'asc' : 'desc';
      // Newest reviews first when the caller doesn't say — matches the app's
      // own default, so an embed that omits sort_by sees the same order.
      let sortBy = typeof sort_by === 'string' && sort_by ? sort_by : 'publicationDate';
      // Relevance ranking is gone; older embeds may still ask for it by name.
      if (sortBy === 'relevance') sortBy = 'rating';

      let results = dataClient.getAllWines();

      if (query) results = searchWines(results, { query, limit: Infinity, searchNotes });

      if (Object.keys(filters).length > 0) {
        results = filterWines(results, { filters, limit: Infinity });
      }

      results = sortWines(results, sortBy, sortOrd);

      const { limit: finalLimit, offset: finalOffset } = pageWindow(limit, offset);
      res.json({ wines: results.slice(finalOffset, finalOffset + finalLimit), total: results.length });
    } catch (error) {
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/meta', requireApiKey, (req, res) => {
    try {
      const filters = collectFilters(req.query as Record<string, unknown>);
      const cacheKey = JSON.stringify(Object.entries(filters).sort());

      let meta = metaCache.get(cacheKey);
      if (!meta) {
        meta = buildMeta(filters);
        // Distinct filter combinations are unbounded; keep the map from growing
        // forever without tracking access order.
        if (metaCache.size > 200) metaCache.clear();
        metaCache.set(cacheKey, meta);
      }
      res.json(meta);
    } catch (error) {
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Wine detail lookup
  app.get('/api/wine/:name', (req, res) => {
    try {
      const exactMatch = req.query.exact_match === 'true';
      const results = getWineDetails(dataClient.getAllWines(), {
        wine_name: req.params.name,
        exact_match: exactMatch,
      });
      res.json(results);
    } catch (error) {
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // ─── Webhook: receive live updates from WordPress ─────────────────────────────
  app.post('/api/webhook/review', (req, res) => {
    if (secret && req.headers['x-webhook-secret'] !== secret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { action, review } = req.body as { action: 'upsert' | 'delete'; review: WPReview };

    if (!action || !review?.id) {
      res.status(400).json({ error: 'Missing action or review.id' });
      return;
    }

    if (action === 'delete') {
      dataClient.removeWine(String(review.id));
      console.log(`[Webhook] Removed wine ${review.id}`);
    } else {
      dataClient.upsertWine(mapWPReview(review));
      console.log(`[Webhook] Upserted wine ${review.id}: ${review.brand_name}`);
    }

    metaCache.clear(); // force rebuild so filter dropdowns reflect the change
    casesMax = null;   // a published wine can raise (or a trashed one lower) it

    res.json({ ok: true, total: dataClient.getAllWines().length });
  });

  return app;
}
