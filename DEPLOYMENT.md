# Deployment Guide

## Architecture summary

- **WordPress** serves the React app (JS/CSS bundled in the plugin zip) and proxies API calls to EC2
- **EC2** runs the Express API server only — no static files served from EC2
- Builds happen locally; assets ship via plugin zip upload (WP) and rsync (EC2)

## Prerequisites

Connection info lives in `web/.env`:

```env
EC2_HOST=<your-ec2-host>.compute.amazonaws.com
EC2_USER=ec2-user
EC2_KEY=/path/to/your-keypair.pem
EC2_PATH=/home/ec2-user/wine-agent
WEBHOOK_SECRET=<shared secret — must match WP plugin setting>
```

The EC2 `.env` (never committed, lives only on the server) also needs:
```env
WP_API_URL=https://your-wordpress-site.com   # or CSV_PATH for CSV mode
WP_API_KEY=<wordpress api key>
WEBHOOK_SECRET=<same secret as above>
ANTHROPIC_API_KEY=<optional, for AI chat>
PORT=3001
```

## Deploy procedure

Use `/deploy` in Claude Code to run this automatically, or follow the steps manually.

### 1. Build MCP tools

```bash
cd mcp && npm run build
```

### 2. Build the React app

```bash
cd web && npm run build
```

No `VITE_BASE_PATH` needed — assets are served from WordPress, not from a subpath on EC2.

### 3. Repackage the WordPress plugin zip

```bash
cd wordpress-plugin
rm -f wine-agent-api.zip
mkdir -p wine-agent-api/assets
cp wine-agent-api.php wine-agent-api/
cp ../web/dist/.vite/manifest.json wine-agent-api/assets/
cp ../web/dist/assets/* wine-agent-api/assets/
zip -r wine-agent-api.zip wine-agent-api/ && rm -rf wine-agent-api
```

**Always bump the version** in the `wine-agent-api.php` plugin header before repackaging.

### 4. Upload the plugin to WordPress

1. Go to **WP Admin → Plugins → Add New → Upload Plugin**
2. Upload `wordpress-plugin/wine-agent-api.zip`
3. Click **Replace current with uploaded** and activate

### 5. Deploy server files to EC2

```bash
EC2_USER=ec2-user
EC2_HOST=<your-ec2-host>.compute.amazonaws.com
EC2_KEY=/path/to/your-keypair.pem
EC2_PATH=/home/ec2-user/wine-agent

# MCP tools
rsync -avz -e "ssh -i $EC2_KEY" mcp/dist/ $EC2_USER@$EC2_HOST:$EC2_PATH/mcp/dist/

# API server source
rsync -avz -e "ssh -i $EC2_KEY" web/server/ $EC2_USER@$EC2_HOST:$EC2_PATH/web/server/
rsync -avz -e "ssh -i $EC2_KEY" web/package.json web/package-lock.json \
  $EC2_USER@$EC2_HOST:$EC2_PATH/web/

# Install production dependencies
ssh -i $EC2_KEY $EC2_USER@$EC2_HOST "cd $EC2_PATH/web && npm install --omit=dev --silent"

# Wine data cache
ssh -i $EC2_KEY $EC2_USER@$EC2_HOST "mkdir -p $EC2_PATH/web/cache"
rsync -avz -e "ssh -i $EC2_KEY" web/cache/wines.json \
  $EC2_USER@$EC2_HOST:$EC2_PATH/web/cache/wines.json
```

### 6. Restart the API server

```bash
ssh -i $EC2_KEY $EC2_USER@$EC2_HOST "pm2 restart wine-api --update-env"
```

## EC2 initial setup (first time only)

```bash
# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Install PM2
sudo npm install -g pm2

# Create app directory and .env
mkdir -p ~/wine-agent/web/cache
nano ~/wine-agent/web/.env   # add env vars from Prerequisites above

# After first rsync deploy, start PM2
cd ~/wine-agent/web
pm2 start server/index.ts --name wine-api --interpreter tsx
pm2 save
pm2 startup   # follow the output command to persist across reboots
```

## WordPress plugin settings

Go to **WP Admin → Settings → Wine Agent API**:

| Setting | Value |
|---------|-------|
| Search API Key | Must match `WEBHOOK_SECRET` in EC2 `.env` |
| Search App URL | `http://<your-ec2-host>.compute.amazonaws.com` |

The webhook URL and search proxy are derived automatically from the App URL.

## Maintenance

```bash
# View live API logs
ssh -i $EC2_KEY $EC2_USER@$EC2_HOST "pm2 logs wine-api --lines 50"

# Restart API
ssh -i $EC2_KEY $EC2_USER@$EC2_HOST "pm2 restart wine-api"

# Monitor
ssh -i $EC2_KEY $EC2_USER@$EC2_HOST "pm2 monit"
```
