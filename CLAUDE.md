# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

```
wine-agent/
├── web/                    # React frontend + Express API server
│   ├── src/                # React app (Vite + TypeScript + Tailwind)
│   ├── server/             # Express API server
│   │   ├── index.ts        # API server (port 3001)
│   │   ├── wine-search.ts  # search + filter over the loaded wines
│   │   ├── wine-utils.ts   # value parsing and sorting
│   │   ├── csv-client.ts   # WP CSV export loader with disk cache
│   │   └── wp-client.ts    # WordPress REST API loader with disk cache
│   └── cache/              # wines.json cache (gitignored)
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
npm run dev:fixture   # Standalone: static fixture data, no .env or WordPress needed
npm test              # Unit tests (Vitest)
npm run test:e2e      # End-to-end tests (Playwright, desktop + mobile)
npm run screenshots   # Write UI screenshots to e2e/screenshots/ for review
```

The Vite dev server proxies `/api/*` to `localhost:3001` — both must run together.

`npm run dev:fixture` runs the whole app against `web/fixtures/wines.json` with no
credentials and no cache writes — the quickest way to poke at the UI, and what the
test suites run against.

## Data Source

WordPress is the source of truth. Two access modes, selected by `web/.env`:

| Mode | Env var set | Client used |
|---|---|---|
| **Fixture** | `WINE_FIXTURE` | `FixtureClient` — static JSON, in-memory only, never writes the cache |
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
cd web && VITE_BASE_PATH=/wwr-search npm run build
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
- All text comparison goes through `fold()` in `src/lib/text.ts` — strips accents
  and case, so "Ita" finds "Itä" and "semillon" finds "Sémillon"
- Full-text search: `server/wine-search.ts` looks at `brandName`, `vintage`,
  `wineName` and `mainVarietal` only — not the tasting note, appellation or
  region, which are what the filters are for. Each query term must match the **start of a
  word** (accent-folded), and every term must match somewhere, though not
  necessarily in the same field. Matching only: results keep the source order
  unless a sort is given, and `/api/search` sorts by rating by default
- Filtering: `server/wine-search.ts` — special-cased keys before generic field lookup.
  Dropdown fields match a comma-separated OR list, which is what backs multi-select
- Sorting: `server/wine-utils.ts` — wines with no price/vintage/date sort **last in
  both directions** (`parse*OrNull` returns null rather than a sentinel number)
- AVA filter: comma-separated list of expanded descendants via `expandAva()` in `ava-tree.ts`
- Price slider: non-linear (piecewise) — 0–25% → $0–$15, 25–75% → $15–$100, 75–100% → $100–$300
- Filter options are faceted: `/api/meta` takes the same filters as `/api/search`
  and derives each facet from the wines matching every *other* active filter, so
  Wine Type narrows Varietal and State narrows Appellation and Home Region. A facet
  never narrows itself
- `AVA_TREE` is a fixed PNW taxonomy; `buildAvaTree(available)` prunes it to the
  appellations present and buckets the rest under "Other appellations"

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

## Testing

```
web/
├── fixtures/            # wines.json — the standalone/test dataset (committed)
├── test/factory.ts      # makeWine() helper for unit tests
├── e2e/                 # Playwright specs + helpers.ts
└── **/*.test.ts         # Vitest unit tests, beside the code they cover
```

- **Unit tests** (`npm test`) cover text folding, search matching, sorting,
  filtering, the AVA/region/designation trees, both importers, and the API
  routes via `createApp()` over an ephemeral port
- **End-to-end tests** (`npm run test:e2e`) run against the fixture app at two
  viewports. `e2e/helpers.ts` has the shared locators — use `withResults()`
  rather than a sleep, since the app debounces and fires a second search on load
- `server/app.ts` exports `createApp(dataClient)`; `server/index.ts` only picks a
  data source and listens. That split is what lets tests exercise real routes
- Tests locate elements by `data-testid`: `sidebar-desktop`, `filter-sheet`,
  `results`, `result-count`, `wine-card`, `wine-card-brand`, `wine-detail`,
  `active-chip`, and `facet-<slug>` per filter group
- Playwright uses the Chromium from `npx playwright install chromium`; set
  `PLAYWRIGHT_CHROMIUM_PATH` to override when the sandbox ships a different build
- Screenshots are written for review, not pixel-compared — baselines drift
  across machines and become noise

## Key Conventions

- Filter state lives in `App.tsx` as `Filters` (imported from `Sidebar.tsx`).
  Checkbox facets (`type`, `stateProvince`, `specialDesignation`) hold `string[]`;
  the combobox and tree pickers stay single-select `string`
- `FilterPanel.tsx` is unused — superseded by `Sidebar.tsx`
- Never commit `web/.env` or `web/cache/`
- `WPReview` interface and `mapWPReview()` are exported from `wp-client.ts` and shared with the webhook endpoint in `index.ts`
