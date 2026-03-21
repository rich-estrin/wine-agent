# Wine Agent — Claude Code Guide

## Project Structure

```
wine-agent/
├── web/                    # React frontend + Express API server
│   ├── src/                # React app (Vite + TypeScript + Tailwind)
│   ├── server/             # Express API server
│   │   ├── index.ts        # API server (port 3001)
│   │   └── csv-client.ts   # CSV data loader with disk cache
│   └── cache/              # wines.json cache (gitignored)
├── mcp/                    # MCP server (separate process, for Claude Desktop)
│   └── src/
│       ├── index.ts        # MCP server entry
│       ├── wordpress-client.ts
│       └── tools/          # search.ts, filter.ts, get-wine.ts
└── wordpress-plugin/       # WP REST API plugin (unused by web app)
```

## Development

Work is focused on the `web/` directory. The MCP server is a separate concern.

```bash
cd web
npm run dev:all       # Start both API server (tsx watch) and Vite dev server
npm run dev:server    # API server only (port 3001)
npm run dev           # Vite only (port 5173)
npm run build         # Production build (also validates TypeScript)
```

The Vite dev server proxies `/api/*` to `localhost:3001` — both must run together.

## Data Source

- **CSV file**: `~/Downloads/Reviews-Export-2026-Mar-21-041851.csv` (~18,355 wines)
- **Env var**: `CSV_PATH` in `web/.env`
- **Disk cache**: `web/cache/wines.json` — invalidated automatically when `CSV_PATH` changes
- AVA typos are normalized at parse time via `AVA_CORRECTIONS` map in `csv-client.ts`

## Architecture

### Frontend (`web/src/`)
- **`App.tsx`** — top-level state (filters, query, sort, pagination), layout
- **`components/Sidebar.tsx`** — dark collapsible filter panel; also exports `Filters` type, `emptyFilters`, `getDateFilter`
- **`components/WineCard.tsx`** — 3-col card with score badge, serif names, price
- **`components/AvaTreeFilter.tsx`** — hierarchical AVA dropdown with search
- **`data/ava-tree.ts`** — PNW AVA hierarchy; `expandAva(name)` returns node + all descendants
- **`api.ts`** — typed fetch wrappers for `/api/search`, `/api/meta`, `/api/chat`
- **`types.ts`** — `Wine`, `Meta`, `formatPrice`, `numericScore`

### API Server (`web/server/`)
- `GET /api/search` — accepts `q`, `limit`, `offset`, `sort_by`, `sort_order`, plus filter params (`mainVarietal`, `ava`, `region`, `type`, `priceMin`, `priceMax`, `scoreMin`, `scoreMax`, `vintageMin`, `vintageMax`, `publicationDate`)
- `GET /api/meta` — returns `{ varietals, regions, types, avaList }`
- `POST /api/chat` — proxies to Claude API with wine search tools

### Search/Filter Logic
- Full-text search: linear `String.includes()` scan via `mcp/src/tools/search.ts`
- Filtering: `mcp/src/tools/filter.ts` — special-cased keys before generic field lookup
- AVA filter: comma-separated list of expanded descendants; `expandAva()` in `ava-tree.ts`
- Price slider: non-linear (piecewise) — 0–25% maps to $0–$15, 25–75% to $15–$100, 75–100% to $100–$300
- Pagination: `offset` + `limit` slicing on server

## Design System

Defined in `web/tailwind.config.js` and loaded via Google Fonts in `web/index.html`.

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
- The web app does **not** use the MCP server at runtime — it imports `mcp/dist/tools/` directly
- Run `npm run build` in `mcp/` before starting the web server if MCP tools change
- Never commit `web/.env` or `web/cache/`
