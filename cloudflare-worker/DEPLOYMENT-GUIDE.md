# Clara Subdomain Router — Cloudflare Worker Deployment Guide

## What does this do?
This Cloudflare Worker makes subdomains like `login.koodh.com`, `global.koodh.com`, etc. work with your Clara app on Emergent servers. The Worker sits between the user and your server, proxying requests transparently.

```
User visits login.koodh.com
       ↓
Cloudflare Worker (intercepts, proxies to origin)
       ↓
Clara app on Emergent (receives normal request)
       ↓
React app detects subdomain → shows /login page
       ↓
User sees login.koodh.com in browser ✓
```

---

## Prerequisites
- Cloudflare account with your domain (`koodh.com`)
- Domain using Cloudflare DNS (nameservers pointed to Cloudflare)
- Clara app running and accessible at `clara.koodh.com`

---

## Step 1: Create DNS Records

In your Clara Dashboard → Domain Manager → **Subdomain Routing** tab:
1. Make sure all your routes are configured (login, global, etc.)
2. Go to the **Cloudflare** tab
3. Click **"Sync DNS"** — this creates CNAME records for all active routes

Or manually in Cloudflare Dashboard:
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → your domain → DNS
2. For each subdomain route, create a CNAME record:
   - **Type**: CNAME
   - **Name**: `login` (or whatever subdomain)
   - **Target**: `koodh.com`
   - **Proxy status**: Proxied (orange cloud ON)

---

## Step 2: Deploy the Cloudflare Worker

### Option A: Cloudflare Dashboard (easiest)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**
2. Click **"Create application"** → **"Create Worker"**
3. Give it a name: `clara-subdomain-router`
4. Click **"Deploy"** (creates a placeholder)
5. Click **"Edit code"**
6. Delete all placeholder code
7. Copy-paste the entire contents of `subdomain-router.js` (in this folder)
8. **IMPORTANT**: Update the `CONFIG` section at the top:
   ```javascript
   const CONFIG = {
     BASE_DOMAIN: 'koodh.com',          // ← your domain
     APP_SUBDOMAIN: 'clara',             // ← your main app subdomain
     ORIGIN: 'https://clara.koodh.com',  // ← your Clara app URL
     ROUTES_API: 'https://clara.koodh.com/api/domains/routes/public',
     CACHE_TTL: 300,
   };
   ```
9. Click **"Save and Deploy"**

### Option B: Wrangler CLI (advanced)

```bash
npm install -g wrangler
wrangler login
cd /path/to/cloudflare-worker
wrangler deploy subdomain-router.js --name clara-subdomain-router
```

---

## Step 3: Add Route Trigger

The Worker needs to know WHICH requests to intercept.

1. In Cloudflare Dashboard → **Workers & Pages** → `clara-subdomain-router`
2. Go to **Triggers** tab
3. Click **"Add route"**
4. Add: `*.koodh.com/*`
5. Select your zone: `koodh.com`
6. Click **"Add route"**

**Important**: This means ALL `*.koodh.com` requests go through the Worker. The Worker automatically passes through requests for `clara.koodh.com` without modification.

---

## Step 4: Test

1. Open `login.koodh.com` in your browser
2. You should see the Clara login page
3. The URL bar should still show `login.koodh.com`
4. Open `global.koodh.com` — should show the Network Management page

### Troubleshooting
- **"Subdomain not configured" page**: The subdomain isn't in the Clara route table. Add it in Domain Manager → Subdomain Routing.
- **SSL error**: Make sure the DNS record has the orange cloud (Proxy) enabled. Cloudflare handles SSL for proxied records.
- **Redirect loop**: Check that `CONFIG.APP_SUBDOMAIN` matches your main app subdomain exactly (e.g., `clara`).
- **Blank page**: Check browser DevTools → Console for errors. The Worker might not be reaching the origin.

---

## How the Route Table Works

The Worker fetches active routes from:
```
GET https://clara.koodh.com/api/domains/routes/public
```

Response:
```json
{
  "base_domain": "koodh.com",
  "routes": [
    { "subdomain": "login", "target_path": "/login", "route_type": "authentication", "label": "Login Portal" },
    { "subdomain": "global", "target_path": "/network", "route_type": "management", "label": "Global Management" },
    { "subdomain": "clara", "target_path": "/", "route_type": "app", "label": "Clara Dashboard" }
  ],
  "cache_ttl": 300
}
```

The Worker caches this for 5 minutes (configurable). When you add/remove routes in Clara, the Worker picks them up within 5 minutes.

---

## Costs

Cloudflare Workers **Free tier** includes:
- 100,000 requests/day
- 10ms CPU time per request

This is more than enough for most radio station networks. If you exceed this, the paid plan ($5/month) includes 10 million requests.

---

## Architecture Diagram

```
                    ┌─────────────────────────┐
                    │    Cloudflare DNS        │
                    │                         │
                    │  login.koodh.com CNAME  │
                    │  global.koodh.com CNAME │
                    │  clara.koodh.com CNAME  │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │   Cloudflare Worker      │
                    │   (subdomain-router.js)  │
                    │                         │
                    │  ┌─ login? → proxy ──┐  │
                    │  ├─ global? → proxy ─┤  │
                    │  └─ clara? → pass ───┘  │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │   Emergent Server        │
                    │   (clara.koodh.com)      │
                    │                         │
                    │   React App detects      │
                    │   subdomain → routes     │
                    │   to correct page        │
                    └─────────────────────────┘
```
