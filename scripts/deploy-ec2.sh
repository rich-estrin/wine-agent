#!/usr/bin/env bash
# Deploy server-side files to EC2 and restart PM2.
# Run from the repo root. Reads connection info from web/.env.
set -euo pipefail

# ── Load config from web/.env ─────────────────────────────────────────────────
ENV_FILE="$(dirname "$0")/../web/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: web/.env not found" >&2
  exit 1
fi

EC2_HOST=$(grep '^EC2_HOST=' "$ENV_FILE" | cut -d= -f2)
EC2_USER=$(grep '^EC2_USER=' "$ENV_FILE" | cut -d= -f2)
EC2_KEY=$(grep '^EC2_KEY='  "$ENV_FILE" | cut -d= -f2)
EC2_PATH=$(grep '^EC2_PATH=' "$ENV_FILE" | cut -d= -f2)

if [[ -z "$EC2_HOST" || -z "$EC2_USER" || -z "$EC2_KEY" || -z "$EC2_PATH" ]]; then
  echo "Error: EC2_HOST, EC2_USER, EC2_KEY, EC2_PATH must all be set in web/.env" >&2
  exit 1
fi

SSH="ssh -i $EC2_KEY -o StrictHostKeyChecking=no -o LogLevel=ERROR"
RSYNC="rsync -az -e \"$SSH\""

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ Deploying to $EC2_USER@$EC2_HOST:$EC2_PATH"

# ── MCP dist ──────────────────────────────────────────────────────────────────
echo "  → mcp/dist/"
rsync -az -e "$SSH" "$ROOT/mcp/dist/" "$EC2_USER@$EC2_HOST:$EC2_PATH/mcp/dist/"

# ── API server source ─────────────────────────────────────────────────────────
echo "  → web/server/"
rsync -az -e "$SSH" "$ROOT/web/server/" "$EC2_USER@$EC2_HOST:$EC2_PATH/web/server/"

echo "  → web/package.json + package-lock.json"
rsync -az -e "$SSH" \
  "$ROOT/web/package.json" \
  "$ROOT/web/package-lock.json" \
  "$EC2_USER@$EC2_HOST:$EC2_PATH/web/"

echo "  → npm install (production)"
$SSH "$EC2_USER@$EC2_HOST" "cd $EC2_PATH/web && npm install --omit=dev --silent"

# ── Wine data cache ───────────────────────────────────────────────────────────
if [[ -f "$ROOT/web/cache/wines.json" ]]; then
  echo "  → web/cache/wines.json"
  $SSH "$EC2_USER@$EC2_HOST" "mkdir -p $EC2_PATH/web/cache"
  rsync -az -e "$SSH" "$ROOT/web/cache/wines.json" "$EC2_USER@$EC2_HOST:$EC2_PATH/web/cache/wines.json"
else
  echo "  ⚠ web/cache/wines.json not found — skipping cache upload"
fi

# ── Restart PM2 ───────────────────────────────────────────────────────────────
echo "  → pm2 restart wine-api"
$SSH "$EC2_USER@$EC2_HOST" "pm2 restart wine-api --update-env"

echo "✓ EC2 deploy complete"
