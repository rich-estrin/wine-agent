# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

```
wine-agent/
├── web/                    # React frontend + Express API server
│   ├── src/                # React app (Vite + TypeScript + Tailwind)
│   ├── server/             # Express API server
│   │   ├── index.ts        # API server (port 3001)
│   │   ├── csv-client.ts   # WP CSV export loader with disk cache
│   │   └── wp-client.ts    # WordPress REST API loader with disk cache
│   └── cache/              # wines.json cache (gitignored)
├── mcp/                    # MCP server (Claude Desktop only, separate concern)
│   └── src/
│       ├── index.ts        # MCP server entry
│       └── tools/          # search.ts, filter.ts, get-wine.ts
└── wordpress-plugin/       # wine-agent-api.php + wine-agent-api.zip
```

## Development

Work is focused on the `web/` directory.

```bash
cd web
npm run dev:all       # Start both API server (tsx watch) and Vite dev server
npm run dev:server    # API server only (port 3001)
npm run dev           # Vite only (port 5173)
npm run build         # Production build (also validates TypeScript)
```

The Vite dev server proxies `/api/*` to `localhost:3001` — both must run together.

If `mcp/src/tools/` changes, rebuild before starting the web server:
```bash
cd mcp && npm run build
```

## Data Source

WordPress is the source of truth. Two access modes, selected by `web/.env`:

| Mode | Env var set | Client used |
|---|---|---|
| **WP CSV export** | `CSV_PATH` | `CSVClient` — parses export, caches to `web/cache/wines.json` |
| **WP REST API** | `WP_API_URL` + `WP_API_KEY` | `WPClient` — fetches paginated, caches to `web/cache/wines.json` |

The cache is invalidated automatically when the source path/URL changes. Both clients expose identical `getAllWines()`, `upsertWine()`, `removeWine()` methods.

**Live updates via webhook**: WordPress fires `POST /api/webhook/review` on publish/trash. Requires `WEBHOOK_SECRET` in `web/.env` matching the plugin setting.

## WordPress Plugin (`wordpress-plugin/`)

- **`wine-agent-api.php`** — REST endpoint (`/wp-json/wine-agent/v1/reviews`), `[wine-search]` shortcode, webhook dispatcher
- **Always bump the version** in the plugin header and repackage the zip after any change:
  ```bash
  cd wordpress-plugin
  rm -f wine-agent-api.zip
  mkdir -p wine-agent-api/assets
  cp wine-agent-api.php wine-agent-api/
  cp ../web/dist/.vite/manifest.json wine-agent-api/assets/
  cp ../web/dist/assets/* wine-agent-api/assets/
  zip -r wine-agent-api.zip wine-agent-api/ && rm -rf wine-agent-api
  ```
- The plugin zip bundles the built JS/CSS assets — no HTTP fetching at runtime
- EC2 only exposes `/api/*`; no static files served from EC2
- Plugin settings (WP Admin → Settings → Wine Agent API): API Key, Search App URL, Webhook URL, Webhook Secret

## Deployment (EC2)

Connection info lives in `web/.env` (`EC2_HOST`, `EC2_USER`, `EC2_KEY`, `EC2_PATH`, `EC2_BASE_PATH`). Use `/deploy` skill to build and push. Manual equivalent:

```bash
cd mcp && npm run build
cd ../web && VITE_BASE_PATH=/wwr-search npm run build
rsync -az -e "ssh -i $EC2_KEY" mcp/dist/       $EC2_USER@$EC2_HOST:$EC2_PATH/mcp/dist/
rsync -az -e "ssh -i $EC2_KEY" web/dist/        $EC2_USER@$EC2_HOST:$EC2_PATH/web/dist/
rsync -az -e "ssh -i $EC2_KEY" web/server/      $EC2_USER@$EC2_HOST:$EC2_PATH/web/server/
rsync -az -e "ssh -i $EC2_KEY" web/cache/wines.json $EC2_USER@$EC2_HOST:$EC2_PATH/web/cache/wines.json
ssh -i $EC2_KEY $EC2_USER@$EC2_HOST "cd $EC2_PATH/web && npm install --omit=dev --silent && pm2 restart wine-api --update-env"
```

The app is served at `/wwr-search` via Nginx. The `[wine-search]` WP shortcode embeds the app by loading its JS/CSS assets from the EC2 URL.

## Architecture

### Frontend (`web/src/`)
- **`App.tsx`** — top-level state (filters, query, sort, pagination), layout. AI chat is implemented but disabled — re-enable by uncommenting in `App.tsx` and `server/index.ts`.
- **`components/Sidebar.tsx`** — dark collapsible filter panel; also exports `Filters` type, `emptyFilters`, `getDateFilter`
- **`components/WineCard.tsx`** — card with score badge or star row, serif names, price
- **`components/AvaTreeFilter.tsx`** — hierarchical AVA dropdown with search
- **`data/ava-tree.ts`** — PNW AVA hierarchy; `expandAva(name)` returns node + all descendants
- **`api.ts`** — typed fetch wrappers for `/api/search`, `/api/meta`
- **`types.ts`** — `Wine`, `Meta`, `formatPrice`, `numericScore`
- **`main.tsx`** — mounts to `#wine-agent-root` (WordPress embed) or `#root` (standalone)

### API Server (`web/server/index.ts`)
- `GET /api/search` — `q`, `limit`, `offset`, `sort_by`, `sort_order` + filter params (`mainVarietal`, `ava`, `region`, `type`, `priceMin`, `priceMax`, `scoreMin`, `scoreMax`, `vintageMin`, `vintageMax`, `publicationDate`)
- `GET /api/meta` — returns `{ varietals, regions, types, avaList }`
- `POST /api/webhook/review` — receives `{ action: 'upsert'|'delete', review: WPReview }` from WP plugin; authenticated via `X-Webhook-Secret` header
- `POST /api/chat` — **disabled (503)**; full implementation preserved in comment

### Search/Filter Logic
- Full-text search: linear `String.includes()` scan via `mcp/src/tools/search.ts`
- Filtering: `mcp/src/tools/filter.ts` — special-cased keys before generic field lookup
- AVA filter: comma-separated list of expanded descendants via `expandAva()` in `ava-tree.ts`
- Price slider: non-linear (piecewise) — 0–25% → $0–$15, 25–75% → $15–$100, 75–100% → $100–$300
- The web app imports `mcp/dist/tools/` directly at runtime — it does **not** call the MCP server

## Design System

Defined in `web/tailwind.config.js`. Fonts loaded via Google Fonts in `web/index.html`.

| Token | Value | Usage |
|---|---|---|
| `ink` | `#1a1410` | Body text, header bg |
| `parchment` | `#f5f0e8` | Light text on dark bg |
| `cream` | `#faf7f2` | Page background |
| `wine` | `#7b2d3e` | Accents, selected states |
| `wine-light` | `#a84458` | Hover/border for wine |
| `gold` | `#b8924a` | Icons, slider thumbs, active labels |
| `gold-light` | `#d4a85c` | Slider values, highlighted labels |
| `muted` | `#8a7f72` | Secondary text |
| `warm-border` | `#ddd5c4` | Card/input borders |
| `sidebar-bg` | `#1e1812` | Sidebar background |
| `font-cormorant` | Cormorant Garamond | Wine names, prices, display text |
| `font-sans` | DM Sans | UI chrome, labels, body |

CSS classes `.sidebar-slider` (gold thumb, dark context) and `.score-slider` (light context) are defined in `index.css` for dual-range inputs. Opacity modifiers (e.g. `bg-wine/40`) do **not** work with hex custom colors — use `rgba()` arbitrary values or inline styles instead.

## Key Conventions

- Filter state lives in `App.tsx` as `Filters` (imported from `Sidebar.tsx`)
- `FilterPanel.tsx` is unused — superseded by `Sidebar.tsx`
- Never commit `web/.env` or `web/cache/`
- `WPReview` interface and `mapWPReview()` are exported from `wp-client.ts` and shared with the webhook endpoint in `index.ts`
