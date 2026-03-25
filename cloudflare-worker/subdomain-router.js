/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  Clara Subdomain Router — Cloudflare Worker              ║
 * ║  Koodh.com Network                                       ║
 * ╚═══════════════════════════════════════════════════════════╝
 * 
 * WHAT IT DOES:
 *   login.koodh.com  → proxies to → clara.koodh.com  (React shows /login)
 *   global.koodh.com → proxies to → clara.koodh.com  (React shows /network)
 *   test.koodh.com   → proxies to → clara.koodh.com  (React shows /)
 *   clara.koodh.com  → passes through (no modification)
 * 
 * SETUP:
 *   1. Workers & Pages → Create Worker → paste this code
 *   2. Triggers → Add route: *.koodh.com/*  (zone: koodh.com)
 *   3. Done!
 * 
 * ═══════════════════════════════════════════════════════════
 *  CONFIGURATION — Only change these if needed:
 * ═══════════════════════════════════════════════════════════
 */

const CONFIG = {
  // Your base domain
  BASE_DOMAIN: 'koodh.com',

  // The main Clara subdomain — requests here pass through untouched
  APP_SUBDOMAIN: 'clara',

  // Origin URL of your Clara app
  // Option 1: Use clara.koodh.com (works, adds 1 extra Cloudflare hop)
  // Option 2: Use your direct Emergent URL for better performance
  //           e.g. 'https://clara-radio.emergentagent.com'
  ORIGIN: 'https://clara.koodh.com',

  // Public API that returns the route table (no auth needed)
  ROUTES_API: 'https://clara.koodh.com/api/domains/routes/public',

  // How long to cache the route table (seconds)
  // Lower = faster route changes, Higher = fewer API calls
  CACHE_TTL: 300,
};

// ─── Route table cache ───────────────────────────────────
let routeCache = null;
let routeCacheTime = 0;

async function getRoutes() {
  const now = Date.now();
  if (routeCache && (now - routeCacheTime) < CONFIG.CACHE_TTL * 1000) {
    return routeCache;
  }

  try {
    const res = await fetch(CONFIG.ROUTES_API, {
      headers: { 'User-Agent': 'Clara-Worker/1.0' },
    });
    if (res.ok) {
      routeCache = await res.json();
      routeCacheTime = now;
      return routeCache;
    }
  } catch (e) {
    console.error('[Clara Worker] Route fetch failed:', e);
  }

  return routeCache || { routes: [], base_domain: CONFIG.BASE_DOMAIN };
}

// ─── Main handler ────────────────────────────────────────
async function handleRequest(request) {
  const url = new URL(request.url);
  const hostname = url.hostname;

  // Not a subdomain of our domain? Pass through.
  if (!hostname.endsWith(`.${CONFIG.BASE_DOMAIN}`)) {
    return fetch(request);
  }

  const subdomain = hostname.replace(`.${CONFIG.BASE_DOMAIN}`, '');

  // Main app subdomain → pass through, no modification
  if (subdomain === CONFIG.APP_SUBDOMAIN) {
    return fetch(request);
  }

  // Fetch route table
  const data = await getRoutes();
  const route = data.routes?.find(r => r.subdomain === subdomain);

  // ─── Unknown subdomain → 404 ──────────────────────────
  if (!route) {
    return new Response(
      `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Niet gevonden — ${hostname}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #09090b; color: #a1a1aa; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .box { text-align: center; max-width: 400px; padding: 2rem; }
    h1 { color: #f4f4f5; font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { font-size: 0.875rem; line-height: 1.5; }
    a { color: #f97316; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .sub { color: #f97316; font-family: monospace; }
    .back { margin-top: 1.5rem; display: inline-block; padding: 0.5rem 1.25rem; border: 1px solid #27272a; border-radius: 0.5rem; color: #d4d4d8; font-size: 0.875rem; }
    .back:hover { background: #18181b; text-decoration: none; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Subdomain niet geconfigureerd</h1>
    <p><span class="sub">${hostname}</span> is niet ingesteld als actieve route.</p>
    <p style="margin-top:0.75rem">Ga naar <strong>Clara Dashboard → Domain Manager → Subdomain Routing</strong> om deze route aan te maken.</p>
    <a href="https://${CONFIG.APP_SUBDOMAIN}.${CONFIG.BASE_DOMAIN}" class="back">Naar Clara Dashboard</a>
  </div>
</body>
</html>`,
      { status: 404, headers: { 'Content-Type': 'text/html;charset=UTF-8' } }
    );
  }

  // ─── Proxy to origin ──────────────────────────────────
  const originHostname = new URL(CONFIG.ORIGIN).hostname;
  const originUrl = new URL(request.url);
  originUrl.hostname = originHostname;
  originUrl.protocol = 'https:';

  // Build new headers
  const headers = new Headers(request.headers);
  headers.set('Host', originHostname);
  headers.set('X-Forwarded-Host', hostname);
  headers.set('X-Forwarded-Proto', 'https');
  headers.set('X-Original-Subdomain', subdomain);
  headers.set('X-Original-URL', request.url);

  // Forward request to origin
  const response = await fetch(originUrl.toString(), {
    method: request.method,
    headers: headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'manual',
  });

  // Rewrite redirect Location headers to stay on subdomain
  const respHeaders = new Headers(response.headers);
  const location = respHeaders.get('Location');
  if (location) {
    try {
      const locUrl = new URL(location, originUrl);
      if (locUrl.hostname === originHostname) {
        locUrl.hostname = hostname;
        respHeaders.set('Location', locUrl.toString());
      }
    } catch { /* keep original */ }
  }

  // Remove security headers that might block subdomain
  respHeaders.delete('X-Frame-Options');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: respHeaders,
  });
}

// ─── Cloudflare Worker entry point ──────────────────────
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
