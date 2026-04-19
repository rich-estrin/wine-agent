# Deploy to AWS EC2 + WordPress Plugin

The app is embedded in a live WordPress site via the `[wine-search]` shortcode.
- WP serves JS/CSS from the plugin zip (bundled assets)
- WP proxies `/wp-json/wine-agent/v1/search|meta` → EC2 `/api/*`
- EC2 only serves `/api/*` — no static files on EC2

Read connection info from `web/.env`, then execute these steps using the Bash tool.

## Steps

1. **Load config** — parse `web/.env` and extract:
   - `EC2_HOST`, `EC2_USER`, `EC2_KEY`, `EC2_PATH`

2. **Build MCP server**
   ```bash
   cd /Users/rich/src/wine-agent/mcp && npm run build
   ```

3. **Build web frontend** (no VITE_BASE_PATH — assets are served from WP, not EC2)
   ```bash
   cd /Users/rich/src/wine-agent/web && npm run build
   ```

4. **Repackage WordPress plugin zip** (bundles the fresh JS/CSS assets)
   ```bash
   cd /Users/rich/src/wine-agent/wordpress-plugin
   rm -f wine-agent-api.zip
   mkdir -p wine-agent-api/assets
   cp wine-agent-api.php wine-agent-api/
   cp ../web/dist/.vite/manifest.json wine-agent-api/assets/
   cp ../web/dist/assets/* wine-agent-api/assets/
   zip -r wine-agent-api.zip wine-agent-api/ && rm -rf wine-agent-api
   ```

5. **Remind the user** to upload `wordpress-plugin/wine-agent-api.zip` to WP Admin → Plugins → Update (this cannot be automated from here).

6. **Deploy to EC2 and restart PM2** — run as a single command (pre-approved in .claude/settings.json):
   ```bash
   bash scripts/deploy-ec2.sh
   ```
   This script reads EC2 connection info from `web/.env` and handles rsync of mcp/dist, web/server, package files, wines.json cache, and PM2 restart in one shot.

10. **Confirm** — report that EC2 is restarted and remind the user to install the updated plugin zip in WP Admin.
