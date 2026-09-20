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

`battery.json` — ~85 requests covering accent folding, word-start matching,
apostrophe elision (`lecole` → `L'Ecole`), tasting-note widening (`notes=1`),
every filter key the app sends, comma-separated OR lists, each range pair
including star-rating and blank-cases exclusion, all sorts in both directions,
the `relevance` alias, pagination and its clamps, unrecognised keys, and
faceted meta.

### Expected divergences

An entry may carry `expectDivergence`, which makes the case *required* to
differ — the run fails if it stops differing. There are none at present: both
sides now ignore any query param outside the filter allowlist, which is what
the two former entries (`_locale`, `rest_route`) existed to excuse.

### What the battery cannot cover

It runs the PHP against SQLite, so anything where SQLite and MySQL disagree is
invisible to it. A negative `LIMIT` is the known case — SQLite reads it as "no
limit", MySQL rejects it as a syntax error. Bounds like that are asserted on
the query plan instead, in `scripts/plugin-query-test.php`.

## When to run it

Any time either implementation's search logic changes — the TS in
`web/server/`, or the PHP in `wordpress-plugin/includes/`. The Node side is the
reference: if the two disagree, the PHP is wrong unless the battery says
otherwise.

This harness covers semantics, not MySQL itself. After uploading a new plugin, spot-check the embedded page on the real site (see `DEPLOYMENT.md`).
