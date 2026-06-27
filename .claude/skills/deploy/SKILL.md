---
name: deploy
description: Deploy the wine-agent app to AWS EC2 + WordPress. Use when the user says /deploy, "deploy", "ship it", "push to server", or "build and deploy".
version: 2.0.0
---

# Deploy the wine-agent app

There are **two delivery targets**, and most deploys touch both:

- **Backend (EC2)** — the Express API at `/api/*`. Receives `web/server/`, `web/src/data/`, and the `web/cache/wines.json` data cache.
- **Frontend (WordPress plugin)** — end users load the React app via the `[wine-search]` shortcode, which serves the JS **bundled inside the plugin zip**. EC2 does **not** serve static assets. So shipping UI changes means rebuilding the frontend, repackaging the plugin zip, and uploading it to WordPress.

There is **no `mcp/` directory** — the server is self-contained in `web/server/` (it imports `./wine-search.js` and `../src/data/*.js`). Ignore any older instructions referencing `mcp/`.

Read connection info from `web/.env`: `EC2_HOST`, `EC2_USER`, `EC2_KEY`, `EC2_PATH`, `EC2_BASE_PATH`.

## A. Frontend build + plugin repackage (when UI changed)

1. **Build the frontend with the default base path** (do NOT set `VITE_BASE_PATH` — assets are served from the plugin dir via `plugins_url()`, not from an EC2 path). CSS is injected via JS, so there is no separate `.css` file.
   ```bash
   cd /Users/rich/src/wine-agent/web && npm run build
   ```

2. **Bump the plugin version** in `wordpress-plugin/wine-agent-api.php` header (`* Version: X.Y.Z`) — required on every plugin/asset change.

3. **Repackage the plugin zip** (bundles the fresh assets):
   ```bash
   cd /Users/rich/src/wine-agent/wordpress-plugin
   rm -f wine-agent-api.zip
   mkdir -p wine-agent-api/assets
   cp wine-agent-api.php wine-agent-api/
   cp ../web/dist/.vite/manifest.json wine-agent-api/assets/
   cp ../web/dist/assets/* wine-agent-api/assets/
   zip -rq wine-agent-api.zip wine-agent-api/ && rm -rf wine-agent-api
   unzip -l wine-agent-api.zip
   ```

4. **Manual step (cannot be automated):** the user uploads `wine-agent-api.zip` at
   `northwestwinereport.com/staging/wp-admin/` → Plugins → Add New → Upload Plugin → replace + activate.
   Tell the user to do this and what UI changes to verify.

## B. Backend deploy (when server logic or data changed)

5. **Deploy server source + shared data modules** (never deploy `web/.env` — EC2 has its own):
   ```bash
   rsync -az -e "ssh -i ${EC2_KEY}" /Users/rich/src/wine-agent/web/server/   ${EC2_USER}@${EC2_HOST}:${EC2_PATH}/web/server/
   rsync -az -e "ssh -i ${EC2_KEY}" /Users/rich/src/wine-agent/web/src/data/ ${EC2_USER}@${EC2_HOST}:${EC2_PATH}/web/src/data/
   ```

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
