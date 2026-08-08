# Wine Agent

A wine search and discovery app embedded in the Northwest Wine Report WordPress site. Editors publish reviews in WordPress; the app surfaces them through a fast, filterable search interface.

## Architecture

```
WordPress site (northwestwinereport.com)
  └─ [wine-search] shortcode
       ├─ Serves JS/CSS from plugin assets (bundled at build time)
       ├─ Proxies /wp-json/wine-agent/v1/search → EC2 /api/search
       └─ Proxies /wp-json/wine-agent/v1/meta   → EC2 /api/meta

EC2 API server (Express + PM2)
  ├─ Loads wine data from WordPress CSV export → in-memory cache
  ├─ GET /api/search  — full-text search + filtering
  ├─ GET /api/meta    — filter dropdown values
  └─ POST /api/webhook/review — receives publish/trash events from WP
```

The React app calls `window.__WINE_AGENT_API_BASE__` (injected by the shortcode), so all API traffic goes through WordPress HTTPS — no direct HTTP calls to EC2 from the browser.

## Project Structure

```
wine-agent/
├── web/
│   ├── server/             # Express API server (port 3001)
│   │   ├── app.ts          # Routes: /api/search, /api/meta, /api/webhook/review
│   │   ├── index.ts        # Picks a data source and listens
│   │   ├── wine-search.ts  # Search and filter over the loaded wines
│   │   ├── relevance.ts    # Tiered relevance scoring
│   │   ├── csv-client.ts   # Loads WordPress CSV export → wines.json cache
│   │   ├── wp-client.ts    # Alternative: loads directly from WP REST API
│   │   └── fixture-client.ts  # Static sample data for local work and tests
│   ├── fixtures/           # wines.json — the sample dataset (committed)
│   ├── e2e/                # Playwright end-to-end tests
│   └── src/                # React frontend (Vite + TypeScript + Tailwind)
├── wordpress-plugin/
│   ├── wine-agent-api.php  # Plugin: shortcode, WP REST proxy, webhook dispatcher
│   └── wine-agent-api.zip  # Deployable plugin zip (includes built JS/CSS)
└── DEPLOYMENT.md           # EC2 + WordPress deployment guide
```

## Features

- **Full-text search** across wine names, brands, reviews, regions, AVAs, varietals, and vintage
- **Filters** — Wine type, appellation (hierarchical AVA tree), home region, varietal (with search box), price, score, vintage, review date
- **Live updates** — WordPress fires a webhook on publish/trash; the API server updates in real time without a restart
- **Mobile-friendly** — slide-up filter sheet on small screens

## Local Development

### Prerequisites

- Node.js 18+
- A WordPress CSV export saved locally (or WP REST API credentials)

### Setup

**Quickest start — no credentials, no WordPress:**

```bash
cd web && npm install
npm run dev:fixture
```

Open http://localhost:5173. This runs the whole app against the committed
sample dataset in `web/fixtures/wines.json`. Nothing is fetched and nothing is
cached, so it can't disturb a real setup — good for UI work and for seeing the
app without touching production data.

**Against your own review data:**

```bash
cd web && npm install

cat > .env <<EOF
CSV_PATH=/path/to/your/wordpress-export.csv
WEBHOOK_SECRET=any-local-secret
ANTHROPIC_API_KEY=sk-ant-...   # optional, for AI chat (disabled by default)
EOF

npm run dev:all
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` to the Express server on port 3001, injecting the `X-Wine-Agent-Key` header automatically from `.env`.

### Data source options

| Mode | Env vars | Notes |
|------|----------|-------|
| Fixture | `WINE_FIXTURE` | Static sample data for local work and tests; never writes the cache |
| CSV export | `CSV_PATH` | Fastest for real local dev; export from WP Admin |
| WP REST API | `WP_API_URL` + `WP_API_KEY` | Fetches live data from WordPress on startup |

Precedence is `WINE_FIXTURE`, then `WP_API_URL`, then `CSV_PATH`. The latter two cache to `web/cache/wines.json` and serve from memory; fixture mode stays in memory only.

## Testing

```bash
cd web
npm test              # Unit tests (Vitest)
npm run test:e2e      # End-to-end tests (Playwright, desktop + mobile viewports)
npm run screenshots   # Write UI screenshots to e2e/screenshots/ for eyeballing
```

Both suites run against `web/fixtures/wines.json`, so they need no credentials
and no network. Playwright starts the API and Vite itself — nothing to launch
first. On a fresh checkout run `npx playwright install chromium` once.

See [CLAUDE.md](CLAUDE.md#testing) for what's covered and how the tests are laid out.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full deploy procedure. The short version:

1. Build the React app
2. Repackage `wordpress-plugin/wine-agent-api.zip` with the new assets
3. Upload the plugin zip to WP Admin → Plugins → Update
4. rsync server files to EC2 and restart PM2

## WordPress Plugin

The plugin (`wordpress-plugin/wine-agent-api.php`) provides:

- **`[wine-search]` shortcode** — embeds the React app on any page
- **REST proxy** — forwards search/meta requests from the browser to EC2
- **Webhook dispatcher** — fires `POST /api/webhook/review` on every publish or trash action
- **Admin settings** (WP Admin → Settings → Wine Agent API) — configures the EC2 URL and shared secret

See [wordpress-plugin/INSTALL.md](wordpress-plugin/INSTALL.md) for installation steps.
