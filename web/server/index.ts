import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { SheetsClient } from '../../dist/sheets-client.js';
import { searchWines } from '../../dist/tools/search.js';
import { filterWines } from '../../dist/tools/filter.js';
import { getWineDetails } from '../../dist/tools/get-wine.js';

const app = express();
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

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

// Chat endpoint with tool calling
app.post('/api/chat', async (req, res) => {
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
      const wines = sheetsClient.getAllWines();

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
