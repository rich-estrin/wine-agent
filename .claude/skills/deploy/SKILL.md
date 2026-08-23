---
name: deploy
description: Deploy the wine-agent app to AWS EC2 + WordPress. Use when the user says /deploy, "deploy", "ship it", "push to server", or "build and deploy".
version: 2.1.0
---

# Deploy the wine-agent app

There are **two delivery targets**, and most deploys touch both:

- **Backend (EC2)** — the Express API at `/api/*`. Receives `web/server/`, the shared `web/src/` modules the server imports (`src/data/`, `src/lib/`, `src/types.ts`), and the `web/cache/wines.json` data cache.
- **Frontend (WordPress plugin)** — end users load the React app via the `[wine-search]` shortcode, which serves the JS **bundled inside the plugin zip**. EC2 does **not** serve static assets. So shipping UI changes means rebuilding the frontend, repackaging the plugin zip, and uploading it to WordPress.

There is **no `mcp/` directory** — the server is self-contained in `web/server/`. Besides its own files it imports a few modules from `web/src/` (currently `../src/data/*.js`, `../src/lib/text.js`, and `../src/types.js`), so those must ship too or the server won't boot. Ignore any older instructions referencing `mcp/`.

Read connection info from `web/.env`: `EC2_HOST`, `EC2_USER`, `EC2_KEY`, `EC2_PATH`, `EC2_BASE_PATH`.

## A. Frontend build + plugin repackage (when UI changed)

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

4. **Manual step (cannot be automated):** the user uploads `wine-agent-api.zip` at
   `northwestwinereport.com/staging/wp-admin/` → Plugins → Add New → Upload Plugin → replace + activate.
   Tell the user to do this and what UI changes to verify.

## B. Backend deploy (when server logic or data changed)

5. **Deploy server source + the shared `src/` modules it imports** (never deploy `web/.env` — EC2 has its own). All four paths are required: the server imports from `src/data/`, `src/lib/`, and `src/types.ts`, and a missing one is a boot-time `ERR_MODULE_NOT_FOUND`.
   ```bash
   rsync -az -e "ssh -i ${EC2_KEY}" /Users/rich/src/wine-agent/web/server/    ${EC2_USER}@${EC2_HOST}:${EC2_PATH}/web/server/
   rsync -az -e "ssh -i ${EC2_KEY}" /Users/rich/src/wine-agent/web/src/data/   ${EC2_USER}@${EC2_HOST}:${EC2_PATH}/web/src/data/
   rsync -az -e "ssh -i ${EC2_KEY}" /Users/rich/src/wine-agent/web/src/lib/    ${EC2_USER}@${EC2_HOST}:${EC2_PATH}/web/src/lib/
   rsync -az -e "ssh -i ${EC2_KEY}" /Users/rich/src/wine-agent/web/src/types.ts ${EC2_USER}@${EC2_HOST}:${EC2_PATH}/web/src/types.ts
   ```
   If the server ever grows a new `../src/...` import, add its path here. Quick check: `grep -rhoE "from '\.\./src/[^']+'" web/server/*.ts | sort -u` lists everything the server pulls from `src/`.

6. **Deploy deps only if package files changed:**
   ```bash
   rsync -az -e "ssh -i ${EC2_KEY}" /Users/rich/src/wine-agent/web/package.json /Users/rich/src/wine-agent/web/package-lock.json ${EC2_USER}@${EC2_HOST}:${EC2_PATH}/web/
   ssh -i ${EC2_KEY} ${EC2_USER}@${EC2_HOST} "cd ${EC2_PATH}/web && npm install --omit=dev --silent"
   ```

7. **Data cache** — EC2 runs in **WP REST mode** (`WP_API_URL` set to the staging install). It loads `web/cache/wines.json` and only refetches if the cache's `wpUrl` differs from `WP_API_URL`.
   **Cloudflare blocks EC2's datacenter IP**, so EC2 cannot fetch from WordPress directly — a refetch crash-loops on a 403. **Always generate the cache on the Mac and rsync it up.** See the `project_rest_mode_data_refresh` memory for the full procedure. To ship the current local cache:
   ```bash
   ssh -i ${EC2_KEY} ${EC2_USER}@${EC2_HOST} "mkdir -p ${EC2_PATH}/web/cache"
   rsync -az -e "ssh -i ${EC2_KEY}" /Users/rich/src/wine-agent/web/cache/wines.json ${EC2_USER}@${EC2_HOST}:${EC2_PATH}/web/cache/wines.json
   ```
   The local cache's `wpUrl` must equal EC2's `WP_API_URL` (both the staging URL) or EC2 will try to refetch and fail.

8. **Restart PM2 (with env refresh):**
   ```bash
   ssh -i ${EC2_KEY} ${EC2_USER}@${EC2_HOST} "pm2 restart wine-api --update-env && sleep 3 && pm2 logs wine-api --lines 6 --nostream --out"
   ```
   Confirm the log shows `Loaded NNNNN wines from cache` — not a fetch attempt.

## C. Verify

9. Sanity-check the live API over SSH (auth header value is EC2's `WEBHOOK_SECRET`):
   ```bash
   ssh -i ${EC2_KEY} ${EC2_USER}@${EC2_HOST} 'cd '"${EC2_PATH}"'/web && K=$(grep -E "^WEBHOOK_SECRET=" .env | cut -d= -f2-) && curl -s -H "X-Wine-Agent-Key: $K" "http://localhost:3001/api/meta" | head -c 300'
   ```

10. Report status: backend live + verified; remind the user to upload the plugin zip (step 4) to push the UI, and what to check on the embedded page.

## D. Native mode (search served from the WordPress database)

As of plugin 2.27.0 the search can run entirely inside WordPress, reading an
index table in the site's own database. Native mode makes steps 5–8 above
unnecessary — no EC2 deploy, no cache rsync, no webhook — because there is no
second server holding a copy of the data.

**A site's mode is a plugin setting, not a property of the build.** Shipping the
zip never changes it; the switch is deliberate and reversible from the settings
page.

### Rolling a site onto native mode

1. Upload the plugin zip as in step 4 (it carries `includes/` — verify with
   `unzip -l`).
2. Settings → Wine Agent API → **Rebuild index**. Press Continue until it
   reports done; an 18k-review site takes several passes.
3. Tick **Allow `?wa_mode=` to override the mode per request**, then run the
   live A/B from the repo:
   ```bash
   node scripts/parity/run-remote.mjs https://northwestwinereport.com/staging
   ```
   This asks the site every parity-battery query both ways and diffs the
   answers over the real dataset. It must report all cases matching before the
   switch. It also prints median latency per mode, which is the real answer to
   "is native slower here" on that host.
4. Set **Search Mode → Native** and save. Check the embedded page: search with
   accents ("semillon") and apostrophes ("lecole"), tick Search tasting notes,
   exercise each filter, and confirm the dropdowns now narrow each other.
5. Save a review in the editor and confirm it appears in search immediately.
6. Untick the mode-override setting.

### Rollback

Set Search Mode → Proxy. The EC2 webhook keeps firing while both are wired up,
so the Node cache stays current and the rollback is immediate and lossless.

### Decommissioning EC2

Only after native mode has soaked. At that point steps 5–8 of this skill, the
`web/cache/wines.json` rsync, the webhook, and the Search App URL setting are
all dead weight — and the Cloudflare-blocks-EC2 problem that forces cache
builds onto the Mac stops mattering, because WordPress reads its own database.
