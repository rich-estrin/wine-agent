# Wine Agent API Plugin — Installation Guide

## What this plugin does

- Embeds the wine search app on any page via the `[wine-search]` shortcode
- Proxies browser search/meta requests through WordPress HTTPS to the EC2 API server (avoids mixed-content issues)
- Dispatches a webhook to EC2 on every review publish, update, or trash action so the search index stays live

## 1. Install the plugin

1. Go to **WP Admin → Plugins → Add New → Upload Plugin**
2. Upload `wine-agent-api.zip`
3. Click **Replace current with uploaded** and then **Activate**

The zip includes the plugin PHP file and the built React JS/CSS assets.

## 2. Configure settings

Go to **WP Admin → Settings → Wine Agent API** and set:

| Field | Value |
|-------|-------|
| **Search API Key** | Shared secret — must match `WEBHOOK_SECRET` in the EC2 server's `.env` |
| **Search App URL** | Base URL of the EC2 server, e.g. `http://ec2-35-90-20-204.us-west-2.compute.amazonaws.com` |

Save settings. The proxy and webhook URL are derived automatically from the App URL.

## 3. Add the shortcode

Add `[wine-search]` to any page or post. The app renders inside a `#wine-agent-root` div. No other configuration needed.

## 4. Verify

- Open the page with the shortcode — the search app should load and display wines
- Publish or update a review post — the EC2 server log should show `[Webhook] Upserted wine <id>`
- Check **WP Admin → Settings → Wine Agent API → Endpoint** for the REST API URL to verify the plugin is active

## Updating the plugin

Whenever the frontend (React app) or plugin PHP changes:

1. Bump the version number in the `Plugin Name` header of `wine-agent-api.php`
2. Rebuild the app and repackage the zip (see `DEPLOYMENT.md`)
3. Upload the new zip via **WP Admin → Plugins → Add New → Upload Plugin → Replace current**
