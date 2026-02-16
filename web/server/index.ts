import 'dotenv/config';
import express from 'express';
import { SheetsClient } from '../../dist/sheets-client.js';
import { searchWines } from '../../dist/tools/search.js';
import { filterWines } from '../../dist/tools/filter.js';
import { getWineDetails } from '../../dist/tools/get-wine.js';

const app = express();

const config = {
  spreadsheetId: process.env.GOOGLE_SHEET_ID || '',
  sheetName: process.env.GOOGLE_SHEET_NAME || 'Sheet1',
  range: process.env.GOOGLE_SHEET_RANGE || 'A:Q',
  credentialsPath:
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    '../credentials/service-account.json',
};

const sheetsClient = new SheetsClient(config);

// Cache for filter dropdown values
let metaCache: {
  varietals: string[];
  regions: string[];
  types: string[];
  avaList: string[];
} | null = null;

// Combined search + filter endpoint
app.get('/api/search', (req, res) => {
  try {
    const { q, limit, sort_by, sort_order, ...filterParams } = req.query;

    let results = sheetsClient.getAllWines();

    // Step 1: Full-text search if query provided
    if (q && typeof q === 'string' && q.trim()) {
      results = searchWines(results, {
        query: q,
        limit: 10000,
        sort_order: 'desc',
      });
    }

    // Step 2: Apply filters if any filter params provided
    const filters: Record<string, string> = {};
    for (const [key, value] of Object.entries(filterParams)) {
      if (typeof value === 'string' && value.trim()) {
        filters[key] = value;
      }
    }
    if (Object.keys(filters).length > 0) {
      results = filterWines(results, {
        filters,
        limit: 10000,
        sort_order: 'desc',
      });
    }

    // Step 3: Sort
    const sortBy = typeof sort_by === 'string' ? sort_by : 'rating';
    const sortOrd =
      typeof sort_order === 'string' &&
      (sort_order === 'asc' || sort_order === 'desc')
        ? sort_order
        : 'desc';

    // Use filterWines with empty filters just for sorting
    if (sortBy) {
      results = filterWines(results, {
        filters: {},
        limit: 10000,
        sort_by: sortBy,
        sort_order: sortOrd,
      });
    }

    // Step 4: Apply limit
    const finalLimit = limit ? parseInt(limit as string) : 20;
    res.json(results.slice(0, finalLimit));
  } catch (error) {
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Filter dropdown metadata
app.get('/api/meta', (_req, res) => {
  try {
    if (!metaCache) {
      const wines = sheetsClient.getAllWines();
      const unique = (values: string[]) =>
        [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort(
          (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })
        );
      metaCache = {
        varietals: unique(wines.map((w) => w.mainVarietal)),
        regions: unique(wines.map((w) => w.region)),
        types: unique(wines.map((w) => w.type)),
        avaList: unique(wines.map((w) => w.ava)),
      };
    }
    res.json(metaCache);
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
    const results = getWineDetails(sheetsClient.getAllWines(), {
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

async function start() {
  await sheetsClient.initialize();
  console.log(`Loaded ${sheetsClient.getAllWines().length} wines`);

  const PORT = parseInt(process.env.PORT || '3001');
  app.listen(PORT, () => {
    console.log(`Wine API server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
