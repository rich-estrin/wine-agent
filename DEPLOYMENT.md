# Deployment Guide

## Architecture summary

- **WordPress** serves the React app (JS/CSS bundled in the plugin zip) and answers `/wp-json/wine-agent/v1/search` and `/meta` from an index table in its own database
- There is no other server. Builds happen locally; everything ships in the plugin zip

## Deploy procedure

Use `/deploy` in Claude Code to run this automatically, or follow the steps manually.

### 1. Build the React app

```bash
cd web && npm run build
```

No `VITE_BASE_PATH` needed — assets are served from the plugin directory.

### 2. Repackage the WordPress plugin zip

**Always bump the version** in the `wine-agent-api.php` plugin header first.

```bash
cd wordpress-plugin
VER=$(grep -m1 -E '^\s*\*\s*Version:' wine-agent-api.php | sed -E 's/.*Version:[[:space:]]*//')
rm -f wine-agent-api.zip; rm -f ./wine-agent-api-[0-9]*.zip
mkdir -p wine-agent-api/assets
cp wine-agent-api.php wine-agent-api/
cp -r includes wine-agent-api/          # the search core — omitting it fatals on load
cp ../web/dist/.vite/manifest.json wine-agent-api/assets/
cp ../web/dist/assets/* wine-agent-api/assets/
zip -rq "wine-agent-api-$VER.zip" wine-agent-api/ && rm -rf wine-agent-api
```

### 3. Upload the plugin to WordPress

**Pick the target deliberately — the two are separate WordPress installs:**

| Target | WP Admin |
|---|---|
| Staging (default for routine work) | `northwestwinereport.com/staging/wp-admin/` |
| Production (live readers) | `northwestwinereport.com/wp-admin/` |

Ship to staging first and verify there; production gets the same zip once it passes.

1. Go to **WP Admin → Plugins → Add New → Upload Plugin**
2. Upload `wordpress-plugin/wine-agent-api-<version>.zip`
3. Click **Replace current with uploaded** and activate

A **first-ever** install on a site is not this procedure — see
[docs/production-rollout.md](docs/production-rollout.md) for preflight,
initial index build and rollback.

### 4. Build the search index (first install, or after a schema change)

**WP Admin → Settings → Wine Agent API → Rebuild index.** Press Continue until
it reports done; an 18k-review site takes several passes. Until the index is
built, search returns 503. After that it is kept current automatically: saves,
unpublishes, trashes and deletes update it, and a nightly cron rebuilds it in
full.

## Verify

First confirm the upload actually landed. Open the page with the shortcode and
check the browser console — the app logs its version on startup:

```
wine-agent-api 2.41.0
```

That number comes from the plugin header of the build actually serving the
page. A stale version there means the upload did not replace the old files,
whatever WP Admin claims.

Then, on the same page. Search with accents
("semillon") and apostrophes ("lecole"), tick Search tasting notes, exercise each
filter, and confirm the dropdowns narrow each other. Save a review in the editor
and confirm it appears in search immediately.
