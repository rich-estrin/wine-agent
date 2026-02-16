#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SheetsClient } from './sheets-client.js';
import { searchWines, SearchWinesSchema } from './tools/search.js';
import { filterWines, FilterWinesSchema } from './tools/filter.js';
import { getWineDetails, GetWineDetailsSchema } from './tools/get-wine.js';

// Configuration from environment variables
const config = {
  spreadsheetId: process.env.GOOGLE_SHEET_ID || '',
  sheetName: process.env.GOOGLE_SHEET_NAME || 'Sheet1',
  range: process.env.GOOGLE_SHEET_RANGE || 'A:Q',
  credentialsPath:
    process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials/service-account.json',
};

// Validate configuration
if (!config.spreadsheetId) {
  console.error('Error: GOOGLE_SHEET_ID environment variable is required');
  process.exit(1);
}

// Initialize the Sheets client
const sheetsClient = new SheetsClient(config);

// Create MCP server
const server = new Server(
  {
    name: 'wine-agent',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_wines',
        description:
          'Search for wines using full-text search across wine names, brands, reviews, regions, AVAs, and varietals. Use this when searching for keywords or phrases in wine descriptions.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search terms (e.g., "cherry oak", "Napa Valley", "Pinot Noir")',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 20)',
            },
            sort_by: {
              type: 'string',
              description:
                'Column to sort by (e.g., "rating", "price", "vintage", "publicationDate")',
            },
            sort_order: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Sort direction (default: "desc")',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'filter_wines',
        description:
          'Filter wines by specific criteria with operators. Supports combining multiple filters (AND logic). Use comparison operators for numeric/date fields (e.g., ">90", "<50", ">=2012"). String fields support partial matching.',
        inputSchema: {
          type: 'object',
          properties: {
            filters: {
              type: 'object',
              description:
                'Filters as key-value pairs. Keys: mainVarietal, type, region, ava, brandName, price (with operators), rating (with operators), vintage (with operators), publicationDate (with operators), tastingDate (with operators). Examples: {"mainVarietal": "Pinot Noir", "rating": ">4", "price": "<40"}',
              additionalProperties: {
                type: 'string',
              },
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
              description: 'Sort direction (default: "desc")',
            },
          },
          required: ['filters'],
        },
      },
      {
        name: 'get_wine_details',
        description:
          'Get detailed information about a specific wine by name. Returns complete wine information including review, ratings, pricing, and links.',
        inputSchema: {
          type: 'object',
          properties: {
            wine_name: {
              type: 'string',
              description: 'Name or partial name of the wine',
            },
            exact_match: {
              type: 'boolean',
              description: 'If true, requires exact match (default: false)',
            },
          },
          required: ['wine_name'],
        },
      },
      {
        name: 'list_columns',
        description:
          'List all available column names in the wine database. Useful for understanding what fields can be used for filtering and sorting.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_wines': {
        const params = SearchWinesSchema.parse(args);
        const results = searchWines(sheetsClient.getAllWines(), params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'filter_wines': {
        const params = FilterWinesSchema.parse(args);
        const results = filterWines(sheetsClient.getAllWines(), params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'get_wine_details': {
        const params = GetWineDetailsSchema.parse(args);
        const results = getWineDetails(sheetsClient.getAllWines(), params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'list_columns': {
        const columns = sheetsClient.getColumnNames();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  columns,
                  description: 'Available columns for filtering and sorting',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  try {
    console.error('Initializing Wine Agent MCP Server...');
    await sheetsClient.initialize();
    console.error('Google Sheets data loaded successfully');

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('MCP Server running on stdio');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
