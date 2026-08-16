import express from 'express';
import type { Wine } from '../src/types.js';
import { mapWPReview, type WPReview } from './wp-client.js';
import { searchWines, filterWines, getWineDetails, matchesFilter } from './wine-search.js';
import { sortWines } from './wine-utils.js';
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

/** Pull the filter params out of a query string, dropping blanks. */
function collectFilters(params: Record<string, unknown>): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.trim()) filters[key] = value;
  }
  return filters;
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
  let metaCache = new Map<string, Record<string, string[]>>();

  function buildMeta(filters: Record<string, string>): Record<string, string[]> {
    const wines = dataClient.getAllWines();
    const result: Record<string, string[]> = {};

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
      const { q, limit, offset, sort_by, sort_order, ...filterParams } = req.query;
      const query = typeof q === 'string' ? q.trim() : '';
      const filters = collectFilters(filterParams);

      const sortOrd = sort_order === 'asc' ? 'asc' : 'desc';
      let sortBy = typeof sort_by === 'string' && sort_by ? sort_by : 'rating';
      // Relevance ranking is gone; older embeds may still ask for it by name.
      if (sortBy === 'relevance') sortBy = 'rating';

      let results = dataClient.getAllWines();

      if (query) results = searchWines(results, { query, limit: Infinity });

      if (Object.keys(filters).length > 0) {
        results = filterWines(results, { filters, limit: Infinity });
      }

      results = sortWines(results, sortBy, sortOrd);

      const finalLimit = limit ? parseInt(limit as string) : 20;
      const finalOffset = offset ? parseInt(offset as string) : 0;
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

  // Chat endpoint — disabled until ready to launch
  app.post('/api/chat', (_req, res) => {
    res.status(503).json({ error: 'Chat is not available yet.' });
  });

  /* CHAT IMPLEMENTATION — re-enable by wiring back to app.post('/api/chat', ...) above
  async function chatHandler(req: any, res: any) {
    try {
      const { messages } = req.body;
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages array required' });
      }

      // System prompt for the wine assistant
      const systemPrompt = `You are a wine expert assistant with access to a database of 3,240+ wine reviews.
  You can search, filter, and provide detailed information about wines.

  When users ask about wines:
  - Use search_wines for text queries (e.g., "cherry oak", "Napa Valley", "Quilceda Creek")
  - Use filter_wines for specific criteria (price, rating, region, varietal, vintage)
  - Use get_wine_details for specific wine names
  - Provide natural, conversational responses with wine recommendations
  - When showing wines, include brand, name, rating, price, and brief tasting notes
  - Limit results to top 10 most relevant wines unless user asks for more

  Available wine data: brand, name, vintage, price, rating (0-5 stars), region,
  AVA, main varietal, type (Red/White/Rosé/etc.), tasting notes, tasting/publication dates.`;

      // Convert messages to Anthropic format
      const anthropicMessages: Anthropic.MessageParam[] = messages.map(
        (msg: { role: string; content: string }) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })
      );

      let response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages: anthropicMessages,
      });

      // Handle tool use in a loop
      while (response.stop_reason === 'tool_use') {
        const toolUse = response.content.find(
          (block) => block.type === 'tool_use'
        );
        if (!toolUse || toolUse.type !== 'tool_use') break;

        console.log(`[Tool Call] ${toolUse.name}:`, JSON.stringify(toolUse.input));

        // Execute the tool
        let toolResult: any;
        const wines = dataClient.getAllWines();

        try {
          switch (toolUse.name) {
            case 'search_wines':
              toolResult = searchWines(wines, toolUse.input as any);
              break;
            case 'filter_wines':
              toolResult = filterWines(wines, toolUse.input as any);
              break;
            case 'get_wine_details':
              toolResult = getWineDetails(wines, toolUse.input as any);
              break;
            default:
              toolResult = { error: `Unknown tool: ${toolUse.name}` };
          }
        } catch (error) {
          toolResult = {
            error: error instanceof Error ? error.message : String(error),
          };
        }

        console.log(`[Tool Result] Found ${toolResult.length || 0} wines`);

        // Continue conversation with tool result
        anthropicMessages.push({
          role: 'assistant',
          content: response.content,
        });

        anthropicMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(toolResult.slice(0, 20)), // Limit to 20 wines in tool result
            },
          ],
        });

        response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          tools,
          messages: anthropicMessages,
        });
      }

      // Extract final text response
      const textContent = response.content.find((block) => block.type === 'text');
      const finalMessage =
        textContent && textContent.type === 'text' ? textContent.text : '';

      res.json({ message: finalMessage });
    } catch (error) {
      console.error('[Chat Error]', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  // Tool definitions for Anthropic API
  const tools: Anthropic.Tool[] = [
    {
      name: 'search_wines',
      description:
        'Search wines by full-text query across wine names, brands, reviews, regions, AVAs, and varietals',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term(s) to find in wine data',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default: 20)',
          },
          sort_by: {
            type: 'string',
            description: 'Column to sort by (e.g., rating, price, vintage)',
          },
          sort_order: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction (default: desc)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'filter_wines',
      description:
        'Filter wines by specific criteria with comparison operators. Use for queries with specific requirements (price, rating, region, varietal, etc.)',
      input_schema: {
        type: 'object',
        properties: {
          filters: {
            type: 'object',
            description:
              'Key-value pairs for filtering. Use column names as keys (mainVarietal, type, region, ava, brandName, price, rating, vintage, publicationDate, tastingDate). For numeric/date columns, use operators like ">4", "<50", ">=2012"',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 20)',
          },
          sort_by: {
            type: 'string',
            description: 'Column to sort by',
          },
          sort_order: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction',
          },
        },
        required: ['filters'],
      },
    },
    {
      name: 'get_wine_details',
      description:
        'Get detailed information about a specific wine by name. Use when user asks for a specific wine.',
      input_schema: {
        type: 'object',
        properties: {
          wine_name: {
            type: 'string',
            description: 'Name or partial name of the wine to find',
          },
          exact_match: {
            type: 'boolean',
            description:
              'If true, requires exact match. If false (default), allows partial matches',
          },
        },
        required: ['wine_name'],
      },
    },
  ];
  END CHAT IMPLEMENTATION */

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

    res.json({ ok: true, total: dataClient.getAllWines().length });
  });

  return app;
}
