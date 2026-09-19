---
name: deploy
description: Build and package the wine-agent WordPress plugin. Use when the user says /deploy, "deploy", "ship it", "push to server", or "build and deploy".
version: 3.0.0
---

# Deploy the wine-agent app

There is **one delivery target**: the WordPress plugin. End users load the React
app via the `[wine-search]` shortcode, which serves the JS **bundled inside the
plugin zip**, and search is answered from an index table in WordPress's own
database. There is no EC2 server, no data cache to rsync and no webhook.

## A. Frontend build + plugin repackage

1. **Build the frontend with the default base path** (do NOT set `VITE_BASE_PATH` — assets are served from the plugin dir via `plugins_url()`, not from an EC2 path). CSS is injected via JS, so there is no separate `.css` file.
   ```bash
   cd /Users/rich/src/wine-agent/web && npm run build
   ```

2. **Bump the plugin version** in `wordpress-plugin/wine-agent-api.php` header (`* Version: X.Y.Z`) — required on every plugin/asset change.

3. **Repackage the plugin zip** (bundles the fresh assets):
   The zip is **named for the version it carries** — `wine-agent-api-2.23.0.zip` —
   so the file on disk and in the user's Downloads is never ambiguous about what
   it contains. Read the version out of the header rather than typing it:
   ```bash
   cd /Users/rich/src/wine-agent/wordpress-plugin
   VER=$(grep -m1 -E '^\s*\*\s*Version:' wine-agent-api.php | sed -E 's/.*Version:[[:space:]]*//')
   rm -f wine-agent-api.zip; rm -f ./wine-agent-api-[0-9]*.zip   # drop older builds
   mkdir -p wine-agent-api/assets
   cp wine-agent-api.php wine-agent-api/
   cp -r includes wine-agent-api/          # native search core — omitting it fatals on load
   cp ../web/dist/.vite/manifest.json wine-agent-api/assets/
   cp ../web/dist/assets/* wine-agent-api/assets/
   zip -rq "wine-agent-api-$VER.zip" wine-agent-api/ && rm -rf wine-agent-api
   unzip -l "wine-agent-api-$VER.zip"       # confirm includes/ is in the listing
   cp "wine-agent-api-$VER.zip" ~/Downloads/    # where the user uploads it from
   ```

4. **Manual step (cannot be automated):** the user uploads the new zip at
   `northwestwinereport.com/staging/wp-admin/` → Plugins → Add New → Upload Plugin → replace + activate.
   Tell the user to do this, then press **Rebuild index** if the plugin schema changed, and what UI changes to verify.


## B. Verify

5. Run `cd web && npm run test:plugin` before packaging — it catches anything that would fatal on activation.

6. After the user uploads the zip: on a first install or a schema change, Settings → Wine Agent API → **Rebuild index** (press Continue until done). Then check the embedded page: search with accents ("semillon") and apostrophes ("lecole"), tick Search tasting notes, exercise each filter, and confirm the dropdowns narrow each other.
