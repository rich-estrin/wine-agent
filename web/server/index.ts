import 'dotenv/config';
import { CSVClient } from './csv-client.js';
import { WPClient } from './wp-client.js';
import { FixtureClient } from './fixture-client.js';
import { createApp, type DataClient } from './app.js';

// Data source, in precedence order:
//   WINE_FIXTURE  → static JSON, no cache, no credentials (standalone + tests)
//   WP_API_URL    → WordPress REST API, cached to cache/wines.json
//   CSV_PATH      → WP CSV export, cached to cache/wines.json
function selectDataClient(): { client: DataClient & { initialize(): void | Promise<void> }; label: string } {
  if (process.env.WINE_FIXTURE) {
    return {
      client: new FixtureClient(process.env.WINE_FIXTURE),
      label: `fixture ${process.env.WINE_FIXTURE}`,
    };
  }
  if (process.env.WP_API_URL) {
    return {
      client: new WPClient(process.env.WP_API_URL, process.env.WP_API_KEY || ''),
      label: `WordPress REST API ${process.env.WP_API_URL}`,
    };
  }
  return {
    client: new CSVClient(process.env.CSV_PATH || ''),
    label: `CSV export ${process.env.CSV_PATH}`,
  };
}

async function start() {
  const { client, label } = selectDataClient();
  await client.initialize();

  // Fixture mode is for local work and tests, so it deliberately ignores
  // WEBHOOK_SECRET — otherwise a stray .env would 401 every request.
  const secret = process.env.WINE_FIXTURE ? undefined : process.env.WEBHOOK_SECRET;
  const app = createApp(client, { secret });

  console.log(`Data source: ${label}`);
  console.log(`Loaded ${client.getAllWines().length} wines`);

  const PORT = parseInt(process.env.PORT || '3001');
  app.listen(PORT, () => {
    console.log(`Wine API server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
