# Deploying Wine Agent to EC2 with Nginx

This guide covers deploying the Wine Agent webapp to your EC2 instance at `yoursite.com/wwr-search`.

## Architecture

- **Frontend:** Static React files served by Nginx at `/wwr-search`
- **Backend:** Express API running on port 3001 (PM2 managed)
- **Nginx:** Proxies `/wwr-search/api/*` requests to Express server

## Prerequisites on EC2

### 1. Install Node.js (if not already installed)

```bash
# Using NodeSource repository for latest LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x
npm --version
```

### 2. Install PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

### 3. Build MCP Server

```bash
# On your local machine, build the MCP server first
cd /Users/rich/src/wine-agent/mcp
npm install
npm run build
```

## Deployment Steps

### Step 1: Upload Project to EC2

```bash
# On your local machine
cd /Users/rich/src/wine-agent
rsync -avz --exclude 'node_modules' --exclude '.git' \
  ./ your-user@your-ec2-ip:/var/www/wine-agent/
```

Or use git:
```bash
# On EC2
cd /var/www
sudo git clone https://github.com/rich-estrin/wine-agent.git
cd wine-agent
```

### Step 2: Set Up Backend on EC2

```bash
# On EC2
cd /var/www/wine-agent

# Install MCP server dependencies
cd mcp
npm install

# Build TypeScript
npm run build

# Set up web app dependencies
cd ../web
npm install

# Create .env file with your credentials
sudo nano .env
```

Add your environment variables:
```env
GOOGLE_SHEET_ID=your-sheet-id-here
GOOGLE_SHEET_NAME=TN Db
GOOGLE_SHEET_RANGE=A:Q
GOOGLE_APPLICATION_CREDENTIALS=/var/www/wine-agent/mcp/credentials/service-account.json
PORT=3001
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**Important:** Upload your Google service account credentials:
```bash
# On your local machine
scp /Users/rich/src/wine-agent/mcp/credentials/wine-agent-project-f7325e67212b.json \
  your-user@your-ec2-ip:/var/www/wine-agent/mcp/credentials/
```

### Step 3: Build Frontend

```bash
# On EC2
cd /var/www/wine-agent/web

# Build with base path for /wwr-search subdirectory
VITE_BASE_PATH=/wwr-search npm run build

# This creates /var/www/wine-agent/web/dist with your static files
```

### Step 4: Start API Server with PM2

```bash
cd /var/www/wine-agent/web
pm2 start server/index.ts --name wine-api --interpreter tsx

# Save PM2 process list
pm2 save

# Set PM2 to start on system boot
pm2 startup
# Follow the command it outputs
```

Verify it's running:
```bash
pm2 status
curl http://localhost:3001/api/meta  # Should return wine metadata
```

### Step 5: Configure Nginx

Create Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/wwr-search
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name yoursite.com;  # Replace with your domain

    # Existing WordPress configuration...
    # (keep your existing root and php config)

    # Wine app static files
    location /wwr-search {
        alias /var/www/wine-agent/web/dist;
        try_files $uri $uri/ /wwr-search/index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Proxy API requests to Express
    location /wwr-search/api {
        rewrite ^/wwr-search/api/(.*) /api/$1 break;
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the configuration:
```bash
# If using sites-enabled pattern
sudo ln -s /etc/nginx/sites-available/wwr-search /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Step 6: Test Deployment

Visit `http://yoursite.com/wwr-search` in your browser!

Test the API:
```bash
curl http://yoursite.com/wwr-search/api/meta
curl http://yoursite.com/wwr-search/api/search?q=Pinot
```

## Optional: Set Up SSL (Recommended)

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yoursite.com

# Certbot will automatically update your Nginx config for HTTPS
```

## Maintenance Commands

### Update the app:
```bash
cd /var/www/wine-agent
git pull
npm run build
cd web
npm install
VITE_BASE_PATH=/wwr-search npm run build
pm2 restart wine-api
```

### View API logs:
```bash
pm2 logs wine-api
```

### Monitor API:
```bash
pm2 monit
```

### Restart API:
```bash
pm2 restart wine-api
```

### Stop API:
```bash
pm2 stop wine-api
```

## Troubleshooting

### API not starting:
```bash
# Check logs
pm2 logs wine-api

# Check if port 3001 is in use
sudo netstat -tlnp | grep 3001

# Test API directly
curl http://localhost:3001/api/meta
```

### Nginx 502 Bad Gateway:
```bash
# Check if API is running
pm2 status

# Check Nginx error logs
sudo tail -f /var/nginx/error.log

# Verify proxy_pass URL
sudo nginx -t
```

### Static files not loading:
```bash
# Check file permissions
ls -la /var/www/wine-agent/web/dist

# Make sure Nginx can read files
sudo chmod -R 755 /var/www/wine-agent/web/dist
```

### Google Sheets API errors:
```bash
# Verify credentials file exists
ls -la /var/www/wine-agent/credentials/

# Check .env file
cat /var/www/wine-agent/web/.env

# Test credentials
cd /var/www/wine-agent/web
node -e "require('dotenv').config(); console.log(process.env.GOOGLE_APPLICATION_CREDENTIALS)"
```

## File Locations

- **Frontend static files:** `/var/www/wine-agent/web/dist`
- **API server:** `/var/www/wine-agent/web/server/index.ts`
- **Environment config:** `/var/www/wine-agent/web/.env`
- **Nginx config:** `/etc/nginx/sites-available/wwr-search`
- **PM2 logs:** `~/.pm2/logs/`

## Security Notes

1. **Protect your .env file:**
   ```bash
   sudo chmod 600 /var/www/wine-agent/web/.env
   ```

2. **Set up firewall:**
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

3. **Keep Node.js updated:**
   ```bash
   sudo npm install -g n
   sudo n lts
   ```

4. **Regular updates:**
   ```bash
   sudo apt-get update && sudo apt-get upgrade
   ```
