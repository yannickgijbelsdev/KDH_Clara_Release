"""Anti-Cache Middleware — prevents proxies/CDNs/browsers from caching authenticated API responses.

This is CRITICAL for security:
- Without this, Cloudflare or any reverse proxy might cache /api/auth/me
  and serve User A's identity to User B.
- We add Cache-Control: no-store + Vary: Authorization to ALL /api responses
  that carry an Authorization header.
- Static assets (non-/api paths) are left untouched for performance.
"""
from starlette.middleware.base import BaseHTTPMiddleware


class NoCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        path = request.url.path

        # All /api responses must not be cached by CDN/proxy/browser
        if path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
            # Vary by Authorization so proxies never serve one user's response to another
            response.headers["Vary"] = "Authorization, X-Main-Site-ID"

        return response
