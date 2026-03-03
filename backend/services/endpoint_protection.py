"""Endpoint Protection Service — manages public/private API endpoint access per main site."""
import time
import uuid
import logging
from datetime import datetime, timezone
from collections import defaultdict
from database import db

logger = logging.getLogger("firewall.endpoints")

# Always public - never require auth
ALWAYS_PUBLIC_PREFIXES = (
    "/api/rds/",
    "/api/rds-builder/output/",
    "/api/public/",
    "/api/sites/public/",
    "/api/health",
    "/api/uploads/",
    "/api/share/",
    "/api/config",
    "/api/calls/join/",
)

# Always private - cannot be made public
ALWAYS_PRIVATE_PREFIXES = (
    "/api/auth/",
    "/api/firewall/",
    "/api/admin/",
    "/api/backups/",
    "/api/devtools/",
)

# Configurable endpoint groups with their path prefixes
ENDPOINT_GROUPS = {
    "shows": {"label": "Shows & Rundown", "prefixes": ["/api/shows/", "/api/shows"], "description": "Show management, rundowns, studios"},
    "content": {"label": "Content & Articles", "prefixes": ["/api/content/", "/api/content"], "description": "Articles, categories, approval"},
    "calendar": {"label": "Calendar & Occurrences", "prefixes": ["/api/occurrences/", "/api/occurrences"], "description": "Show occurrences, calendar data"},
    "series": {"label": "Series", "prefixes": ["/api/series/", "/api/series"], "description": "Show series, assignments"},
    "sites": {"label": "Sites (non-public)", "prefixes": ["/api/sites"], "description": "Mini site management (excludes public routes)"},
    "media": {"label": "Media Library", "prefixes": ["/api/media/", "/api/media"], "description": "Media files, folders, sharing"},
    "chat": {"label": "Chat", "prefixes": ["/api/chat/", "/api/chat"], "description": "Chat threads, messages"},
    "users": {"label": "Users", "prefixes": ["/api/users/", "/api/users"], "description": "User management, profiles"},
    "teams": {"label": "Teams", "prefixes": ["/api/teams/"], "description": "Team settings"},
    "main_sites": {"label": "Main Sites", "prefixes": ["/api/main-sites/"], "description": "Main site configuration"},
    "wordpress": {"label": "WordPress", "prefixes": ["/api/wordpress/"], "description": "WordPress integration"},
    "statistics": {"label": "Statistics", "prefixes": ["/api/statistics/"], "description": "Analytics and reports"},
    "tickets": {"label": "Support Tickets", "prefixes": ["/api/tickets/"], "description": "Support ticket system"},
    "logs": {"label": "Activity Logs", "prefixes": ["/api/logs/", "/api/logs"], "description": "Audit and activity logs"},
    "streams": {"label": "Streams", "prefixes": ["/api/streams/"], "description": "Stream management"},
    "audio_triggers": {"label": "Audio Triggers", "prefixes": ["/api/audio-triggers/"], "description": "Audio trigger management"},
    "email": {"label": "Email", "prefixes": ["/api/email/"], "description": "Email configuration"},
    "storage": {"label": "Storage", "prefixes": ["/api/storage/"], "description": "Storage status"},
}

# In-memory cache for endpoint settings
_endpoint_settings_cache = {}
_CACHE_TTL = 60

# In-memory tracker for public endpoint connections
_public_connections = defaultdict(list)  # (main_site_id, group) -> [{ip, timestamp, path, method}]


def _now_ts():
    return time.time()


def classify_path(path: str) -> dict:
    """Classify a request path. Returns {always_public, always_private, group}."""
    # Check always public
    for prefix in ALWAYS_PUBLIC_PREFIXES:
        if path.startswith(prefix) or path == prefix.rstrip('/'):
            return {"always_public": True, "always_private": False, "group": None}

    # Check always private
    for prefix in ALWAYS_PRIVATE_PREFIXES:
        if path.startswith(prefix):
            return {"always_public": False, "always_private": True, "group": None}

    # Sites/public routes are always public
    if "/sites/public/" in path:
        return {"always_public": True, "always_private": False, "group": None}

    # Find matching group
    for group_id, group_info in ENDPOINT_GROUPS.items():
        for prefix in group_info["prefixes"]:
            if path.startswith(prefix) or path == prefix.rstrip('/'):
                # Special case: /api/sites/public/* is always public
                if group_id == "sites" and "/public/" in path:
                    return {"always_public": True, "always_private": False, "group": None}
                return {"always_public": False, "always_private": False, "group": group_id}

    # Default: private (requires auth)
    return {"always_public": False, "always_private": False, "group": None}


async def get_endpoint_settings(main_site_id: str) -> dict:
    """Get endpoint access settings for a main site (cached)."""
    cached = _endpoint_settings_cache.get(main_site_id)
    if cached and (_now_ts() - cached.get("_cached_at", 0)) < _CACHE_TTL:
        return cached

    settings = await db.endpoint_settings.find_one(
        {"main_site_id": main_site_id}, {"_id": 0}
    )
    if not settings:
        # Default: all endpoint groups are private (empty public_groups list)
        settings = {
            "main_site_id": main_site_id,
            "public_groups": [],
        }

    settings["_cached_at"] = _now_ts()
    _endpoint_settings_cache[main_site_id] = settings
    return settings


def invalidate_endpoint_cache(main_site_id: str = None):
    if main_site_id:
        _endpoint_settings_cache.pop(main_site_id, None)
    else:
        _endpoint_settings_cache.clear()


async def is_endpoint_public(path: str, main_site_id: str = None) -> bool:
    """Check if an endpoint is publicly accessible (no auth required)."""
    classification = classify_path(path)

    if classification["always_public"]:
        return True
    if classification["always_private"]:
        return False
    if not classification["group"]:
        return False

    if not main_site_id:
        return False

    settings = await get_endpoint_settings(main_site_id)
    return classification["group"] in settings.get("public_groups", [])


def track_public_connection(main_site_id: str, group: str, ip: str, path: str, method: str):
    """Track a connection to a public endpoint."""
    key = (main_site_id or "global", group or "unknown")
    now = _now_ts()

    # Clean old entries (keep last hour)
    cutoff = now - 3600
    _public_connections[key] = [c for c in _public_connections[key] if c["timestamp"] > cutoff]

    _public_connections[key].append({
        "ip": ip,
        "timestamp": now,
        "path": path,
        "method": method,
    })


def get_public_connection_stats(main_site_id: str) -> list:
    """Get connection stats for all public endpoint groups of a main site."""
    now = _now_ts()
    stats = []

    for (site_id, group), connections in _public_connections.items():
        if site_id != main_site_id:
            continue

        # Filter last hour
        recent = [c for c in connections if c["timestamp"] > now - 3600]
        if not recent:
            continue

        # Group by IP
        ip_stats = defaultdict(lambda: {"count": 0, "first_seen": now, "last_seen": 0, "paths": set()})
        for c in recent:
            ip = c["ip"]
            ip_stats[ip]["count"] += 1
            ip_stats[ip]["first_seen"] = min(ip_stats[ip]["first_seen"], c["timestamp"])
            ip_stats[ip]["last_seen"] = max(ip_stats[ip]["last_seen"], c["timestamp"])
            ip_stats[ip]["paths"].add(c["path"])

        group_info = ENDPOINT_GROUPS.get(group, {})
        stat = {
            "group": group,
            "label": group_info.get("label", group),
            "total_requests": len(recent),
            "unique_ips": len(ip_stats),
            "connections": [
                {
                    "ip": ip,
                    "request_count": data["count"],
                    "first_seen": datetime.fromtimestamp(data["first_seen"], tz=timezone.utc).isoformat(),
                    "last_seen": datetime.fromtimestamp(data["last_seen"], tz=timezone.utc).isoformat(),
                    "duration_seconds": int(data["last_seen"] - data["first_seen"]),
                    "paths": list(data["paths"])[:5],
                }
                for ip, data in sorted(ip_stats.items(), key=lambda x: -x[1]["count"])
            ][:20],
        }
        stats.append(stat)

    return stats


def get_all_endpoint_groups() -> list:
    """Return all configurable endpoint groups with metadata."""
    groups = []
    for group_id, info in ENDPOINT_GROUPS.items():
        groups.append({
            "id": group_id,
            "label": info["label"],
            "description": info["description"],
            "prefixes": info["prefixes"],
        })
    return sorted(groups, key=lambda x: x["label"])
