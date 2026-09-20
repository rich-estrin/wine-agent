# Wine Agent

A wine search and discovery app embedded in the Northwest Wine Report WordPress site. Editors publish reviews in WordPress; the app surfaces them through a fast, filterable search interface.

## Architecture

```
WordPress site (northwestwinereport.com)
  └─ wine-agent-api plugin
       ├─ [wine-search] shortcode — serves the React JS/CSS bundled in the plugin zip
       ├─ GET /wp-json/wine-agent/v1/search — full-text search + filtering
       ├─ GET /wp-json/wine-agent/v1/meta   — faceted filter values
       ├─ GET /wp-json/wine-agent/v1/reviews — key-protected raw review export
       └─ {prefix}wine_agent_index — flat index table, one row per published review

web/server/ (local + tests only)
  └─ Express reference implementation of the same search, which the parity
     tests check the plugin's PHP against. Not deployed anywhere.
```

There is no application server. Search is answered from an index table in the
WordPress site's own database, maintained incrementally from the post lifecycle
and rebuilt nightly by cron. Reviews appear in search as soon as they are saved.

The React app calls `window.__WINE_AGENT_API_BASE__` (injected by the shortcode), so every request is same-origin WordPress HTTPS.

## Project Structure

```
wine-agent/
├── web/
│   ├── server/             # Express API server (port 3001)
│   │   ├── app.ts          # Routes: /api/search, /api/meta
│   │   ├── index.ts        # Picks a data source and listens
│   │   ├── wine-search.ts  # Search and filter over the loaded wines
│   │   ├── csv-client.ts   # Loads WordPress CSV export → wines.json cache
│   │   ├── wp-client.ts    # Alternative: loads directly from WP REST API
│   │   └── fixture-client.ts  # Static sample data for local work and tests
│   ├── fixtures/           # wines.json — the sample dataset (committed)
│   ├── e2e/                # Playwright end-to-end tests
│   └── src/                # React frontend (Vite + TypeScript + Tailwind)
├── wordpress-plugin/
│   ├── wine-agent-api.php  # Plugin: shortcode, REST endpoints, index lifecycle
│   ├── includes/           # Native PHP search core (ports of the Node pipeline)
│   └── wine-agent-api-<version>.zip  # Deployable zip (gitignored; built by /deploy)
├── DEPLOYMENT.md           # Deploy procedure
└── docs/production-rollout.md  # First-time production install runbook
```

## Features

- **Full-text search** across producer name, vintage, wine name and varietal, matching word prefixes
- **Filters** — Wine type, appellation (hierarchical AVA tree), home region, varietal (with search box), price, score, vintage, review date
- **Live updates** — publishing, editing, trashing or deleting a review updates the search index in the same request; no cache to wait on
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

Deploys are a plugin upload — there is no server to push to. See
[DEPLOYMENT.md](DEPLOYMENT.md), or run `/deploy` in Claude Code. The short version:

1. `cd web && npm run build`
2. Bump the version in the `wine-agent-api.php` header
3. Repackage `wordpress-plugin/wine-agent-api-<version>.zip` with the fresh assets
4. Upload it at WP Admin → Plugins → Add New → Upload Plugin → Replace current

For a **first-time install on a site that has never run this plugin**, follow
[docs/production-rollout.md](docs/production-rollout.md) instead — it covers the
preflight checks, the initial index build and the rollback path.

## WordPress Plugin

The plugin (`wordpress-plugin/wine-agent-api.php`) provides:

- **`[wine-search]` shortcode** — embeds the React app on any page, from assets bundled in the zip
- **Search endpoints** — `/wp-json/wine-agent/v1/search` and `/meta`, answered from the index table in this site's own database
- **Index lifecycle** — incremental upserts on the post hooks, a time-budgeted chunked rebuild, and a nightly cron rebuild
- **Admin settings** (WP Admin → Settings → Wine Agent API) — API key, index status, Rebuild button

Requires WordPress 5.9+ and PHP 7.4+.

See [wordpress-plugin/INSTALL.md](wordpress-plugin/INSTALL.md) for installation steps.
