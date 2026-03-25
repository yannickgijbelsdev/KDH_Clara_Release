/**
 * Clara Subdomain Router — Cloudflare Worker
 * 
 * This Worker sits between *.koodh.com and the Clara origin server.
 * It intercepts requests on configured subdomains and proxies them
 * to the main Clara application.
 * 
 * How it works:
 * 1. User visits login.koodh.com
 * 2. Worker detects subdomain "login"
 * 3. Worker proxies the request to ORIGIN (clara.koodh.com)
 * 4. The React app detects the subdomain and shows the correct page
 * 5. User sees login.koodh.com in their browser
 * 
 * ═══════════════════════════════════════════
 *  CONFIGURATION — Change these values:
 * ═══════════════════════════════════════════
 */

const CONFIG = {
  // Your base domain (without any subdomain)
  BASE_DOMAIN: 'koodh.com',
  
  // The main Clara app subdomain (requests here pass through without modification)
  APP_SUBDOMAIN: 'clara',
  
  // Full origin URL of your Clara app (the Emergent deployment URL or clara.koodh.com)
  ORIGIN: 'https://clara.koodh.com',
  
  // API endpoint to fetch route table (public, no auth needed)
  ROUTES_API: 'https://clara.koodh.com/api/domains/routes/public',
  
  // Cache TTL for the route table (in seconds)
  CACHE_TTL: 300, // 5 minutes
};

/**
 * Route table cache
 */
let routeCache = null;
let routeCacheTime = 0;

/**
 * Fetch and cache the route table from Clara API
 */
async function getRoutes() {
  const now = Date.now();
  if (routeCache && (now - routeCacheTime) < CONFIG.CACHE_TTL * 1000) {
    return routeCache;
  }
  
  try {
    const res = await fetch(CONFIG.ROUTES_API, {
      headers: { 'User-Agent': 'Clara-Subdomain-Worker/1.0' },
    });
    if (res.ok) {
      routeCache = await res.json();
      routeCacheTime = now;
      return routeCache;
    }
  } catch (e) {
    console.error('Failed to fetch routes:', e);
  }
  
  // Return cached data even if stale, or empty
  return routeCache || { routes: [], base_domain: CONFIG.BASE_DOMAIN };
}

/**
 * Main request handler
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  const hostname = url.hostname;
  
  // Skip if not on a subdomain of BASE_DOMAIN
  if (!hostname.endsWith(`.${CONFIG.BASE_DOMAIN}`)) {
    return fetch(request);
  }
  
  // Extract subdomain
  const subdomain = hostname.replace(`.${CONFIG.BASE_DOMAIN}`, '');
  
  // If it's the main app subdomain, pass through without modification
  if (subdomain === CONFIG.APP_SUBDOMAIN) {
    return fetch(request);
  }
  
  // Check if this subdomain is configured
  const data = await getRoutes();
  const route = data.routes?.find(r => r.subdomain === subdomain);
  
  if (!route) {
    // Unknown subdomain — return a friendly 404
    return new Response(
      `<html>
        <head><title>Not Found</title></head>
        <body style="font-family:system-ui;background:#09090b;color:#a1a1aa;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
          <div style="text-align:center">
            <h1 style="color:#f4f4f5;font-size:1.5rem">Subdomain not configured</h1>
            <p>${hostname} is not a recognized subdomain.</p>
            <p style="margin-top:1rem"><a href="https://${CONFIG.APP_SUBDOMAIN}.${CONFIG.BASE_DOMAIN}" style="color:#f97316">Go to Clara Dashboard</a></p>
          </div>
        </body>
      </html>`,
      {
        status: 404,
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      }
    );
  }
  
  // Proxy to origin — keep original path, just change hostname
  const originUrl = new URL(request.url);
  originUrl.hostname = new URL(CONFIG.ORIGIN).hostname;
  originUrl.protocol = 'https:';
  
  // Forward the request to the origin
  const originRequest = new Request(originUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'manual', // Don't follow redirects automatically
  });
  
  // Set the correct Host header for the origin
  const newHeaders = new Headers(originRequest.headers);
  newHeaders.set('Host', new URL(CONFIG.ORIGIN).hostname);
  newHeaders.set('X-Forwarded-Host', hostname);
  newHeaders.set('X-Original-Subdomain', subdomain);
  
  const response = await fetch(originUrl.toString(), {
    method: request.method,
    headers: newHeaders,
    body: request.body,
    redirect: 'manual',
  });
  
  // Clone response and modify headers to allow the subdomain origin
  const responseHeaders = new Headers(response.headers);
  
  // Handle redirects — rewrite location header to keep subdomain
  const location = responseHeaders.get('Location');
  if (location) {
    try {
      const locUrl = new URL(location, originUrl);
      if (locUrl.hostname === new URL(CONFIG.ORIGIN).hostname) {
        locUrl.hostname = hostname;
        responseHeaders.set('Location', locUrl.toString());
      }
    } catch {
      // Keep original location
    }
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

// Cloudflare Worker event listener
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
