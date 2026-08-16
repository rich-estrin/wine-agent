# Test fixtures

`wines.json` is a synthetic dataset used to run the app standalone — no
WordPress, no CSV export, no credentials — and as the fixed input for the unit
and end-to-end tests.

```bash
npm run dev:fixture     # API + Vite on fixture data, http://localhost:5173
```

It is **not** a sample of real review data. Every row is invented, but the shape
matches `Wine` in `src/types.ts` exactly, and the set is engineered to cover the
cases that have actually caused bugs:

| Case | Why it's here |
|---|---|
| `Itä`, `Gård Vintners`, `Sémillon`, `Carménère`, `Rhône-Style` | Accent folding — searchable without the accent, and with it |
| `L'Ecole No. 41` (ASCII quote), `Colter’s Creek` (typographic) | Apostrophe elision — "lecole" and "colters" must find them, both spellings |
| `Kiona` as both a winery and a vineyard name in `wineName` | One query matching two different searched fields |
| "Merlot" in a tasting note, and as a `mainVarietal` | The varietal is searched, the note is not |
| `garden herbs` in a note, vs the winery `Gård` | Prefix matching: "gard" finds the winery, never "garden" |
| `Rhône` in a note whose wine name is `Rhône-Style Blend` | Highlighting accented note text from an unaccented query |
| `price: "N/A"` and `price: "0"` | Both mean "no price" and must sort last in both directions |
| Star ratings (`****`, `***1/2`) alongside numeric scores | Two rating scales on one axis |
| Missing `vintage` | Must sort last, not as year zero |
| White `Cabernet Franc`, Rosé of a red grape | Faceting must follow the data, not a taxonomy |
| `stateProvince: "America"` with a non-PNW appellation | Appellations outside the fixed PNW tree must stay filterable |
| Regions spanning two states, e.g. `Walla Walla Valley (WA/OR)` | Must appear under both states |
| Tasting notes from one line to several hundred words | Card and modal layout under both extremes |
| Long winery + wine + appellation names | Text overflow in cards and chips |

Regenerate with `node fixtures/generate.mjs` after editing that script. The
output is committed so tests are deterministic and the app runs on a fresh
clone with no setup.

To work against real data instead, set `CSV_PATH` or `WP_API_URL` in
`web/.env` and use `npm run dev:all` as usual — fixture mode is only active
when `WINE_FIXTURE` is set.
