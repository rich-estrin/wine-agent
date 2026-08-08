# Beta tester feedback — August 7, 2026

Assessment and implementation plan for the 16 items in *Comments_August_7_2026*.
Every item is addressable. Six of them need a product decision from the site
owner before they can be built correctly — those are collected in
[Open questions](#open-questions).

Line references are to the code as of `98ae3e4`.

---

## Summary

| # | Item | Verdict | Effort | Phase |
|---|---|---|---|---|
| B1 | Accent-insensitive search (Itä/Ita, Sémillon/Semillon) | Confirmed bug | M | 1 |
| B2 | Winery-name matches should outrank review-text matches | Confirmed; needs relevance ranking | L | 1 |
| B3 | Wines with no price should always sort last | Confirmed bug | S | 1 |
| B4 | Wine Type should narrow the Varietal list | Valid; needs faceting | L | 2 |
| B5 | State/Province should narrow Appellation | Valid; needs faceting + data fix | L | 2 |
| B6 | State/Province should narrow Home Region | Valid; needs faceting | M | 2 |
| M1 | Varietal dropdown should close on second arrow click | Confirmed bug | S | 1 |
| M2 | Clearing the varietal should reopen the dropdown | Confirmed bug | S | 1 |
| M3 | Varietal box should be collapsible, open by default | Valid | S | 1 |
| M4 | Checkboxes should allow multiple selections | Valid; backend already supports it | M | 2 |
| M5 | A single vintage (2022–2022) should be accepted | Confirmed bug | S | 1 |
| C1 | Search placeholder gets truncated | Confirmed | S | 1 |
| C2 | Sort by: "Date" → "Review Date" | Trivial | XS | 1 |
| C3 | "State/Province" → "State/Province/Region" | Trivial | XS | 1 |
| N1 | Highlight the search term in the review text | Valid | M | 3 |
| N2 | Prioritize name matches over description matches | Same fix as B2 | — | 1 |

**Phase 1** — search correctness + all the quick wins. Ships as one release.
**Phase 2** — dependent (faceted) filters and multi-select. One architectural
change covers B4/B5/B6/M4 together.
**Phase 3** — search-term highlighting.

---

## "Biggish things"

### B1 — Searching without the special character

> *Search "Ita" and it returns nothing. Same for Gård, Sémillon, Carménère.*

**Confirmed.** `searchWines` (`web/server/wine-search.ts:15–21`) lowercases both
sides and calls `String.includes()`, but never strips diacritics. `"itä"` does
not contain `"ita"`, so the search legitimately returns nothing.

**Fix.** Introduce a single fold function used everywhere text is compared:

```ts
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
```

Apply it to the query and to every indexed field. Folded field text is computed
once when wines are loaded (and refreshed in `upsertWine`, `web/server/wp-client.ts:188`)
rather than per-request, so 3,240 rows stay well under a millisecond.

This also makes the reverse case work — searching `"Sémillon"` finds rows
spelled `"Semillon"` — and should be applied to the facet filter boxes
(`FacetList`, `web/src/components/Sidebar.tsx:201`) and the AVA/region tree
search (`AvaTreeFilter.tsx:5`, `RegionTreeFilter.tsx:5`) so typing "Rhone"
finds "Rhône" in the dropdowns too.

**The second half of this item — "how do you search for Gard and have Gård
listed first and not 'garden herbs'" — is not a folding problem, it's a
ranking problem.** It is solved by B2 below, not here. → **Q1**

### B2 / N2 — Winery names should outrank review text

> *Search Kiona and you get a jumble of wines made by Kiona and wines made from
> Kiona Vineyard fruit. Same for typing "Merlot" instead of using the filter.*

**Confirmed, and the current design cannot express this.** Two separate causes:

1. `searchWines` (`wine-search.ts:15–21`) flattens eight fields into one string.
   A hit in `review` is indistinguishable from a hit in `brandName`.
2. Even if it did rank, `/api/search` throws the ranking away: step 3
   (`web/server/index.ts:85–92`) re-sorts every result by `rating` (the default,
   `App.tsx:28`) before returning.

**Fix — a relevance score, plus a sort mode that preserves it.**

Replace the flattened string with per-field matching and a tiered score. Each
query term is scored against its best-matching field; scores sum across terms;
a wine must still match *every* term somewhere (current AND behaviour preserved).

| Match | Weight |
|---|---|
| `brandName` whole word | 100 |
| `brandName` word-prefix | 80 |
| `wineName`, `mainVarietal`, `varietyStyle` whole word | 60 |
| `ava`, `region`, `vintage` whole word | 40 |
| any field, word-prefix | 20 |
| `review` whole word | 10 |
| any field, mid-word substring | 2 |

The bottom tier is what keeps the tester's explicit constraint — *"I don't want
to take away that string search in the review text unless we have to"* — while
demoting the `gard` → `Bogardus` style of accident below every real hit. → **Q1**

Then add `sort_by=relevance`, make it the default whenever `q` is non-empty, and
surface it in the Sort by dropdowns (`App.tsx:178–182` and `211–215`). → **Q2**

Worth noting this single change resolves both B2 and the "nice to have" N2 —
they are the same request stated twice.

### B3 — Wines with no price belong at the bottom

> *Sort by Price, Highest and the no-price wines come first. They should be last
> either way.*

**Confirmed bug, and the cause is a sentinel value.** `parsePrice`
(`web/server/wine-utils.ts:3–9`) returns `9999` for missing/`N/A`/`0` prices.
`sortWines` (`wine-utils.ts:52–53`) sorts on that number, so descending puts the
fake $9,999 wines on top.

**Fix.** Add `parsePriceOrNull()` and give `sortWines` an explicit missing-last
rule that runs before the value comparison:

```ts
if (aMissing !== bMissing) return aMissing ? 1 : -1;   // regardless of sortOrder
```

Apply the same rule to `vintage`, `publicationDate`, and `tastingDate` — a wine
with no vintage currently sorts as year 0 and floats to the top on "Lowest".

The `9999` sentinel is also load-bearing in the price *filter*
(`wine-search.ts:47–54` tests `n !== 9999`); both call sites get updated so the
sentinel disappears entirely rather than being worked around.

⚠️ **Rating sort has the same class of problem and nobody has reported it yet.**
`parseRating` (`wine-utils.ts:11–17`) returns 0–5 for star reviews and 80–100
for scored reviews, on one axis. Sorting by Rating therefore places *every*
scored wine above *every* starred wine, and unrated wines at position zero. → **Q8**

### B4 — Wine Type should narrow the Varietal list

> *Select Wine Type = Red, and the Varietal list should stop offering Albariño —
> but based on the ACTUAL wine type of the listed wines, since there are white
> Cabernet Francs.*

**Valid, and the tester's caveat is the important part.** `/api/meta`
(`web/server/index.ts:106–129`) computes each dropdown's options once from the
entire dataset and caches them globally in `metaCache` — the lists never react
to the current filter state.

**Fix — make `/api/meta` filter-aware (faceting).** `/api/meta` accepts the same
filter parameters as `/api/search` and computes each facet's options from the
wines matching *all the other* active filters. A facet never narrows itself, so
you can always change your own selection. Cache keyed by the serialized filter
set, invalidated by the webhook alongside the existing reset at `index.ts:371`.

Because options are derived from the rows themselves, the tester's caveat is
satisfied for free: a white Cabernet Franc in the data means Cabernet Franc
appears under Wine Type = White.

Frontend: `App.tsx` refetches meta when filters change, sharing the existing
300 ms debounce (`App.tsx:109–119`).

Stale selections need a policy — if you pick Albariño and then pick Red, does
Albariño get dropped, kept, or kept-and-marked? → **Q3**, **Q4**

### B5 — State/Province should narrow Appellation

**Valid, plus it exposes a pre-existing gap.** The faceting work in B4 covers the
mechanism, but `AvaTreeFilter` renders the hard-coded `AVA_TREE`
(`web/src/data/ava-tree.ts`) regardless of what is in the data
(`AvaTreeFilter.tsx:104`). Two consequences:

- Narrowing by state means pruning that static tree to the appellations the
  server actually returns.
- **Any appellation present in the data but absent from `AVA_TREE` is currently
  unreachable through the filter** — a real bug that predates this feedback.
  The tree is a Pacific Northwest taxonomy, so anything outside the PNW has no
  home in it at all.

That second point interacts with C3 below: the tester wants the label changed
because *"'America' isn't a state or country"*, which tells us `stateProvince`
holds values the AVA tree cannot represent. → **Q6**

**Recommendation:** keep `AVA_TREE` as the display hierarchy, prune it to the
appellations the server reports, and append an "Other appellations" group for
data values with no node — so nothing is silently unfilterable.

### B6 — State/Province should narrow Home Region

**Valid and the easiest of the three.** `region-tree.ts` already derives states
from each region's parenthetical code (`statesOf`, `region-tree.ts:23–31`) and
groups regions under them (`buildRegionTree:38–53`). With filter-aware `/api/meta`
in place, `RegionTreeFilter` receives an already-narrowed `regions` list
(`Sidebar.tsx:782`) and the tree collapses to the selected state on its own.

One caveat: regions spanning two states (`"Walla Walla Valley (WA/OR)"`) appear
under both, which is correct — selecting Washington should still show it.

---

## "Medium things"

### M1 — Varietal dropdown should close on a second arrow click

**Confirmed.** The chevron in `VarietalCombobox` is decorative — it carries
`pointer-events-none` (`Sidebar.tsx:292`). Clicks land on the input instead, and
the Headless UI `Combobox` is in `immediate` mode (`Sidebar.tsx:274`), so
focusing opens the panel and there is no way to toggle it shut.

**Fix.** Replace the decorative icon with a real `ComboboxButton` and drive the
chevron rotation from the render-prop `open` state, matching how `AvaTreeFilter`
already behaves (`AvaTreeFilter.tsx:113–132`).

### M2 — Clearing the varietal should reopen the list

**Confirmed.** The X handler clears the value and the query (`Sidebar.tsx:286`)
and the `onMouseDown` preventDefault keeps focus in the input, but nothing
reopens the options panel. Fixed alongside M1 by reopening explicitly after the
clear.

### M3 — Varietal box should collapse like the others, open by default

**Valid.** Varietal is the one facet rendered as a bare `div` rather than a
`FacetGroup` (`Sidebar.tsx:699–711`). `FacetGroup` already accepts `defaultOpen`
(`Sidebar.tsx:103`), so this is a wrapper change:

```tsx
<FacetGroup label="Varietal" hasSelection={!!filters.mainVarietal} defaultOpen>
```

One thing to verify: the combobox panel is absolutely positioned at `z-[200]`
(`Sidebar.tsx:294–296`). Inside a collapsible group it is fine on desktop, but
needs checking inside the mobile `BottomSheet`, which clips overflow.

### M4 — Checkboxes should not be exclusive

**Valid, and the backend is already built for it.** `matchesFilter` matches
`type`, `stateProvince`, `mainVarietal`, `region` and `specialDesignation`
against a comma-separated OR list (`wine-search.ts:7`, `63–67`), and `ava` does
the same (`55–58`). This is a frontend-only change.

Work required:
- `Filters` values become `string[]` for the multi-select facets
  (`Sidebar.tsx:15–29`, `emptyFilters:31–45`).
- `FacetList` toggles membership instead of replacing (`Sidebar.tsx:227–234`).
- `ActiveChips` emits one chip per value (`Sidebar.tsx:546–602`) — also fixes a
  latent React key collision, since chips are keyed on `label` (`:585`).
- `buildParams` joins the arrays and flat-maps the expanders
  `expandAva` / `expandRegion` / `expandDesignation` across selections, deduping
  the result (`App.tsx:59–74`).
- `activeFilterCount` counts non-empty arrays (`App.tsx:43`).

**Take the tester's fallback seriously.** They offered *"alternatively, if this
is too hard, they should be radio buttons"* — the checkbox *shape* is what
promises multi-select. So any facet that stays single-select must be re-rendered
as a radio (`FacetOption`, `Sidebar.tsx:140–183`). Review Date is the clear case:
it draws checkboxes but is semantically one range. → **Q5**

### M5 — A single vintage should be allowed

**Confirmed bug.** `SidebarDualRange` rejects equal endpoints in both directions:
`commitLo` errors when `loVal >= hiVal` (`Sidebar.tsx:372`) and `commitHi` when
`hiVal <= loVal` (`:383`). The slider handles enforce the same gap, clamping to
`hi - 1` and `lo + 1` (`:436`, `:445`).

**Fix.** Relax both comparisons to strict (`>` / `<`) and let the handles meet.
The server side is already inclusive — `vintageMin`/`vintageMax` use `>=`/`<=`
(`wine-search.ts:68–75`) — so 2022–2022 returns the 2022 wines once the UI stops
blocking it. Same fix applies to Price and Score, which share the component.

---

## "Minor things / Cosmetics"

### C1 — Placeholder text gets cut off

**Confirmed.** `SearchBar.tsx:36` reads *"Search winery, varietal, vintage…
(press Enter)"*, which overflows on narrow viewports — and the tester's real
complaint is underneath it: *"some people don't know to do it."*

Shortening the string treats the symptom. The root cause is that `SearchBar`
only commits on Enter (`SearchBar.tsx:33`) even though `App` already debounces
every search by 300 ms (`App.tsx:109–119`).

**Recommendation:** commit the query on a debounce as the user types, keep Enter
as an instant commit, and drop the parenthetical entirely — placeholder becomes
*"Search winery, varietal, appellation…"*. Care needed not to stack two
debounces. → **Q7**

### C2 — "Date" → "Review Date"

Trivial. Two `<option value="publicationDate">` labels, desktop and mobile
(`App.tsx:181` and `App.tsx:215`).

### C3 — "State/Province" → "State/Province/Region"

Trivial. The facet label (`Sidebar.tsx:741`) and, for consistency, the detail
panel row (`WineDetail.tsx:113`). The underlying field and query parameter stay
`stateProvince`. See **Q6** — the reason for this rename is a data question
worth answering properly.

---

## "Nice to haves"

### N1 — Highlight the search term in the review text

**Valid.** Needs the active query threaded into `WineDetail`, which currently
receives only the wine (`App.tsx:264`), then a small `<Highlight>` component
wrapping matches in `<mark>` in the review paragraph (`WineDetail.tsx:194–196`).
Extending it to the card name and preview (`WineCard.tsx:111–153`) is cheap once
the component exists. → **Q10**

**One fiddly part worth budgeting for:** highlighting has to use the same fold
from B1 so that searching `semillon` highlights `Sémillon`, but `normalize('NFD')`
changes string length — so the folded match offsets must be mapped back to
offsets in the original string. Straightforward with a per-character index map;
just not a one-liner.

### N2 — Merlot in the name over Merlot in the description

Same request as B2. Resolved by the relevance ranking above; no separate work.

---

## Open questions

These need the site owner's answer before the affected work can be built
correctly.

**Q1 — Matching policy.** Should a text query still match *mid-word* substrings
(so `gard` matches `Bogardus`, and `ita` matches `Capitalize`)? My
recommendation is to keep it as the lowest-ranked tier, so real winery hits
always sort above it and nothing that works today stops working. The alternative
— word-prefix matching only — gives cleaner results but silently drops matches
people may rely on. Which do you want?

**Q2 — Relevance as a sort mode.** When someone types in the search box, should
Sort by switch itself to "Relevance" (and revert to Rating when the box is
cleared)? Without this, ranking work is invisible: results get re-sorted by
rating and the Kiona problem persists. Should "Relevance" also appear as a
manually selectable option in the dropdown?

**Q3 — Stale selections when a facet narrows.** If someone selects Albariño and
then selects Wine Type = Red, Albariño is no longer a valid option. Should it be
(a) cleared automatically, (b) kept and shown as selected even though it now
returns nothing, or (c) kept and marked "(0)"? I lean toward (b) or (c) — never
silently discard a choice the user made — but it is your call.

**Q4 — Result counts in facets.** Should facet options show counts, e.g.
"Red (1,842)"? It makes the narrowing legible and comes nearly free once
faceting exists, at the cost of visual noise in a deliberately quiet sidebar.

**Q5 — Scope of multi-select.** Wine Type and State/Province are explicitly
requested. Should multi-select also cover Varietal, Appellation, Home Region and
Special Designation? Varietal and the two trees are meaningfully more work than
the checkbox lists. And to honour the tester's point about checkbox shape: is it
acceptable for any facet that stays single-select — Review Date at minimum — to
be redrawn as radio buttons?

**Q6 — What is "America", and what lives outside the PNW?** The request to
rename the label to "State/Province/Region" implies `stateProvince` contains
values like "America" that are not states. To build B5 correctly I need:
  - the actual list of `stateProvince` values in the data, and what "America" means
    (US wines outside the Pacific Northwest? imports? unclassified?);
  - what selecting it should do to the Appellation and Home Region lists.

Related, and independently worth fixing: the Appellation filter renders a
fixed PNW hierarchy (`ava-tree.ts`), so **any appellation in your data that
isn't in that tree cannot be filtered on today.** Should the tree gain an
"Other appellations" group fed from the data, so nothing is unreachable?

**Q7 — Live search.** Is it fine to drop the "press Enter" requirement and search
as the user types (debounced), with Enter still working? This is what actually
fixes the complaint behind C1; if you'd rather keep Enter mandatory, we shorten
the placeholder and the underlying confusion stays.

**Q8 — Rating sort mixes two scales.** Star reviews parse to 0–5 and scored
reviews to 80–100 on the same axis (`wine-utils.ts:11–17`), so sorting by Rating
puts every scored wine above every starred wine, and unrated wines at zero. No
tester flagged it, but it is the same defect class as B3. Intended? Or should
starred wines be interleaved (mapping stars onto the 100-point band), or sorted
last the way no-price wines will be?

**Q9 — What counts as "no price"?** `mapWPReview` collapses empty, `NA`, and `0`
into `N/A` (`wp-client.ts:73–78`). Confirming `$0` is always "unknown price" and
never a genuine zero-cost pour, since B3 will bury those rows at the bottom of
every price sort.

**Q10 — Highlighting scope.** Detail view only, as the tester described, or also
the result cards? Cards would make scanning results faster but adds visual
weight to a list already carrying score badges and price.

---

## Notes on the repo, found while assessing

Not part of the feedback, but they affect this work:

- **`CLAUDE.md` is out of date on architecture.** It states search and filter
  logic live in `mcp/src/tools/` and that the web app imports `mcp/dist/tools/`
  at runtime. There is no `mcp/` directory in the repository; that logic now
  lives in `web/server/wine-search.ts` and `web/server/wine-utils.ts`. The build
  and deploy instructions that reference `cd mcp && npm run build` should be
  corrected before someone follows them.
- **`FilterPanel.tsx` (563 lines) and `Header.tsx` (257 lines) are dead code** —
  neither is imported anywhere. `FilterPanel` contains its own copy of the price
  slider and filter logic, which is exactly the kind of thing that attracts a
  fix meant for `Sidebar.tsx`. Recommend deleting both before Phase 1.
- **`web/cache/wines.json` is gitignored and absent here**, so I could not
  inspect real values for `stateProvince`, `ava`, `type`, or `mainVarietal`.
  Q6, Q8 and Q9 all depend on that data — a copy of the cache file, or the
  output of `/api/meta`, would let me answer them without guessing.
- **Every phase needs a plugin rebundle.** Per `CLAUDE.md`, UI changes require
  bumping the version in `wordpress-plugin/wine-agent-api.php` (currently
  2.18.0) and repackaging the zip, since it embeds the built assets.

---

## Suggested sequencing

**Phase 1 — search correctness and quick wins.** B1, B2/N2, B3, M1, M2, M3, M5,
C1, C2, C3. This is the release the testers will feel most: search stops failing
on accented names, winery searches return the winery, price sorts behave, and
the varietal control stops fighting back. Blocked only on Q1, Q2, Q7.

**Phase 2 — faceted filters and multi-select.** B4, B5, B6, M4. One architectural
change to `/api/meta` plus the `Filters` type migration. Blocked on Q3, Q4, Q5,
Q6.

**Phase 3 — highlighting.** N1. Independent of everything else; can slip without
holding up a release.

Phase 1 can start as soon as Q1, Q2 and Q7 are answered — Q6 and the data
questions only gate Phase 2.
