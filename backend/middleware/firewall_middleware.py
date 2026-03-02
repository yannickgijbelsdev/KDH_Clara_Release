"""Firewall Middleware — intercepts every request for IP/geo/rate checks."""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from services.audit import get_client_ip
from services.firewall_service import evaluate_request, log_security_event
import jwt
import logging

logger = logging.getLogger("firewall.middleware")

# Paths that bypass firewall entirely (health checks, static)
BYPASS_PATHS = ("/health", "/api/health", "/favicon.ico")


class FirewallMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, jwt_secret: str, jwt_algorithm: str):
        super().__init__(app)
        self.jwt_secret = jwt_secret
        self.jwt_algorithm = jwt_algorithm

    async def dispatch(self, request, call_next):
        path = request.url.path

        # Skip health checks and non-API paths
        if path in BYPASS_PATHS or not path.startswith("/api"):
            return await call_next(request)

        ip = get_client_ip(request)
        main_site_id = request.headers.get("X-Main-Site-ID") or None
        is_network_admin = False

        # Try to identify user from token (without failing the request)
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                token = auth_header.split(" ", 1)[1]
                payload = jwt.decode(token, self.jwt_secret, algorithms=[self.jwt_algorithm])
                user_id = payload.get("user_id")
                if user_id:
                    from database import db
                    user = await db.users.find_one({"id": user_id}, {"_id": 0, "is_network_admin": 1})
                    if user and user.get("is_network_admin"):
                        is_network_admin = True
            except Exception:
                pass

        result = await evaluate_request(
            ip=ip,
            main_site_id=main_site_id,
            is_network_admin=is_network_admin,
            path=path,
            method=request.method,
        )

        if not result["allowed"]:
            return JSONResponse(
                status_code=result["status_code"],
                content={"detail": result["reason"]},
            )

        # Log API access for security monitoring (only auth and sensitive endpoints)
        if any(seg in path for seg in ("/auth/", "/admin/", "/firewall/", "/users/")):
            await log_security_event(
                "api_access", ip, main_site_id,
                {"path": path, "method": request.method},
            )

        return await call_next(request)
