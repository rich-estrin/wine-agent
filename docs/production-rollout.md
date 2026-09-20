# Wine Agent — Production Rollout Runbook

**Audience:** the maintainer of `northwestwinereport.com`. This assumes WP Admin
access to the production site and no knowledge of the Wine Agent codebase.

**What you are installing:** one WordPress plugin. It adds a searchable,
filterable interface over the site's existing `reviews` posts, embedded on a page
via a shortcode. There is no external server, no API account and no third-party
service — search is answered from a table in this site's own database.

**Time required:** about 45–60 minutes, most of it the one-time index build.
No maintenance window is needed; nothing becomes public until you choose to
publish it in step 7.

---

## 1. What the plugin adds to the site

So you know exactly what is being introduced, and what to remove if you back out:

| Kind | Name |
|---|---|
| Plugin directory | `wp-content/plugins/wine-agent-api/` |
| Database table | `{prefix}wine_agent_index` (plus `_new` / `_old` transiently during a rebuild) |
| Options | `wine_agent_search_key`, `wine_agent_index_version`, `wine_agent_index_built_at`, `wine_agent_index_rebuild_offset`, `wine_agent_index_rebuild_dirty` |
| Cron events | `wine_agent_index_nightly` (daily rebuild), `wine_agent_index_continue` (rebuild continuation) |
| REST routes | `GET /wp-json/wine-agent/v1/search`, `/meta` (public), `/reviews` (API-key protected) |
| Database lock | A MySQL advisory lock named `wine_agent_rebuild_<db>_<prefix>`, held only while a rebuild pass runs |
| Shortcode | `[wine-search]` |
| Admin screen | Settings → Wine Agent API |

It **reads** `wp_posts` and `wp_postmeta` for published `reviews` posts. It never
writes to them. The index table is a cache, never a second source of truth — it
is rebuilt from the posts every night, so deleting it loses nothing.

---

## 2. Preflight — check before you install

Run through all seven. Any "no" answer should be resolved before step 4, not
after.

**2.1 PHP 7.4 or newer.** Tools → Site Health → Info → Server. The plugin header
declares `Requires PHP: 7.4`, so WordPress will refuse to activate on anything
older rather than breaking the site.

**2.2 WordPress 5.9 or newer.** Declared as `Requires at least: 5.9`.

**2.3 The review post type is `reviews`.** Open any published review in the
editor and check the URL: it should contain `post_type=reviews` (or the permalink
structure should reflect it). The plugin only indexes posts whose
`post_type` is exactly `reviews` and whose status is `publish`. Drafts, pending
and privately-published reviews are deliberately excluded.

**2.4 ACF is active and the review fields use these meta keys.** This is the
single most likely thing to differ between environments, and the one that
produces a working-but-wrong result rather than an obvious error. The plugin
reads exactly these keys:

```
publishedDate        review_content       rating              price
vintage              wine_type            designation         variety_style
home_region          appellation          varietal_label      special_designation
alcohol_percentage   closure              cases               state_or_province
source               reviewer_user
```

The review title (`post_title`) is used as the producer/brand name.

To confirm, pick one published review and compare its ACF field names against
that list — in ACF the field *name* (not the label) is the meta key. If a key
differs, **stop and report it** before installing; the plugin needs a code change,
not a configuration change.

**2.5 The database user can create and rename tables.** The index build issues
`CREATE TABLE`, `RENAME TABLE` and `DROP TABLE` against the site's own database.
Standard on every WordPress host; worth confirming if this site runs with a
restricted DB grant. MySQL and MariaDB are both fine.

**2.6 You know how to restore a backup.** Take one in step 3. You should be able
to restore files *and* database.

**2.7 You know which page will host the search, and what it replaces.** Note the
URL of the existing search page now. You will need it in step 7.

---

## 3. Back up

Take a full backup (files + database) through your host's usual mechanism, and
confirm it completed before continuing.

The realistic worst case is small — the plugin adds one table and reads
everything else — but step 7 edits a live page, and that is worth a restore point.

---

## 4. Install the plugin

1. **WP Admin → Plugins → Add New → Upload Plugin**
2. Choose `wine-agent-api-<version>.zip` (e.g. `wine-agent-api-2.31.0.zip`)
3. **Install Now**, then **Activate**

If WordPress reports the plugin requires a newer PHP or WordPress version, that
is preflight 2.1/2.2 failing — do not force it.

Activation creates the index table and schedules the nightly rebuild. It does
**not** change anything a visitor can see: no shortcode is on any page yet.

---

## 5. Build the search index

Search returns HTTP 503 until the index has been built once. Build it now,
before anything is public.

1. Go to **Settings → Wine Agent API**. You should see a red notice: *"The search
   index is not ready."* That is expected on a fresh install.
2. Press **Rebuild index**.
3. Each press processes reviews for about 20 seconds and then reports progress —
   *"Indexed 10,000 of 18,355 reviews. Press Continue to carry on."* Press
   **Continue rebuild** until it reports **"Index rebuilt: N reviews."**
   Expect two to four presses on a site this size.

The work is sliced deliberately so a large site never hits `max_execution_time`.
Rows are written to a staging table and swapped in atomically at the end, so
readers never see a half-built index. Reviews saved while a rebuild is running
are re-applied to the new index immediately after the swap, so an edit made
mid-rebuild is not lost with the table it was written to.

### 5.1 Verify the count

When it reports done, check that **N matches the number of published reviews**.
Compare against **WP Admin → Reviews**, which shows the published count.

If N is lower, press **Start over** and let it run to completion again.

This is a sanity check, not a known failure mode. Only one rebuild pass can run
at a time — the plugin takes a database lock — so a background rebuild and your
button press cannot overlap and cannot skip rows between them. If you press
**Rebuild index** while a background pass is running, you will simply be told so
and can reload the page to watch its progress.

If a press ever returns a PHP error or a white screen mid-rebuild, reload the
settings page and press **Continue rebuild** — progress is stored, so it resumes
rather than restarting.

---

## 6. Verify privately, before anything goes live

1. Create a **new page**, set it to **Draft** or **Private**, and put the
   shortcode `[wine-search]` in the content as its own block. Nothing else.
2. Preview it (as an administrator).

Work through all of this on the preview:

- [ ] The app renders — filter sidebar on the left, wine cards on the right — and
      the result count is non-zero and roughly matches your published review count
- [ ] Type `semillon` (no accent). Sémillon wines come back — accent folding works
- [ ] Type `lecole` and separately `l'ecole`. Both find L'Ecole — apostrophe
      handling works
- [ ] Open **Advanced** and tick **Search tasting notes**, then search for a word
      that only appears in a tasting note. Results widen
- [ ] Exercise each filter: Wine Type, Varietal, Score, Vintage, Price,
      State/Province, and under Advanced: Appellation, Review Date, Cases, Home
      Region, Special Designation
- [ ] Confirm the filters narrow **each other** — choosing a Wine Type shortens
      the Varietal list; choosing a State shortens the Appellation list
- [ ] Sort by each option and confirm the order changes sensibly
- [ ] Open a wine to its detail view and confirm the tasting note, score and
      price render
- [ ] Load the page **on a phone**. The filter bar sits at the top and opens a
      slide-up sheet
- [ ] Open the browser console (F12). There should be no red errors

### 6.1 Two conflicts to check specifically

**Other blocks on the page.** The shortcode deliberately de-registers
WordPress's bundled React (`react`, `react-dom`, `wp-element`) so they cannot
collide with the copy inside the app. Any *other* plugin or block on the same
page that needs those scripts will break. Keep the search page minimal — the
shortcode plus ordinary text — and if you must add another interactive block,
retest this page after doing so.

**Caching and Cloudflare.** The site sits behind Cloudflare, and the app's
requests are ordinary same-origin URLs, so they can be caught by page caching
rules:

- [ ] Exclude `/wp-json/wine-agent/v1/*` from page caching and from any CDN cache
      rule. These responses vary by query string and must not be shared between
      visitors. The plugin sends no-cache headers, but an aggressive page-cache
      plugin or CDN rule can override them
- [ ] Confirm the search page itself is excluded from full-page caching, or that
      your cache passes query strings through
- [ ] Check that **Rocket Loader**, JS minification/concatenation and any
      "optimize JavaScript" feature are **not** applied to the app bundle
      (`/wp-content/plugins/wine-agent-api/assets/index-*.js`). Rewriting that
      file will break the app. If you cannot scope the exclusion narrowly,
      disable Rocket Loader for the search page

If the app works in preview but breaks once the page is public, caching is the
first thing to suspect.

---

## 7. Go live

Only after step 6 passes cleanly:

1. Put `[wine-search]` on the **real** search page — the one you noted in
   preflight 2.7 — replacing the existing search.
2. Update it and load the public URL, logged out, in a private window.
3. Re-run the quick checks: search `semillon`, apply two filters, load it on a
   phone.
4. Retire what it replaced. If the old search lived on a *different* URL, add a
   redirect from the old URL to the new one, and update any menu or internal
   links pointing at it.
5. Delete the temporary draft/private page from step 6.

Keep the old search's plugin or code in place but unused for a week or so, so
reverting is a page edit rather than a reinstall.

---

## 8. Post-launch checks

**Same day:**

- [ ] Open a published review in the editor, change the tasting note, update it,
      then search for the new wording. It should appear immediately — index
      updates ride the save. This is the single best end-to-end confirmation
- [ ] Trash a review (pick a test one), confirm it drops out of search, untrash
      it, confirm it returns

**Next day:**

- [ ] Settings → Wine Agent API → **Last full rebuild** shows a timestamp from
      overnight. That confirms the nightly cron is running
- [ ] **Indexed reviews** still matches the published review count

If the nightly rebuild did not run, the site most likely has `DISABLE_WP_CRON`
set with a system cron that fires too infrequently to complete a chained
rebuild. It is not urgent — incremental updates keep the index current on their
own — but press **Rebuild index** manually after any bulk import or direct
database edit.

---

## 9. Rollback

Pick the lightest step that resolves the problem.

**The page looks wrong but search works:** remove `[wine-search]` from the page
and restore the previous content. Nothing else to undo.

**The app is broken or search errors:** WP Admin → Plugins → **Deactivate**
"Wine Agent API". That unschedules both cron events immediately. The page shows
an unrendered shortcode, so remove it from the page too. The index table is left
in place, harmless.

**Full removal:** deactivate, then **Delete** the plugin. Then drop the leftovers:

```sql
DROP TABLE IF EXISTS {prefix}wine_agent_index;
DROP TABLE IF EXISTS {prefix}wine_agent_index_new;
DROP TABLE IF EXISTS {prefix}wine_agent_index_old;
DELETE FROM {prefix}options WHERE option_name LIKE 'wine_agent_%';
```

Replace `{prefix}` with the site's actual table prefix (usually `wp_`). No
`reviews` post or ACF field is touched by any of this.

**The site is down:** restore the step 3 backup.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Search box returns *"Search index is being built"* / HTTP 503 | The index has never completed | Settings → Wine Agent API → **Rebuild index**, press Continue to done (step 5) |
| *"Wine search: assets not found. Re-upload the plugin zip."* | The zip was uploaded without its bundled assets, or partially extracted | Re-upload the zip; confirm `wp-content/plugins/wine-agent-api/assets/` contains a `.js` file and `manifest.json` |
| Fatal error on activation | The zip is missing its `includes/` directory | Get a correctly packaged zip; the plugin requires `includes/wine-index.php` at load |
| Page is blank where the app should be, console shows a React error | Another block on the page needs `wp-element`, or Rocket Loader / JS minification is rewriting the bundle | See 6.1 |
| Results appear but every filter dropdown is empty | The ACF meta keys do not match preflight 2.4 | Stop; report the actual key names — this needs a code change |
| Filters work but a field is always blank on the cards | One meta key differs from preflight 2.4 | Same as above |
| Indexed count is lower than the published review count | Rebuild was interrupted before it finished | **Start over** and let it run to done |
| Reviews published today are missing from search | Index update hook did not fire (importer, direct SQL, or a bulk edit) | Press **Rebuild index**; routine editor saves should not need this |
| Everything works logged in, broken logged out | Page or CDN caching | See 6.1 |
| Rebuild button times out / 502s | Host `max_execution_time` is below the 20-second slice budget | Press **Continue rebuild** repeatedly — progress is stored and resumes |

---

## 11. Acceptance criteria

The rollout is done when all of these are true:

1. Plugin active on production, version recorded
2. **Indexed reviews** equals the published review count
3. **Last full rebuild** shows a timestamp
4. The public search page loads, logged out, with a non-zero result count
5. Accent (`semillon`) and apostrophe (`lecole`) searches return results
6. Every filter group returns results and narrows the others
7. Mobile viewport works
8. A review edited in the editor appears in search immediately
9. `/wp-json/wine-agent/v1/*` is excluded from page and CDN caching
10. The old search is retired or redirected
11. The nightly rebuild has been observed to run once

---

## Appendix A — Building the plugin zip from source

Needed only to produce a *new* zip after a frontend or plugin change. The
runbook above needs nothing from this appendix.

Requires Node.js 18+ and PHP 7.4+ on your own machine (not on the server).

```bash
git clone <repo-url> wine-agent
cd wine-agent/web
npm install
npm run build          # do NOT set VITE_BASE_PATH — assets load from the plugin dir
```

Then bump `* Version:` in `wordpress-plugin/wine-agent-api.php` — required on
every change, because WordPress will not treat the upload as an update
otherwise — and repackage:

```bash
cd ../wordpress-plugin
VER=$(grep -m1 -E '^\s*\*\s*Version:' wine-agent-api.php | sed -E 's/.*Version:[[:space:]]*//')
rm -f wine-agent-api.zip; rm -f ./wine-agent-api-[0-9]*.zip
mkdir -p wine-agent-api/assets
cp wine-agent-api.php wine-agent-api/
cp -r includes wine-agent-api/          # the search core — omitting it fatals on load
cp ../web/dist/.vite/manifest.json wine-agent-api/assets/
cp ../web/dist/assets/* wine-agent-api/assets/
zip -rq "wine-agent-api-$VER.zip" wine-agent-api/ && rm -rf wine-agent-api
unzip -l "wine-agent-api-$VER.zip"      # confirm includes/ is listed
```

Before packaging, run the checks:

```bash
cd ../web
npm test              # unit tests
npm run test:plugin   # catches anything that would fatal on activation
npm run test:parity   # PHP search must agree with the reference implementation
```

`npm run dev:fixture` runs the whole app locally against committed sample data,
with no credentials and no WordPress — the quickest way to see a change.

## Appendix B — Updating an already-installed plugin

Not a first install. Upload the new zip at **Plugins → Add New → Upload Plugin**
and choose **Replace current with uploaded**.

If the release notes mention a schema or index change, the first admin page load
after the upload starts a background rebuild automatically and search returns 503
until it finishes. To avoid that window, go straight to **Settings → Wine Agent
API → Rebuild index** and press Continue to done, then re-check the count as in
step 5.1.
