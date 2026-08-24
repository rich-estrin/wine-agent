# Search parity harness

Proves the WordPress-native search (PHP + SQL) answers exactly what the Node
reference implementation answers.

```bash
cd web && npm run test:parity      # or: node scripts/parity/compare.mjs
node scripts/parity/compare.mjs --verbose   # per-case results and line diffs
```

## How it works

Both sides answer the same battery of requests over the same dataset, and the
JSON is diffed:

| | dataset | implementation |
|---|---|---|
| **Node** | `FixtureClient` over the combined fixture | the real Express routes via `createApp()` |
| **PHP** | the same fixture, indexed into in-memory SQLite | the real `wine_agent_run_search()` / `wine_agent_run_meta()` |

The PHP side runs the *production* handler core — only the database executor is
swapped (PDO/SQLite instead of `$wpdb`/MySQL). Nothing is reimplemented for the
test, so a passing run is evidence about the shipping code.

SQLite stands in for MySQL soundly because the query builders emit only plain
SQL: `LIKE` over columns that were folded in PHP at index time, `(col IS NULL)`
ordering, `GROUP BY`. There is no collation dependence, no `REGEXP`, and no
MySQL-specific function anywhere in the generated queries — which is also why
the search behaves identically on MySQL and MariaDB.

## Dataset

`web/fixtures/wines.json` plus `fixture-extra.json`, which adds the edge cases
the committed fixture doesn't carry: star ratings (`***1/2`, `*****`), absent
and `$0` prices, a missing publication date, `0` and blank case counts,
apostrophe compounds (`L'Ecole`, `Colter's`), accented names (`Gård`, `Ítalo`,
`Château`, `Sémillon`), a blend with no varietal label, and every designation
group.

## Battery

`battery.json` — ~90 requests covering accent folding, word-start matching,
apostrophe elision (`lecole` → `L'Ecole`), tasting-note widening (`notes=1`),
every filter key, operator syntax (`rating=>90`), comma-separated OR lists,
each range pair including star-rating and blank-cases exclusion, all sorts in
both directions, the `relevance` alias, pagination, and faceted meta.

### Expected divergences

An entry carrying `expectDivergence` is *required* to differ, and the run fails
if it stops differing. Both current entries are the same deliberate deviation:
WordPress injects its own params (`_locale`, `rest_route`) into REST requests,
and Node's `collectFilters` would read them as wine fields and silently empty
every result. The native handler skips them. This is unreachable in the Node
deployment, which never sees those params.

## When to run it

Any time either implementation's search logic changes — the TS in
`web/server/`, or the PHP in `wordpress-plugin/includes/`. The Node side is the
reference: if the two disagree, the PHP is wrong unless the battery says
otherwise.

This harness covers semantics, not MySQL itself. Before flipping a site to
native mode, also run the staging A/B check described in `DEPLOYMENT.md`, which
compares proxy and native answers over the real dataset on the real database.
