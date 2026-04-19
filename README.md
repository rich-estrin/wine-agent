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
├── mcp/                    # Search/filter tools (used by the API server)
│   └── src/tools/          # search.ts, filter.ts, get-wine.ts
├── web/
│   ├── server/             # Express API server (port 3001)
│   │   ├── index.ts        # Routes: /api/search, /api/meta, /api/webhook/review
│   │   ├── csv-client.ts   # Loads WordPress CSV export → wines.json cache
│   │   └── wp-client.ts    # Alternative: loads directly from WP REST API
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

```bash
# Install dependencies
cd mcp && npm install
cd ../web && npm install

# Create web/.env
cat > web/.env <<EOF
CSV_PATH=/path/to/your/wordpress-export.csv
WEBHOOK_SECRET=any-local-secret
ANTHROPIC_API_KEY=sk-ant-...   # optional, for AI chat (disabled by default)
EOF

# Build the search tools
cd mcp && npm run build

# Start both servers
cd ../web && npm run dev:all
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` to the Express server on port 3001, injecting the `X-Wine-Agent-Key` header automatically from `.env`.

### Data source options

| Mode | Env vars | Notes |
|------|----------|-------|
| CSV export | `CSV_PATH` | Fastest for local dev; export from WP Admin |
| WP REST API | `WP_API_URL` + `WP_API_KEY` | Fetches live data from WordPress on startup |

If both are set, `WP_API_URL` takes precedence. Either way, data is cached to `web/cache/wines.json` and served from memory.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full deploy procedure. The short version:

1. Build MCP tools and the React app
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
