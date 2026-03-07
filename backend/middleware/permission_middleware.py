"""Permission enforcement middleware — maps API routes to required permissions."""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from database import db
from datetime import datetime, timezone
import jwt
import logging

logger = logging.getLogger("permissions.middleware")

# Map URL prefix patterns to (feature, action) tuples
# Method-based: GET=view, POST=create, PUT/PATCH=edit, DELETE=delete
ROUTE_PERMISSIONS = {
    "/api/shows": "shows",
    "/api/content": "content_library",
    "/api/media": "media_library",
    "/api/calendar": "calendar",
    "/api/team-chat": "team_chat",
    "/api/rds-settings": "rds_settings",
    "/api/rds-builder": "rds_builder",
    "/api/sites": "sites",
    "/api/users": "team_settings",
    "/api/wordpress": "wordpress",
    "/api/calls": "call_studio",
}

# Paths that skip permission checks (auth, health, public, etc.)
SKIP_PREFIXES = (
    "/api/auth",
    "/api/health",
    "/api/main-sites",
    "/api/firewall",
    "/api/roles",
    "/api/tickets",
    "/api/public",
    "/api/rds/",
    "/api/rds-builder/output",
    "/api/uploads",
    "/api/share",
    "/api/config",
    "/api/backups",
    "/api/devtools",
    "/api/calls/join",  # Public call join
    "/api/users/network-admins",  # Network admin management
    "/api/users/me",  # User preferences
)

METHOD_TO_ACTION = {
    "GET": "view",
    "HEAD": "view",
    "OPTIONS": "view",
    "POST": "create",
    "PUT": "edit",
    "PATCH": "edit",
    "DELETE": "delete",
}


class PermissionMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, jwt_secret: str, jwt_algorithm: str = "HS256"):
        super().__init__(app)
        self.jwt_secret = jwt_secret
        self.jwt_algorithm = jwt_algorithm

    async def _log_denial(self, user_id, email, role_slug, main_site_id, feature, action, path, method, ip):
        """Log a permission denial to the audit collection."""
        try:
            await db.permission_audit_logs.insert_one({
                "user_id": user_id,
                "user_email": email,
                "role": role_slug,
                "main_site_id": main_site_id,
                "feature": feature,
                "action": action,
                "path": path,
                "method": method,
                "ip_address": ip,
                "result": "denied",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.error(f"Failed to log permission denial: {e}")

    async def dispatch(self, request, call_next):
        path = request.url.path
        method = request.method

        # Skip non-API, WebSocket, and exempt paths
        if not path.startswith("/api"):
            return await call_next(request)

        if any(path.startswith(prefix) for prefix in SKIP_PREFIXES):
            return await call_next(request)

        # Find matching feature for this route
        feature = None

        # Check for show management sub-routes (titles, studios need show_management permission)
        if "/shows/titles" in path or "/shows/studios" in path:
            feature = "show_management"
        # Check for rundown-specific sub-routes (more specific match)
        elif "/rundown" in path:
            feature = "rundown"
        else:
            for prefix, feat in ROUTE_PERMISSIONS.items():
                if path.startswith(prefix):
                    feature = feat
                    break

        if not feature:
            return await call_next(request)

        # Get action from HTTP method
        action = METHOD_TO_ACTION.get(method, "view")

        # Extract user from token
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return await call_next(request)

        token = auth_header.split(" ", 1)[1]
        try:
            payload = jwt.decode(token, self.jwt_secret, algorithms=[self.jwt_algorithm])
        except Exception:
            return await call_next(request)

        user_id = payload.get("user_id")
        if not user_id:
            return await call_next(request)

        # Check if network admin (always allowed)
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "is_network_admin": 1, "email": 1})
        if user and user.get("is_network_admin"):
            return await call_next(request)

        user_email = user.get("email", "") if user else ""
        client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "")

        # Get main site context
        main_site_id = request.headers.get("X-Main-Site-ID")
        if not main_site_id:
            return await call_next(request)

        # Get user's role for this main site
        site_access = await db.main_site_users.find_one(
            {"user_id": user_id, "main_site_id": main_site_id},
            {"_id": 0, "role": 1},
        )
        if not site_access:
            return await call_next(request)

        role_slug = site_access.get("role", "viewer")

        # Admin role always has access
        if role_slug == "admin":
            return await call_next(request)

        # Look up role permissions
        role = await db.roles.find_one(
            {"main_site_id": main_site_id, "slug": role_slug},
            {"_id": 0, "permissions": 1},
        )

        if not role:
            if action != "view":
                await self._log_denial(user_id, user_email, role_slug, main_site_id, feature, action, path, method, client_ip)
                return JSONResponse(
                    status_code=403,
                    content={"detail": f"No permission to {action} {feature}"},
                )
            return await call_next(request)

        permissions = role.get("permissions", {})
        feature_perms = permissions.get(feature, {})

        if not feature_perms.get(action, False):
            await self._log_denial(user_id, user_email, role_slug, main_site_id, feature, action, path, method, client_ip)
            return JSONResponse(
                status_code=403,
                content={"detail": f"You don't have {action} permission for {feature}"},
            )

        return await call_next(request)
