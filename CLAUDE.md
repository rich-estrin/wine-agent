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

- **`wine-agent-api.php`** — REST endpoints, `[wine-search]` shortcode, webhook dispatcher, index lifecycle, settings page
- **`includes/`** — the native search backend. `text.php`, `wine-utils.php`,
  `wine-map.php`, `wine-query.php` and `wine-api-core.php` are WordPress-free
  ports of the Node pipeline (so the parity harness can run them);
  `wine-index.php` is the WordPress half — schema, the postmeta pivot,
  incremental upserts and the chunked rebuild

### Search modes

`/wp-json/wine-agent/v1/search` and `/meta` have two implementations, chosen by
the **Search Mode** setting:

| Mode | Serves from | Notes |
|---|---|---|
| **`native`** | the `{prefix}wine_agent_index` table in this site's own DB | no EC2, no cache sync; reviews appear as soon as they're saved |
| **`proxy`** | forwards to the EC2 Node API | pre-2.27 behaviour, kept as the rollback path |

Native mode is the direction of travel — it removes the EC2 server, the
webhook, and the build-cache-on-a-Mac-and-rsync-it ritual that exists only
because Cloudflare blocks EC2 from reaching WordPress.

**Faceting differs between the modes:** proxy mode never forwarded query params
on `/meta`, so its dropdowns are never narrowed. Native mode forwards them, so
Wine Type narrows Varietal and State narrows Appellation — what the app was
built for.

### The index table

A flat row per published review, holding pre-folded match columns, typed sort
columns, and the display JSON the API returns verbatim. Because every value is
folded in PHP at write time, the generated SQL only ever does binary
comparisons — no collation dependence, no `REGEXP`, identical on MySQL and
MariaDB.

Maintained incrementally from the post lifecycle (save/publish upserts;
unpublish, trash and delete remove; untrash restores) at hook priority 20, after
ACF writes its fields. Every normalization is per-row and stateless, so an
incremental upsert is equivalent to a full rebuild by construction. A nightly
cron rebuild catches changes that bypass the hooks entirely — an importer, a
direct SQL edit, a restored backup.

Rebuilds run in time-budgeted slices resuming from a stored offset (so a large
site doesn't hit `max_execution_time`), write into a staging table, and swap it
in with a single `RENAME TABLE` — readers never see a half-built index.
Settings → Wine Agent API shows index status and a Rebuild button.
- **Always bump the version** in the plugin header and repackage the zip after any change:
  ```bash
  cd wordpress-plugin
  VER=$(grep -m1 -E '^\s*\*\s*Version:' wine-agent-api.php | sed -E 's/.*Version:[[:space:]]*//')
  rm -f wine-agent-api.zip; rm -f ./wine-agent-api-[0-9]*.zip
  mkdir -p wine-agent-api/assets
  cp wine-agent-api.php wine-agent-api/
  cp -r includes wine-agent-api/          # the native search core — required
  cp ../web/dist/.vite/manifest.json wine-agent-api/assets/
  cp ../web/dist/assets/* wine-agent-api/assets/
  zip -rq "wine-agent-api-$VER.zip" wine-agent-api/ && rm -rf wine-agent-api
  ```
  Omitting `includes/` produces a zip that fatals on load — the plugin requires
  `includes/wine-index.php` at the top.
- The zip is named for the version inside it (`wine-agent-api-2.23.0.zip`), and the
  previous version's zip is deleted in the same step — there is never an
  unversioned `wine-agent-api.zip`
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
- **`types.ts`** — `Wine`, `Meta`, `formatPrice`, `numericScore`. `mainVarietal` is
  the Varietal Label *with* a fallback to the variety style (what the Varietal filter
  and the search index match on); `varietalLabel` is the label alone, blank on a blend,
  and is what the listing prints
- **`main.tsx`** — mounts to `#wine-agent-root` (WordPress embed) or `#root` (standalone)

### API Server (`web/server/index.ts`)
- `GET /api/search` — `q`, `limit`, `offset`, `sort_by`, `sort_order` + filter params (`mainVarietal`, `ava`, `region`, `type`, `priceMin`, `priceMax`, `scoreMin`, `scoreMax`, `vintageMin`, `vintageMax`, `casesMin`, `casesMax`, `publicationDate`)
- `GET /api/meta` — returns `{ varietals, regions, types, avaList, stateProvinces, specialDesignations, casesMax }`.
  `casesMax` is the largest reported case production, computed over **all** wines
  (never narrowed by the active filters) so the Cases slider's top end holds still
- `POST /api/webhook/review` — receives `{ action: 'upsert'|'delete', review: WPReview }` from WP plugin; authenticated via `X-Webhook-Secret` header
- `POST /api/chat` — **disabled (503)**; full implementation preserved in comment

### Search/Filter Logic
- All text comparison goes through `fold()` in `src/lib/text.ts` — strips accents
  and case, so "Ita" finds "Itä" and "semillon" finds "Sémillon"
- Full-text search: `server/wine-search.ts` looks at `brandName`, `vintage`,
  `wineName`, `mainVarietal` and `ava` only — not the tasting note or home
  region, which are what the filters are for. The tasting note joins the search
  when `notes=1` (the "Search tasting notes" checkbox under Advanced): each term
  may then match a field *or* the note, folded and matched at a word start like
  everything else. The folded note is cached per wine in a `WeakMap`, built on
  first use, so a reader who leaves the box off pays nothing. Each query term must match the **start of a
  word** (accent-folded), and every term must match somewhere, though not
  necessarily in the same field. Matching only: results keep the source order
  unless a sort is given, and `/api/search` sorts by rating by default
- Apostrophes: the search index is built with `foldSearchWords()`, which adds the
  elided form of any apostrophe compound alongside the split words — "L'Ecole"
  indexes as `l`, `ecole` *and* `lecole`, so all three spellings find it. Both the
  ASCII and typographic apostrophe count, since the export contains both. Query
  terms stay on `foldWords()`
- Filtering: `server/wine-search.ts` — special-cased keys before generic field lookup.
  Dropdown fields match a comma-separated OR list, which is what backs multi-select
- Sorting: `server/wine-utils.ts` — wines with no price/vintage/date sort **last in
  both directions** (`parse*OrNull` returns null rather than a sentinel number).
  Default sort is `publicationDate` descending, in the app and on `/api/search`.
  Review-date ties are compared on the published **day** (`parseDayOrNull`) and
  broken by rating, highest first, in both directions
- AVA filter: comma-separated list of expanded descendants via `expandAva()` in `ava-tree.ts`
- Price slider: non-linear (piecewise) — 0–25% → $0–$15, 25–75% → $15–$100, 75–100% → $100–$300
- Cases slider: same shape — 0–25% → 0–500, 25–75% → 500–5,000, 75–100% → 5,000–`casesMax`,
  the highest production in the data (shown as the high-end placeholder rather than "Any").
  Blank/`0` cases mean "not reported" and are excluded from the range, never read as zero
- The search box debounces 500ms and runs itself; Enter and Escape skip the wait.
  `App.tsx` skips its own 300ms request debounce for query changes
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
- **Parity tests** (`npm run test:parity`) prove the WordPress-native PHP
  search answers exactly what the Node reference answers. Both sides run the
  same battery over the same fixture; the PHP side runs the *production*
  handler core against in-memory SQLite with only the database executor
  swapped. Run it whenever search logic changes on either side —
  `web/server/` is the reference, so a disagreement means the PHP is wrong
  unless `scripts/parity/battery.json` marks the case as an expected
  divergence. See `scripts/parity/README.md`
- **Plugin load test** (`npm run test:plugin`) loads the plugin against a stub
  WordPress to catch what would fatal on activation — a redeclared function, a
  missing include, a load-time call — and checks that the index row and the
  schema agree on their column set and that every generated SQL statement has
  one binding per placeholder. Cheap; run it after touching the plugin
- **Live A/B** (`node scripts/parity/run-remote.mjs <site-url>`) asks a staging
  site every battery query in both modes and diffs them, which is what
  validates the switch over the real 18k-row dataset. Needs the parity-testing
  override enabled in plugin settings
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

- Sidebar order: Wine Type, Varietal, Score, Vintage, Price, State/Province, then
  Advanced (Appellation, Review Date, Cases, Home Region, Special Designation,
  Tasting Notes)
- `Filters.searchNotes` is the odd one out: a boolean that *widens* the search
  rather than narrowing it. It rides in `Filters` so it shows as an active chip,
  counts in the mobile badge and clears with the rest — but `App.tsx` sends it
  only on `/api/search` (as `notes=1`), never on `/api/meta`, where an unknown
  param would be read as a field filter and empty every facet list. It is also
  sent **only alongside a query** — with an empty search box it cannot change
  the results, and including it moved `searchKey`, so ticking the box re-ran the
  search and blinked the list away to redraw it identical
- Filter state lives in `App.tsx` as `Filters` (imported from `Sidebar.tsx`).
  Checkbox facets (`type`, `stateProvince`, `specialDesignation`) hold `string[]`;
  the combobox and tree pickers stay single-select `string`
- `FilterPanel.tsx` is unused — superseded by `Sidebar.tsx`
- Never commit `web/.env` or `web/cache/`
- `WPReview` interface and `mapWPReview()` are exported from `wp-client.ts` and shared with the webhook endpoint in `index.ts`
