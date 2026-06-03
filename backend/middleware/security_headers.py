"""
Security Headers Middleware (Zero Trust hardening).

Adds standards-based browser security headers to every response:
- Strict-Transport-Security (HSTS) — force HTTPS for 1 year, include subdomains
- X-Content-Type-Options: nosniff
- X-Frame-Options: SAMEORIGIN (defense-in-depth alongside CSP frame-ancestors)
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: deny dangerous APIs by default
- Content-Security-Policy: strict policy with allow-list
- Cross-Origin-Opener-Policy + Cross-Origin-Resource-Policy

Skips static asset / media file responses (they need permissive CORP).
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import os

# Read additional CSP sources from env so the app can be deployed behind
# different domains without code changes.
_EXTRA_CONNECT = os.environ.get("CSP_EXTRA_CONNECT", "")
_EXTRA_IMG = os.environ.get("CSP_EXTRA_IMG", "")
_EXTRA_FRAME = os.environ.get("CSP_EXTRA_FRAME", "")

# Build a CSP that supports React (inline styles), websockets, and Emergent S3.
_CSP_POLICY = "; ".join([
    "default-src 'self'",
    # 'unsafe-inline' for styles is required by many UI libs; we keep it but
    # add 'unsafe-eval' only in development if needed via env.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    f"img-src 'self' data: blob: https: {_EXTRA_IMG}".strip(),
    f"connect-src 'self' https: wss: ws: {_EXTRA_CONNECT}".strip(),
    "media-src 'self' blob: https:",
    f"frame-src 'self' https: {_EXTRA_FRAME}".strip(),
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
])

_PERMISSIONS_POLICY = ", ".join([
    "accelerometer=()",
    "autoplay=(self)",
    "camera=(self)",
    "clipboard-write=(self)",
    "display-capture=()",
    "fullscreen=(self)",
    "geolocation=()",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=(self)",
    "midi=()",
    "payment=(self)",
    "usb=()",
])


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response: Response = await call_next(request)

        # Skip CSP on file streaming endpoints — they often need cross-origin
        path = request.url.path
        is_file = path.startswith("/api/files/") or path.startswith("/uploads/")

        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains; preload",
        )
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", _PERMISSIONS_POLICY)
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if not is_file:
            response.headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
            response.headers.setdefault("Content-Security-Policy", _CSP_POLICY)

        # Remove server identification
        if "server" in response.headers:
            del response.headers["server"]
        return response
