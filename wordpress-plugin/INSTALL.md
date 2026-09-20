# Wine Agent API Plugin — Installation Guide

## What this plugin does

- Embeds the wine search app on any page via the `[wine-search]` shortcode
- Serves `/wp-json/wine-agent/v1/search` and `/meta` from an index table in this site's own database — no external server
- Keeps that index current as reviews are published, updated, trashed or deleted
- Exposes a key-protected `/reviews` endpoint

## 1. Install the plugin

1. Go to **WP Admin → Plugins → Add New → Upload Plugin**
2. Upload `wine-agent-api-<version>.zip`
3. Click **Replace current with uploaded** and then **Activate**

The zip includes the plugin PHP, the `includes/` search core and the built React JS/CSS assets.

## 2. Build the index

Go to **WP Admin → Settings → Wine Agent API** and press **Rebuild index**.
Press Continue until it reports done. Search returns 503 until this has run once.

## 3. Add the shortcode

Add `[wine-search]` to any page or post. The app renders inside a `#wine-agent-root` div. No other configuration needed.

## 4. Verify

- Open the page with the shortcode — the search app should load and display wines
- Publish or update a review — it should appear in search immediately
- **Settings → Wine Agent API** shows the indexed review count and the `/reviews` endpoint URL

## Settings

| Field | Purpose |
|-------|---------|
| **Review Export API Key** | Authenticates the private `/reviews` export endpoint (`X-Wine-Agent-Key` header). Not used by search — `/search` and `/meta` are public. |

## Updating the plugin

Whenever the frontend (React app) or plugin PHP changes:

1. Bump the version number in the `Plugin Name` header of `wine-agent-api.php`
2. Rebuild the app and repackage the zip (see `DEPLOYMENT.md`)
3. Upload the new zip via **WP Admin → Plugins → Add New → Upload Plugin → Replace current**
