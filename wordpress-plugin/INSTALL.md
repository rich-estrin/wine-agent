# Wine Agent API Plugin — Installation Guide

## 1. Install the Plugin

**Option A — Upload via WordPress admin:**
1. Zip the `wordpress-plugin/` directory (or just `wine-agent-api.php`)
2. Go to **Plugins > Add New > Upload Plugin**
3. Upload the zip and click **Install Now**
4. Click **Activate**

**Option B — Copy file directly:**
```bash
cp wine-agent-api.php /path/to/wp-content/plugins/wine-agent-api/wine-agent-api.php
```
Then go to **Plugins** in the WordPress admin and activate **Wine Agent API**.

---

## 2. Generate an API Key

1. Go to **Settings > Wine Agent API**
2. Click **Regenerate API Key**
3. Copy the generated key — you'll need it in the next step

---

## 3. Configure the Agent

Add the following to your `.env` file (in both `mcp/` and `web/` if running the web server):

```env
WP_API_URL=https://your-wordpress-site.com
WP_API_KEY=your-generated-key-here
```

- `WP_API_URL` — your WordPress site root, no trailing slash
- `WP_API_KEY` — must match the key set in Settings > Wine Agent API

---

## 4. Build and Run

```bash
cd mcp
npm run build
```

Start the MCP server or web server as usual. On startup you should see:

```
Loaded 18000 wines from WordPress
```

---

## 5. Verify the Endpoint

```bash
curl -s \
  -H "X-Wine-Agent-Key: your-generated-key-here" \
  "https://your-wordpress-site.com/wp-json/wine-agent/v1/reviews?per_page=5" \
  | jq '.[0]'
```

Expected response shape:
```json
{
  "id": 123,
  "brand_name": "Chateau Ste. Michelle",
  "wine_name": "Cold Creek Riesling",
  "designation": "Cold Creek",
  "tasting_note": "...",
  "rating": "*** 1/2",
  "price": "$18",
  "vintage": "2022",
  "wine_type": "White",
  "variety": "Riesling",
  "region": "Columbia Valley",
  "appellation": "Columbia Valley",
  "publication_date": "2023-05-10 00:00:00"
}
```

---

## Pagination (optional)

The endpoint supports paginating large datasets:

```
GET /wp-json/wine-agent/v1/reviews?page=1&per_page=500
GET /wp-json/wine-agent/v1/reviews?page=2&per_page=500
```

Maximum `per_page` is 1000. The agent fetches all pages automatically on startup.

## Incremental Sync (optional)

To fetch only reviews modified after a given date:

```
GET /wp-json/wine-agent/v1/reviews?modified_after=2024-01-01T00:00:00
```
