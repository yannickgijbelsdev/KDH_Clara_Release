"""RDS Integration routes for MagicRDS and external systems."""
import asyncio
from fastapi import APIRouter, Depends, Request
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid

from database import db
from services.auth import require_admin
from services.main_site_context import get_main_site_id_from_header

rds_router = APIRouter(prefix="/rds", tags=["RDS Integration"])


class RDSSettings(BaseModel):
    """RDS integration settings."""
    production_base_url: str = "https://clara.koodh.com"
    cache_refresh_interval: int = 1  # minutes
    # When False (default), the public schedule and `/{station}/image.jpg`
    # endpoints return the presenter composite PNG (Team-Settings avatars,
    # transparent slots for missing avatars). When True, they return the
    # legacy show-title image uploaded in Show Management instead.
    prefer_show_image: bool = False


class RDSSettingsResponse(BaseModel):
    """Response model for RDS settings."""
    id: str
    team_id: Optional[str] = None
    production_base_url: str
    cache_refresh_interval: int
    prefer_show_image: bool = False
    last_cache_refresh: Optional[str] = None
    created_at: str
    updated_at: str


class RDSCacheLog(BaseModel):
    """Log entry for RDS cache refresh."""
    id: str
    team_id: Optional[str] = None
    timestamp: str
    status: str  # 'success', 'failed', 'no_show'
    show_id: Optional[str] = None
    show_title: Optional[str] = None
    message: str
    cached_data: Optional[dict] = None


class CachedRundown(BaseModel):
    """Cached rundown data for RDS."""
    show_id: str
    show_title: str
    show_date: str
    show_start_time: str
    show_end_time: str
    items: List[dict]
    cached_at: str


async def get_rds_query_filter(request: Request, current_user: dict) -> dict:
    """Helper to build query filter for RDS data - searches both team_id and main_site_id."""
    main_site_id = await get_main_site_id_from_header(request)
    team_id = current_user.get('team_id')
    
    # Build $or query to match on either field
    or_conditions = []
    if main_site_id:
        or_conditions.append({"main_site_id": main_site_id})
        or_conditions.append({"team_id": main_site_id})
    if team_id:
        or_conditions.append({"team_id": team_id})
    
    if not or_conditions:
        return {}
    if len(or_conditions) == 1:
        return or_conditions[0]
    return {"$or": or_conditions}


@rds_router.get("/settings", response_model=RDSSettingsResponse)
async def get_rds_settings(request: Request, current_user: dict = Depends(require_admin)):
    """Get RDS integration settings for the team/main site."""
    main_site_id = await get_main_site_id_from_header(request)
    team_id = current_user.get('team_id')
    
    # Try to find by main_site_id first (multisite), then fallback to team_id
    settings = None
    if main_site_id:
        settings = await db.rds_settings.find_one(
            {"main_site_id": main_site_id},
            {"_id": 0}
        )
    
    if not settings and team_id:
        settings = await db.rds_settings.find_one(
            {"team_id": team_id},
            {"_id": 0}
        )
    
    if not settings:
        # Create default settings
        now = datetime.now(timezone.utc).isoformat()
        settings = {
            "id": str(uuid.uuid4()),
            "team_id": team_id,
            "main_site_id": main_site_id,
            "production_base_url": "https://clara.koodh.com",
            "cache_refresh_interval": 1,
            "prefer_show_image": False,
            "last_cache_refresh": None,
            "created_at": now,
            "updated_at": now
        }
        await db.rds_settings.insert_one(settings)
        settings.pop("_id", None)
    # Back-fill the new flag for pre-existing docs that never had it.
    settings.setdefault("prefer_show_image", False)

    return settings


@rds_router.put("/settings", response_model=RDSSettingsResponse)
async def update_rds_settings(
    request: Request,
    settings_data: RDSSettings,
    current_user: dict = Depends(require_admin)
):
    """Update RDS integration settings."""
    query_filter = await get_rds_query_filter(request, current_user)
    main_site_id = await get_main_site_id_from_header(request)
    team_id = current_user.get('team_id')
    now = datetime.now(timezone.utc).isoformat()
    
    existing = await db.rds_settings.find_one(query_filter) if query_filter else None
    
    update_data = {
        "production_base_url": settings_data.production_base_url.rstrip('/'),
        "cache_refresh_interval": settings_data.cache_refresh_interval,
        "prefer_show_image": bool(settings_data.prefer_show_image),
        "updated_at": now
    }
    
    if existing:
        await db.rds_settings.update_one(
            query_filter,
            {"$set": update_data}
        )
    else:
        update_data["id"] = str(uuid.uuid4())
        update_data["team_id"] = team_id
        update_data["main_site_id"] = main_site_id
        update_data["created_at"] = now
        update_data["last_cache_refresh"] = None
        await db.rds_settings.insert_one(update_data)
    
    settings = await db.rds_settings.find_one(
        query_filter,
        {"_id": 0}
    )
    if settings is not None:
        settings.setdefault("prefer_show_image", False)
    return settings


@rds_router.get("/endpoints")
async def get_rds_endpoints(request: Request, current_user: dict = Depends(require_admin)):
    """Get all available RDS API endpoints with the request's host as base URL.

    Base URL is derived from the incoming request so preview shows preview
    URLs and production shows production URLs — no hardcoded `clara.koodh.com`.
    """
    query_filter = await get_rds_query_filter(request, current_user)
    main_site_id = await get_main_site_id_from_header(request)
    
    # Settings still loaded for backwards compatibility (other fields), but
    # `production_base_url` is no longer used to build endpoint URLs.
    await db.rds_settings.find_one(query_filter, {"_id": 0}) if query_filter else None
    
    # Derive base URL from the incoming request host. Cloudflare/Kubernetes
    # ingress forwards the original hostname via X-Forwarded-Host (and the
    # scheme via X-Forwarded-Proto). Fall back to raw Host header when no
    # proxy header is present.
    fwd_host = request.headers.get("x-forwarded-host", "").split(",")[0].strip()
    fwd_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    host = fwd_host or request.url.hostname or ""
    scheme = fwd_proto or request.url.scheme or "https"
    base_url = f"{scheme}://{host}" if host else ""
    
    # Fetch dynamic stations for this site
    stations = []
    if main_site_id:
        stations = await db.rds_stations.find(
            {"main_site_id": main_site_id}, {"_id": 0}
        ).to_list(50)
    if not stations:
        # Fallback: try team_id
        team_id = current_user.get("team_id")
        if team_id:
            stations = await db.rds_stations.find(
                {"main_site_id": team_id}, {"_id": 0}
            ).to_list(50)

    endpoints_list = []
    for st in stations:
        code = st.get("code", "").lower()
        name = st.get("name", code.upper())
        if not code:
            continue
        endpoints_list.extend([
            {
                "name": f"{name} - Live Show",
                "description": f"Title of the current {name} live show (plain text)",
                "path": f"/api/rds/{code}/live",
                "full_url": f"{base_url}/api/rds/{code}/live",
                "method": "GET",
                "auth_required": False,
                "response_type": "text/plain",
                "station": code,
                "station_name": name,
                "station_color": st.get("color", "#f97316"),
            },
            {
                "name": f"{name} - Presenter(s)",
                "description": f"Name(s) of the current {name} live show presenter(s), joined with ' & ' (plain text)",
                "path": f"/api/rds/{code}/presenter",
                "full_url": f"{base_url}/api/rds/{code}/presenter",
                "method": "GET",
                "auth_required": False,
                "response_type": "text/plain",
                "station": code,
                "station_name": name,
                "station_color": st.get("color", "#f97316"),
            },
            {
                "name": f"{name} - Now Playing",
                "description": f"Current track from {name} Shoutcast (plain text)",
                "path": f"/api/rds/{code}/now-playing.txt",
                "full_url": f"{base_url}/api/rds/{code}/now-playing.txt",
                "method": "GET",
                "auth_required": False,
                "response_type": "text/plain",
                "station": code,
                "station_name": name,
                "station_color": st.get("color", "#f97316"),
            },
            {
                "name": f"{name} - Now Playing (JSON)",
                "description": "Shoutcast info including listeners (JSON)",
                "path": f"/api/rds/{code}/now-playing",
                "full_url": f"{base_url}/api/rds/{code}/now-playing",
                "method": "GET",
                "auth_required": False,
                "response_type": "application/json",
                "station": code,
                "station_name": name,
                "station_color": st.get("color", "#f97316"),
            },
            {
                "name": f"{name} - Cached Rundown",
                "description": f"Cached JSON rundown from {name} live show",
                "path": f"/api/rds/{code}/cached-rundown",
                "full_url": f"{base_url}/api/rds/{code}/cached-rundown",
                "method": "GET",
                "auth_required": False,
                "response_type": "application/json",
                "station": code,
                "station_name": name,
                "station_color": st.get("color", "#f97316"),
            },
        ])

    # General endpoints (backwards compatibility)
    endpoints_list.extend([
        {
            "name": "All Stations - Live Show",
            "description": "Title of any current live show (plain text)",
            "path": "/api/rds/live",
            "full_url": f"{base_url}/api/rds/live",
            "method": "GET",
            "auth_required": False,
            "response_type": "text/plain",
            "station": "all",
            "station_name": "All Stations",
            "station_color": "#71717a",
        },
        {
            "name": "All Stations - Presenter(s)",
            "description": "Presenter name(s) for any currently-live show, joined with ' & ' (plain text)",
            "path": "/api/rds/presenter",
            "full_url": f"{base_url}/api/rds/presenter",
            "method": "GET",
            "auth_required": False,
            "response_type": "text/plain",
            "station": "all",
            "station_name": "All Stations",
            "station_color": "#71717a",
        },
        {
            "name": "All Stations - Cached Rundown",
            "description": "Cached JSON rundown from any live show",
            "path": "/api/rds/cached-rundown",
            "full_url": f"{base_url}/api/rds/cached-rundown",
            "method": "GET",
            "auth_required": False,
            "response_type": "application/json",
            "station": "all",
            "station_name": "All Stations",
            "station_color": "#71717a",
        }
    ])

    return {
        "base_url": base_url,
        "endpoints": endpoints_list
    }


@rds_router.get("/logs", response_model=List[RDSCacheLog])
async def get_rds_logs(
    request: Request,
    limit: int = 50,
    current_user: dict = Depends(require_admin)
):
    """Get recent RDS cache refresh logs."""
    main_site_id = await get_main_site_id_from_header(request)
    team_id = current_user.get('team_id')
    
    # Build an $or query since logs may have team_id or main_site_id
    or_conditions = []
    if main_site_id:
        or_conditions.append({"main_site_id": main_site_id})
        or_conditions.append({"team_id": main_site_id})
    if team_id:
        or_conditions.append({"team_id": team_id})
    
    if not or_conditions:
        # Network admin - show all logs
        query_filter = {}
    else:
        query_filter = {"$or": or_conditions} if len(or_conditions) > 1 else or_conditions[0]
    
    logs = await db.rds_cache_logs.find(
        query_filter,
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return logs


@rds_router.post("/refresh-cache")
async def manual_refresh_cache(request: Request, current_user: dict = Depends(require_admin)):
    """Manually trigger a cache refresh for the current live show."""
    from services.rds_scheduler import refresh_live_show_cache
    
    main_site_id = await get_main_site_id_from_header(request)
    team_id = current_user.get('team_id')
    
    # Pass main_site_id if available, otherwise team_id
    result = await refresh_live_show_cache(main_site_id or team_id)
    
    return result


@rds_router.post("/hard-refresh")
async def manual_hard_refresh(current_user: dict = Depends(require_admin)):
    """Admin-only kill switch — wipes EVERY active cached rundown and lets
    the normal scheduler rebuild only the truly-live ones.

    Same logic as the automatic hourly job; expose it manually so admins
    can unstick the RDS API immediately when MagicRDS reports a hang
    without waiting for the next :00 tick.
    """
    from services.rds_scheduler import run_hourly_hard_refresh
    await run_hourly_hard_refresh()
    return {"status": "ok", "message": "Hard refresh complete — cache rebuilt from scratch"}


@rds_router.get("/debug-live-shows")
async def debug_live_shows(request: Request, current_user: dict = Depends(require_admin)):
    """Debug endpoint to see why a show might not be syncing.
    
    Shows the current time (UTC and Brussels), and any shows that match the current timeframe.
    """
    from zoneinfo import ZoneInfo
    
    now_utc = datetime.now(timezone.utc)
    now_brussels = datetime.now(ZoneInfo('Europe/Brussels'))
    
    query_filter = await get_rds_query_filter(request, current_user)
    
    # Also resolve child site team_ids for main_site context
    main_site_id = await get_main_site_id_from_header(request)
    show_query = {}
    if main_site_id:
        team_ids_set = {main_site_id}
        child_sites = await db.sites.find(
            {"main_site_id": main_site_id},
            {"_id": 0, "team_id": 1}
        ).to_list(50)
        for site in child_sites:
            if site.get("team_id"):
                team_ids_set.add(site["team_id"])
        team_id = current_user.get('team_id')
        if team_id:
            team_ids_set.add(team_id)
        team_ids_list = list(team_ids_set)
        show_query = {"$or": [{"team_id": {"$in": team_ids_list}}, {"main_site_id": {"$in": team_ids_list}}]}
    elif current_user.get('team_id'):
        show_query = {"team_id": current_user.get('team_id')}
    
    # Find all shows for today (Brussels)
    today_brussels = now_brussels.strftime('%Y-%m-%d')
    today_utc = now_utc.strftime('%Y-%m-%d')
    
    shows_today_cet = await db.shows.find(
        {"date": today_brussels, **show_query},
        {"_id": 0, "id": 1, "title": 1, "date": 1, "start_time": 1, "end_time": 1, "status": 1, "rds_station": 1}
    ).to_list(50)
    
    shows_today_utc = await db.shows.find(
        {"date": today_utc, **show_query},
        {"_id": 0, "id": 1, "title": 1, "date": 1, "start_time": 1, "end_time": 1, "status": 1, "rds_station": 1}
    ).to_list(50) if today_utc != today_brussels else []
    
    # Check which shows would be considered "live" right now
    current_time_brussels = now_brussels.strftime('%H:%M')
    
    live_shows_cet = [
        s for s in shows_today_cet 
        if s.get('start_time', '99:99') <= current_time_brussels <= s.get('end_time', '00:00')
        and s.get('status') == 'scheduled'
    ]
    
    # Check cached rundown - use query_filter for multisite context
    cached = await db.rds_cached_rundowns.find_one(
        query_filter if query_filter else {"is_active": True},
        {"_id": 0}
    )
    
    return {
        "debug_info": {
            "current_time_utc": now_utc.isoformat(),
            "current_time_brussels": now_brussels.isoformat(),
            "current_time_brussels_formatted": current_time_brussels,
            "today_date_brussels": today_brussels,
        },
        "shows_today": shows_today_cet + shows_today_utc,
        "shows_that_should_be_live": live_shows_cet,
        "issue_diagnosis": {
            "no_shows_today": len(shows_today_cet) == 0,
            "shows_not_scheduled": [s['title'] for s in shows_today_cet if s.get('status') != 'scheduled'],
            "shows_without_rds_station": [s['title'] for s in shows_today_cet if s.get('rds_station') in [None, 'none']],
        },
        "current_cached_rundown": {
            "show_title": cached.get('show_title') if cached else None,
            "is_active": cached.get('is_active') if cached else None,
            "cached_at": cached.get('cached_at') if cached else None,
        }
    }


@rds_router.get("/cached-rundown")
async def get_cached_rundown():
    """Public endpoint: Get the cached rundown for the current live show.
    
    This endpoint does not require authentication and returns the most
    recently cached rundown data. Updated every 5 minutes by the scheduler.
    """
    # Get the most recent cached rundown
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True},
        {"_id": 0}
    )
    
    if not cached:
        return {
            "status": "no_live_show",
            "message": "No live show is currently running",
            "cached_at": None,
            "show": None,
            "items": []
        }
    
    return {
        "status": "success",
        "cached_at": cached.get("cached_at"),
        "show": {
            "id": cached.get("show_id"),
            "title": cached.get("show_title"),
            "date": cached.get("show_date"),
            "start_time": cached.get("show_start_time"),
            "end_time": cached.get("show_end_time")
        },
        "items": cached.get("items", [])
    }


@rds_router.get("/live")
async def get_live_show_title():
    """Public endpoint: Get the title of the current live show as plain text.
    
    Returns just the show title for use in RDS systems like MagicRDS.
    Returns default station name if no live show is currently running.
    """
    from fastapi.responses import PlainTextResponse
    
    # Get the most recent cached rundown
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True},
        {"_id": 0, "show_title": 1}
    )
    
    if cached and cached.get("show_title"):
        return PlainTextResponse(content=cached.get("show_title"), media_type="text/plain")
    
    # No active show - return empty (this endpoint is for "any" station)
    return PlainTextResponse(content="", media_type="text/plain")


@rds_router.get("/live.txt")
async def get_live_show_title_txt():
    """Public endpoint: Same as /live but with .txt extension for compatibility."""
    from fastapi.responses import PlainTextResponse
    
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True},
        {"_id": 0, "show_title": 1}
    )
    
    if cached and cached.get("show_title"):
        return PlainTextResponse(content=cached.get("show_title"), media_type="text/plain")
    
    return PlainTextResponse(content="", media_type="text/plain")


# ============== STATION-SPECIFIC ENDPOINTS ==============

# Legacy fallback used ONLY when a station doesn't have `default_text` set
# in its rds_stations doc. Real editable configuration lives in the DB and
# is managed via RDS Settings → "Default show text".
DEFAULT_STATION_NAMES = {
    "grk": "the feelgood station",
    "mfy": "altijd dichtbij"
}


async def get_live_show_title_for_station(station: str) -> str:
    """Get the current live show title for a specific station.
    
    First tries to find a show specifically assigned to this station or "both".
    If no station-specific show, returns default station name — sourced from
    the editable ``rds_stations.default_text`` DB field when set, with the
    legacy hardcoded ``DEFAULT_STATION_NAMES`` mapping as a final fallback.
    """
    # Try to find a show specifically assigned to this station or "both"
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": [station, "both"]}},
        {"_id": 0, "show_title": 1}
    )
    if cached and cached.get("show_title"):
        return cached["show_title"]

    # DB-configured fallback (editable in RDS Settings)
    st = await db.rds_stations.find_one(
        {"code": station}, {"_id": 0, "default_text": 1}
    )
    if st and (st.get("default_text") or "").strip():
        return st["default_text"].strip()

    # Legacy hardcoded fallback for stations that predate the editable field
    return DEFAULT_STATION_NAMES.get(station, "")


async def get_live_show_presenters_for_station(station: str) -> str:
    """Get the current live show presenter name(s) for a specific station.

    Returns an `" & "`-joined string of presenter names for the show that is
    currently live on this station (or `"both"`). Returns empty string when
    no show is live or the show has no presenters assigned.
    """
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": [station, "both"]}},
        {"_id": 0, "show_id": 1, "presenter_names": 1},
    )
    if not cached:
        return ""
    # Prefer cached presenter_names if already resolved by the builder
    names_cached = cached.get("presenter_names") or []
    if isinstance(names_cached, list) and any(n for n in names_cached):
        return " & ".join([n for n in names_cached if n])
    # Fallback: resolve from show.presenter_ids → users.name
    if cached.get("show_id"):
        show = await db.shows.find_one(
            {"id": cached["show_id"]},
            {"_id": 0, "presenter_ids": 1},
        )
        if show and show.get("presenter_ids"):
            presenters = await db.users.find(
                {"id": {"$in": show["presenter_ids"]}},
                {"_id": 0, "name": 1},
            ).to_list(10)
            names = [p.get("name", "") for p in presenters if p.get("name")]
            if names:
                return " & ".join(names)
    return ""


@rds_router.get("/mfy/live")
async def get_mfy_live_show_title():
    """Public endpoint: Get the title of the current MFY live show as plain text."""
    from fastapi.responses import PlainTextResponse
    
    title = await get_live_show_title_for_station("mfy")
    return PlainTextResponse(content=title, media_type="text/plain")


@rds_router.get("/mfy/live.txt")
async def get_mfy_live_show_title_txt():
    """Public endpoint: Same as /mfy/live but with .txt extension."""
    from fastapi.responses import PlainTextResponse
    
    title = await get_live_show_title_for_station("mfy")
    return PlainTextResponse(content=title, media_type="text/plain")


@rds_router.get("/grk/live")
async def get_grk_live_show_title():
    """Public endpoint: Get the title of the current GRK live show as plain text."""
    from fastapi.responses import PlainTextResponse
    
    title = await get_live_show_title_for_station("grk")
    return PlainTextResponse(content=title, media_type="text/plain")


@rds_router.get("/grk/live.txt")
async def get_grk_live_show_title_txt():
    """Public endpoint: Same as /grk/live but with .txt extension."""
    from fastapi.responses import PlainTextResponse
    
    title = await get_live_show_title_for_station("grk")
    return PlainTextResponse(content=title, media_type="text/plain")


# ─── Presenter name endpoints (per station + global fallback) ───────────────
@rds_router.get("/mfy/presenter")
async def get_mfy_presenter():
    """Public endpoint: Current MFY live show presenter(s), `" & "`-joined plain text."""
    from fastapi.responses import PlainTextResponse
    names = await get_live_show_presenters_for_station("mfy")
    return PlainTextResponse(content=names, media_type="text/plain")


@rds_router.get("/mfy/presenter.txt")
async def get_mfy_presenter_txt():
    """Public endpoint: Same as /mfy/presenter with .txt extension."""
    from fastapi.responses import PlainTextResponse
    names = await get_live_show_presenters_for_station("mfy")
    return PlainTextResponse(content=names, media_type="text/plain")


@rds_router.get("/grk/presenter")
async def get_grk_presenter():
    """Public endpoint: Current GRK live show presenter(s), `" & "`-joined plain text."""
    from fastapi.responses import PlainTextResponse
    names = await get_live_show_presenters_for_station("grk")
    return PlainTextResponse(content=names, media_type="text/plain")


@rds_router.get("/grk/presenter.txt")
async def get_grk_presenter_txt():
    """Public endpoint: Same as /grk/presenter with .txt extension."""
    from fastapi.responses import PlainTextResponse
    names = await get_live_show_presenters_for_station("grk")
    return PlainTextResponse(content=names, media_type="text/plain")


@rds_router.get("/presenter")
async def get_any_presenter():
    """Public endpoint: Presenter(s) for any currently-live show on either station."""
    from fastapi.responses import PlainTextResponse
    # Try MFY first, then GRK, then "both"-shows fall through naturally
    for st in ("mfy", "grk"):
        names = await get_live_show_presenters_for_station(st)
        if names:
            return PlainTextResponse(content=names, media_type="text/plain")
    return PlainTextResponse(content="", media_type="text/plain")


@rds_router.get("/presenter.txt")
async def get_any_presenter_txt():
    """Public endpoint: Same as /presenter with .txt extension."""
    from fastapi.responses import PlainTextResponse
    for st in ("mfy", "grk"):
        names = await get_live_show_presenters_for_station(st)
        if names:
            return PlainTextResponse(content=names, media_type="text/plain")
    return PlainTextResponse(content="", media_type="text/plain")


# ─── JSON variants of the plain-text live/presenter endpoints ───────────────
# Allow programmatic consumers (apps, JS clients) to receive structured data
# instead of a raw string. Uses the same underlying helpers.

def _split_presenter_names(joined: str) -> list:
    return [n.strip() for n in joined.split("&") if n.strip()] if joined else []


@rds_router.get("/mfy/live.json")
async def get_mfy_live_show_title_json():
    """Public endpoint: JSON-wrapped current MFY live show title."""
    title = await get_live_show_title_for_station("mfy")
    return {"station": "mfy", "field": "live_show_title", "value": title}


@rds_router.get("/grk/live.json")
async def get_grk_live_show_title_json():
    """Public endpoint: JSON-wrapped current GRK live show title."""
    title = await get_live_show_title_for_station("grk")
    return {"station": "grk", "field": "live_show_title", "value": title}


@rds_router.get("/live.json")
async def get_any_live_show_title_json():
    """Public endpoint: JSON-wrapped current live show title (any station)."""
    for st in ("mfy", "grk"):
        title = await get_live_show_title_for_station(st)
        if title:
            return {"station": st, "field": "live_show_title", "value": title}
    return {"station": None, "field": "live_show_title", "value": ""}


@rds_router.get("/mfy/presenter.json")
async def get_mfy_presenter_json():
    """Public endpoint: JSON-wrapped MFY presenter info (string + list)."""
    names = await get_live_show_presenters_for_station("mfy")
    return {"station": "mfy", "field": "presenter", "value": names, "list": _split_presenter_names(names)}


@rds_router.get("/grk/presenter.json")
async def get_grk_presenter_json():
    """Public endpoint: JSON-wrapped GRK presenter info (string + list)."""
    names = await get_live_show_presenters_for_station("grk")
    return {"station": "grk", "field": "presenter", "value": names, "list": _split_presenter_names(names)}


@rds_router.get("/presenter.json")
async def get_any_presenter_json():
    """Public endpoint: JSON-wrapped presenter for any currently-live show."""
    for st in ("mfy", "grk"):
        names = await get_live_show_presenters_for_station(st)
        if names:
            return {"station": st, "field": "presenter", "value": names, "list": _split_presenter_names(names)}
    return {"station": None, "field": "presenter", "value": "", "list": []}


@rds_router.get("/mfy/now-playing")
async def get_mfy_now_playing():
    """Public endpoint: Get the current now playing info from MFY Shoutcast (cached, 10s interval)."""
    from services.shoutcast import get_cached_now_playing
    return await get_cached_now_playing(db, "mfy")


# ─── Empty-pixel constant (shared by all "image.jpg/png" endpoints) ─────────

_TRANSPARENT_1X1_PNG = bytes([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
])


def _empty_image_response():
    """Return a 1×1 transparent PNG so browsers overwrite stale cached
    `<img>` content with nothing visible."""
    from fastapi.responses import Response
    return Response(
        content=_TRANSPARENT_1X1_PNG,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=30, must-revalidate",
            "X-Image-Source": "empty-placeholder",
        },
    )


async def _resolve_presenter_image_for_station(station: str) -> str:
    """S3 URL of the first presenter avatar on the currently live `station`
    show, or empty string if none. Used by `/presenter-image.jpg`.

    Treats a `/avatars/shared/...` S3 URL on a user who **does** have a
    `team_id` as a stale legacy upload (Team Settings now writes to
    `/avatars/{team_id}/...`). Such URLs are deliberately ignored so grk.fm
    doesn't keep rendering an avatar that was removed from Team Settings UI
    but whose DB record still carries the pre-team-scope URL.
    """
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": [station, "both"]}},
        {"_id": 0, "show_id": 1},
    )
    if not cached or not cached.get("show_id"):
        return ""
    show_doc = await db.shows.find_one({"id": cached["show_id"]}, {"_id": 0, "presenter_ids": 1})
    presenter_ids = (show_doc or {}).get("presenter_ids") or []
    if not presenter_ids:
        return ""
    users = await db.users.find(
        {"id": {"$in": presenter_ids}},
        {"_id": 0, "id": 1, "avatar": 1, "avatar_url": 1, "team_id": 1, "main_site_id": 1},
    ).to_list(10)
    by_id = {u.get("id"): u for u in users if u.get("id")}

    def _is_stale(user: dict, url: str) -> bool:
        """A `/avatars/shared/...` URL on a user who now has a team_id or
        main_site_id is a leftover from before team-scoping — must not be
        served because the Team Settings UI assumes `/avatars/{scope}/...`."""
        if not url or "/avatars/shared/" not in url:
            return False
        return bool(user.get("team_id") or user.get("main_site_id"))

    for pid in presenter_ids:
        u = by_id.get(pid) or {}
        avatar = u.get("avatar")
        if isinstance(avatar, dict):
            url = avatar.get("s3_url") or ""
            if url and "/None/" not in url and "/None_" not in url and not _is_stale(u, url):
                return url
        legacy = u.get("avatar_url") or ""
        if (
            legacy.startswith("https://")
            and "your-objectstorage.com" in legacy
            and "/None/" not in legacy
            and not _is_stale(u, legacy)
        ):
            return legacy
    return ""


@rds_router.get("/{station}/presenter-image.jpg")
async def get_station_presenter_image(station: str):
    """Public endpoint: Direct `<img src>` URL for the on-air presenter.

    Used by grk.fm / mfy.fm banners that embed
    `<img src="/api/rds/{station}/presenter-image.jpg">` directly.

    - When the live show's first presenter has an S3 avatar: 302 redirect.
    - Otherwise: 200 OK with a 1×1 transparent PNG so the browser
      overwrites whatever stale image was cached on screen.
    """
    from fastapi.responses import RedirectResponse
    url = await _resolve_presenter_image_for_station(station)
    if url:
        return RedirectResponse(url=url, status_code=302)
    return _empty_image_response()


@rds_router.get("/{station}/presenter-image-url.txt")
async def get_station_presenter_image_url_txt(station: str):
    """Plain-text variant of `/presenter-image.jpg` — returns the URL or ""."""
    from fastapi.responses import PlainTextResponse
    url = await _resolve_presenter_image_for_station(station)
    return PlainTextResponse(content=url or "", media_type="text/plain")


@rds_router.get("/{station}/presenter-image.json")
async def get_station_presenter_image_json(station: str):
    """JSON variant: `{ station, has_image, image_url }`."""
    url = await _resolve_presenter_image_for_station(station)
    return {
        "station": station,
        "has_image": bool(url),
        "image_url": url or "",
    }


@rds_router.get("/mfy/now-playing.json")
async def get_mfy_now_playing_json():
    """Public endpoint: Same as /mfy/now-playing — explicit .json alias for symmetry with .txt."""
    from services.shoutcast import get_cached_now_playing
    return await get_cached_now_playing(db, "mfy")


@rds_router.get("/mfy/now-playing.txt")
async def get_mfy_now_playing_txt():
    """Public endpoint: Get just the song title from MFY Shoutcast as plain text."""
    from fastapi.responses import PlainTextResponse
    from services.shoutcast import get_cached_now_playing
    
    data = await get_cached_now_playing(db, "mfy")
    return PlainTextResponse(content=data.get("song_title", ""), media_type="text/plain")


async def get_now_playing_source_station(station: str) -> str:
    """Determine which station's now playing data to use.
    
    If the current active show has rds_station="both", GRK uses MFY's now playing.
    Otherwise, use the requested station's own now playing.
    """
    if station == "grk":
        # Check if there's an active show with rds_station="both"
        active_show = await db.rds_cached_rundowns.find_one(
            {"is_active": True, "rds_station": "both"},
            {"_id": 0, "rds_station": 1}
        )
        if active_show:
            # Show is on both stations, GRK uses MFY's now playing
            return "mfy"
    return station


@rds_router.get("/grk/now-playing")
async def get_grk_now_playing():
    """Public endpoint: Get the current now playing info from GRK Shoutcast (cached, 10s interval).
    
    Note: If the current active show has rds_station="both", this returns MFY's now playing data.
    """
    from services.shoutcast import get_cached_now_playing
    
    source_station = await get_now_playing_source_station("grk")
    data = await get_cached_now_playing(db, source_station)
    
    # Return with GRK station info but source station's song data
    result = dict(data)
    result["station"] = "grk"
    result["source_station"] = source_station
    if source_station != "grk":
        result["note"] = "Now playing data sourced from MFY (show is on both stations)"
    return result


@rds_router.get("/grk/now-playing.json")
async def get_grk_now_playing_json():
    """Public endpoint: Same as /grk/now-playing — explicit .json alias for symmetry with .txt."""
    return await get_grk_now_playing()


@rds_router.get("/grk/now-playing.txt")
async def get_grk_now_playing_txt():
    """Public endpoint: Get just the song title from GRK Shoutcast as plain text.
    
    Note: If the current active show has rds_station="both", this returns MFY's song title.
    """
    from fastapi.responses import PlainTextResponse
    from services.shoutcast import get_cached_now_playing
    
    source_station = await get_now_playing_source_station("grk")
    data = await get_cached_now_playing(db, source_station)
    return PlainTextResponse(content=data.get("song_title", ""), media_type="text/plain")


@rds_router.get("/mfy/cached-rundown")
async def get_mfy_cached_rundown():
    """Public endpoint: Get the cached rundown for the current MFY live show."""
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": ["mfy", "both"]}},
        {"_id": 0}
    )
    
    if not cached:
        return {
            "status": "no_live_show",
            "message": "No MFY live show is currently running",
            "station": "mfy",
            "cached_at": None,
            "show": None,
            "items": []
        }
    
    return {
        "status": "success",
        "station": "mfy",
        "cached_at": cached.get("cached_at"),
        "show": {
            "id": cached.get("show_id"),
            "title": cached.get("show_title"),
            "date": cached.get("show_date"),
            "start_time": cached.get("show_start_time"),
            "end_time": cached.get("show_end_time")
        },
        "items": cached.get("items", [])
    }


@rds_router.get("/grk/cached-rundown")
async def get_grk_cached_rundown():
    """Public endpoint: Get the cached rundown for the current GRK live show."""
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": ["grk", "both"]}},
        {"_id": 0}
    )
    
    if not cached:
        return {
            "status": "no_live_show",
            "message": "No GRK live show is currently running",
            "station": "grk",
            "cached_at": None,
            "show": None,
            "items": []
        }
    
    return {
        "status": "success",
        "station": "grk",
        "cached_at": cached.get("cached_at"),
        "show": {
            "id": cached.get("show_id"),
            "title": cached.get("show_title"),
            "date": cached.get("show_date"),
            "start_time": cached.get("show_start_time"),
            "end_time": cached.get("show_end_time")
        },
        "items": cached.get("items", [])
    }



# ============== SHOUTCAST FILTERS & LOGS ==============

class ShoutcastFilter(BaseModel):
    """A filter rule for now playing text."""
    match: str
    replace: str = ""
    case_insensitive: bool = True
    whole_word: bool = False  # When True, only match whole words (prevents "Swift" → "Swi&")


class ShoutcastFiltersUpdate(BaseModel):
    """Update filters for a station."""
    filters: List[ShoutcastFilter]


@rds_router.get("/shoutcast/filters/{station}")
async def get_shoutcast_filters(
    station: str,
    current_user: dict = Depends(require_admin)
):
    """Get the now playing filters for a station."""
    settings = await db.shoutcast_settings.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    if not settings:
        # Return default filters
        from services.shoutcast import DEFAULT_FILTERS
        return {
            "station": station,
            "filters": DEFAULT_FILTERS
        }
    
    return settings


@rds_router.put("/shoutcast/filters/{station}")
async def update_shoutcast_filters(
    station: str,
    data: ShoutcastFiltersUpdate,
    current_user: dict = Depends(require_admin)
):
    """Update the now playing filters for a station."""
    
    now = datetime.now(timezone.utc).isoformat()
    
    filters_data = [f.dict() for f in data.filters]
    
    await db.shoutcast_settings.update_one(
        {"station": station},
        {"$set": {
            "station": station,
            "filters": filters_data,
            "updated_at": now
        }},
        upsert=True
    )
    
    return {
        "status": "success",
        "message": f"Filters updated for {station}",
        "station": station,
        "filters": filters_data
    }


# ============== RDS IMAGE ENDPOINTS ==============
# Public endpoints for MagicRDS to fetch show images


async def _resolve_show_image_for_station(station: str) -> tuple[dict | None, str | None]:
    """Find the S3 image URL for the currently LIVE show on `station`.

    Priority order (chosen so per-episode plate art can override the
    template):

    1. `shows.{show_id}.image.s3_url`     — per-episode upload. The radio
       team's explicit override for THIS airing (e.g. weekly plate cover).
    2. `show_titles.{name}.image.s3_url`  — Show Management template. Used
       as fallback when no per-episode plate has been uploaded.
    3. `rds_cached_rundowns.show_image`   — pre-baked snapshot.

    Only S3 URLs are returned. Local `/uploads/...` paths are treated as
    missing so external consumers don't end up pointing at host-internal
    files.

    Returns `(image_dict_or_None, show_title)`.
    """
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": [station, "both"]}},
        {"_id": 0, "show_id": 1, "team_id": 1, "main_site_id": 1, "show_title": 1, "show_image": 1},
    )
    if not cached:
        return None, None

    show_title = cached.get("show_title")
    scope_id = cached.get("main_site_id") or cached.get("team_id")
    show_id = cached.get("show_id")

    def s3_only(raw: dict | None) -> dict | None:
        if not raw or not isinstance(raw, dict):
            return None
        s3_url = raw.get("s3_url")
        if not s3_url:
            return None
        # Reject corrupt records where the upload landed with a literal
        # "None" scope segment in the path — these are legacy uploads done
        # before the team/main_site context was injected, and they point
        # at orphaned files (typically the wrong presenter's photo, e.g.
        # Hadewig sticking to unrelated shows). Treat as missing so the
        # transparent placeholder kicks in.
        if "/None/" in s3_url or "/None_" in s3_url:
            return None
        return {
            "s3_url": s3_url,
            "mime_type": raw.get("mime_type", "image/jpeg"),
            "filename": raw.get("filename") or raw.get("file_name"),
        }

    # 1. Per-episode upload — wins over the template so weekly plate art
    #    can be swapped per airing without touching the show template.
    if show_id:
        show_doc = await db.shows.find_one({"id": show_id}, {"_id": 0, "image": 1})
        img = s3_only((show_doc or {}).get("image"))
        if img:
            return img, show_title

    # 2. Show title template — fallback when the episode has no cover of
    #    its own. Scoped to the same main_site/team as the cached rundown
    #    so a sibling site's show with the same name can't steal the image.
    if show_title and scope_id:
        title_doc = await db.show_titles.find_one(
            {
                "name": show_title,
                "$or": [{"team_id": scope_id}, {"main_site_id": scope_id}],
            },
            {"_id": 0, "image": 1},
        )
        img = s3_only((title_doc or {}).get("image"))
        if img:
            return img, show_title

    # 3. Cached rundown snapshot
    img = s3_only(cached.get("show_image"))
    if img:
        return img, show_title

    return None, show_title


def _image_url_from(img: dict | None) -> str | None:
    """Public URL for an image dict — S3 only.

    Policy: we never serve local `/uploads/...` URLs from the RDS endpoint
    because MagicRDS and external embedders need a stable, CDN-friendly
    URL. If the upload didn't land on S3 the consumer should fall back to
    its own placeholder instead of pointing at a host-internal path.
    """
    if not img:
        return None
    if img.get("s3_url"):
        return img["s3_url"]
    return None


@rds_router.get("/{station}/image")
async def get_station_show_image(station: str):
    """Public endpoint: Get the current show image URL for a station.

    Returns the S3 URL or local URL of the current live show's image.
    Walks (cached rundown → show instance → show title template) so any
    image uploaded via Show Management is picked up.

    URL format: /api/rds/{station}/image
    Example: /api/rds/grk/image
    """
    image_data, show_title = await _resolve_show_image_for_station(station)
    image_url = _image_url_from(image_data)
    if image_data and image_url:
        return {
            "station": station,
            "show_title": show_title,
            "has_image": True,
            "image_url": image_url,
            "mime_type": image_data.get("mime_type", "image/jpeg"),
            "filename": image_data.get("filename"),
        }
    return {
        "station": station,
        "show_title": show_title,
        "has_image": False,
        "image_url": None,
        "message": "No image available for current show",
    }


@rds_router.get("/{station}/image.jpg")
async def get_station_show_image_redirect(station: str):
    """Public endpoint: Redirect to the actual image file.

    Used by MagicRDS, grk.fm/mfy.fm players and similar systems that
    embed `<img src=".../image.jpg">` directly.

    Behaviour depends on the admin toggle `RDS Settings → Prefer show image`:
      - False (default) → serve the presenter composite PNG (transparent
        fallback included).
      - True → serve the legacy manually-uploaded show-title image, with the
        composite as fallback when no title image is set.
    """
    from fastapi.responses import RedirectResponse

    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": [station, "both"]}},
        {"_id": 0, "show_id": 1, "main_site_id": 1, "team_id": 1},
    )
    if not cached:
        return _placeholder_image_response()

    # Lazy import to avoid cross-router circular import at module load.
    from routers.public_schedule import _get_prefer_show_image
    prefer_show_image = await _get_prefer_show_image(
        cached.get("main_site_id"), cached.get("team_id")
    )

    if prefer_show_image:
        # Legacy mode: try to serve the show-title image first.
        image_data, _ = await _resolve_show_image_for_station(station)
        image_url = _image_url_from(image_data)
        if image_url:
            return RedirectResponse(url=image_url, status_code=302)
        # Fall through to composite as fallback.

    return RedirectResponse(url=f"/api/rds/{station}/presenter-composite.png", status_code=302)


def _extract_avatar_url(user: dict) -> str | None:
    """Return the best avatar URL for a user doc.

    Users may carry either the legacy top-level `avatar_url` string OR
    the newer `avatar` sub-document (`file_key` / `s3_url`). Return an
    absolute URL when we have one, otherwise a relative `/uploads/...`
    path (fetched from disk below)."""
    if not user:
        return None
    if user.get("avatar_url"):
        return user["avatar_url"]
    av = user.get("avatar") or {}
    if isinstance(av, dict):
        if av.get("s3_url"):
            return av["s3_url"]
        if av.get("file_key"):
            return f"/uploads/avatars/{av['file_key']}"
    return None


# Public image APIs (composite + `/presenter-image/{slot}.png`) only expose
# the first N presenters of a show. Keep this in sync with the frontend
# warning in `ShowDetailPage.js::togglePresenter`.
MAX_PRESENTERS_IN_COMPOSITE = 3


async def _resolve_slot_avatar_url(presenter_ids: list[str], slot: int) -> str | None:
    """Return the Team-Settings avatar URL for the Nth presenter of a show
    (1-based `slot`). Stale `/avatars/shared/...` URLs for team-scoped
    users are dropped so the slot renders transparent instead of leaking a
    legacy picture. Returns None when the slot is out of range or the
    presenter has no usable avatar."""
    if slot < 1 or slot > MAX_PRESENTERS_IN_COMPOSITE:
        return None
    if not presenter_ids or len(presenter_ids) < slot:
        return None
    url_by_id: dict[str, str | None] = {}
    async for u in db.users.find(
        {"id": {"$in": presenter_ids}},
        {"_id": 0, "id": 1, "avatar_url": 1, "avatar": 1, "team_id": 1, "main_site_id": 1},
    ):
        url = _extract_avatar_url(u) or None
        if url and "/avatars/shared/" in url and (u.get("team_id") or u.get("main_site_id")):
            url = None
        url_by_id[u["id"]] = url
    # Preserve show-doc ordering, drop ghost ids (users that no longer exist).
    ordered = [url_by_id[pid] for pid in presenter_ids if pid in url_by_id]
    if len(ordered) < slot:
        return None
    return ordered[slot - 1]


async def _station_has_presenters(station: str) -> bool:
    """Return True when the currently live show on `station` has at least
    one presenter with a non-stale avatar we can composite."""
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": [station, "both"]}},
        {"_id": 0, "show_id": 1},
    )
    if not cached:
        return False
    show = await db.shows.find_one({"id": cached.get("show_id")}, {"_id": 0, "presenter_ids": 1})
    if not show or not show.get("presenter_ids"):
        return False
    async for u in db.users.find(
        {"id": {"$in": show["presenter_ids"]}},
        {"_id": 0, "avatar_url": 1, "avatar": 1, "team_id": 1, "main_site_id": 1},
    ):
        url = _extract_avatar_url(u)
        if url and "/avatars/shared/" in url and (u.get("team_id") or u.get("main_site_id")):
            # Stale legacy upload — treat as if the user had no avatar.
            continue
        if url:
            return True
    return False


def _placeholder_image_response():
    """Serve the packaged transparent show placeholder — the file the
    user attached in the bug report (1366×808 transparent PNG)."""
    from fastapi.responses import FileResponse
    from pathlib import Path
    ph = Path(__file__).parent.parent / "static" / "show_placeholder.png"
    if ph.exists():
        return FileResponse(
            str(ph),
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=60"},
        )
    return _empty_image_response()


async def _build_presenter_composite_response(presenter_ids: list[str]):
    """Build a Response with the PIL-composited overlapping-circles PNG for
    an arbitrary list of presenter_ids. Shared by the live-station endpoint
    and the per-show public endpoint consumed by grk.fm."""
    from fastapi.responses import Response
    from io import BytesIO
    import httpx
    from PIL import Image

    if not presenter_ids:
        return _placeholder_image_response()

    # Build a URL-or-None entry per presenter_id so every presenter keeps a slot
    # — presenters without an avatar render as an empty transparent circle.
    # IMPORTANT: drop "ghost" presenter_ids that no longer resolve to a user
    # doc. Keeping them in bloats the canvas with an empty slot on the left
    # (deleted user), which on grk.fm manifests as "the first presenter is
    # gone, only the second shows" — see production bug on show "Genkluistert".
    url_by_id: dict[str, str | None] = {}
    async for u in db.users.find(
        {"id": {"$in": presenter_ids}},
        {"_id": 0, "id": 1, "avatar_url": 1, "avatar": 1, "team_id": 1, "main_site_id": 1},
    ):
        url = _extract_avatar_url(u) or None
        # Drop stale `/avatars/shared/...` URLs for users who now belong to a
        # team/main-site — those are leftovers from before team-scoping.
        if url and "/avatars/shared/" in url and (u.get("team_id") or u.get("main_site_id")):
            url = None
        url_by_id[u["id"]] = url
    # Preserve the show-doc ordering, but skip ghosts entirely.
    ordered_urls: list[str | None] = [url_by_id[pid] for pid in presenter_ids if pid in url_by_id]
    # Cap at MAX_PRESENTERS_IN_COMPOSITE — the public image APIs expose
    # only the first N presenters (frontend warns the operator when a 4th
    # is added so this cap is never surprising).
    ordered_urls = ordered_urls[:MAX_PRESENTERS_IN_COMPOSITE]

    # No real presenters at all (every id was a ghost) → transparent placeholder.
    if not ordered_urls:
        return _placeholder_image_response()

    # If literally no presenter has an avatar, return the fully transparent
    # placeholder — matches the frontend `PresenterComposite` behaviour.
    if not any(ordered_urls):
        return _placeholder_image_response()

    # Composite: every presenter gets an avatar_size slot. Slots without a URL
    # stay transparent — the canvas is RGBA(0,0,0,0) and we simply don't paste.
    # Rectangular avatars sit side-by-side without overlap — the consumer
    # (grk.fm, player) can round their corners via CSS.
    canvas_h = 512
    avatar_size = 384
    canvas_w = avatar_size * len(ordered_urls)
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

    from pathlib import Path
    UPLOADS_ROOT = Path(__file__).parent.parent / "uploads"

    async def _load_avatar(url: str):
        if url.startswith("/uploads/"):
            path = UPLOADS_ROOT / url[len("/uploads/"):]
            if path.exists():
                return Image.open(path).convert("RGBA")
            return None
        try:
            r = await client.get(url)
            r.raise_for_status()
            return Image.open(BytesIO(r.content)).convert("RGBA")
        except Exception:
            return None

    async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
        for i, url in enumerate(ordered_urls):
            x = i * avatar_size
            y = (canvas_h - avatar_size) // 2
            if not url:
                continue
            avatar = await _load_avatar(url)
            if avatar is None:
                continue
            side = min(avatar.size)
            left = (avatar.width - side) // 2
            top = (avatar.height - side) // 2
            avatar = avatar.crop((left, top, left + side, top + side)).resize(
                (avatar_size, avatar_size), Image.LANCZOS
            )
            # Paste as a plain square — no circular mask. Keeps the avatar's
            # own transparency (if any) intact so the grk.fm hero and other
            # consumers can style the shape themselves (border-radius in CSS).
            canvas.paste(avatar, (x, y), avatar if avatar.mode == "RGBA" else None)

    buf = BytesIO()
    canvas.save(buf, format="PNG", optimize=True)
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=60"},
    )


@rds_router.get("/{station}/presenter-composite.png")
async def get_station_presenter_composite(station: str):
    """Public endpoint: PIL-composited overlapping circular avatars of the
    presenters on the currently live show. Every presenter gets a slot — if
    they have no avatar in Team Settings, their slot is left fully transparent
    so the layout still shows how many presenters are on the show.

    Falls back to the packaged transparent placeholder when the live show has
    no presenters at all."""
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": [station, "both"]}},
        {"_id": 0, "show_id": 1},
    )
    if not cached:
        return _placeholder_image_response()
    show = await db.shows.find_one({"id": cached.get("show_id")}, {"_id": 0, "presenter_ids": 1})
    presenter_ids = (show or {}).get("presenter_ids") or []
    return await _build_presenter_composite_response(presenter_ids)


@rds_router.get("/show/{show_id}/presenter-composite.png")
async def get_show_presenter_composite(show_id: str):
    """Public endpoint: same overlapping-circles composite PNG but for an
    arbitrary show (not just the currently live one). Used by grk.fm's
    programmering page so every schedule row renders a multi-presenter
    picture without the external site having to iterate `presenter_avatars[]`.
    """
    show = await db.shows.find_one({"id": show_id}, {"_id": 0, "presenter_ids": 1, "title": 1, "team_id": 1})
    presenter_ids = (show or {}).get("presenter_ids") or []
    # Fall back to the show-title defaults when the episode itself has none
    if not presenter_ids and show:
        title_doc = await db.show_titles.find_one(
            {"name": show.get("title"), "team_id": show.get("team_id")},
            {"_id": 0, "default_presenter_ids": 1}
        )
        if title_doc:
            presenter_ids = title_doc.get("default_presenter_ids", []) or []
    return await _build_presenter_composite_response(presenter_ids)


async def _build_single_presenter_image_response(presenter_ids: list[str], slot: int):
    """Serve the Nth presenter's avatar as a 512×512 PNG (centered-cropped
    to a square so grk.fm / player can embed it next to other slots).

    Returns the transparent placeholder when the slot is empty, out of
    range (> MAX_PRESENTERS_IN_COMPOSITE), or the presenter has no avatar
    uploaded in Team Settings — i.e. the API never falls back to a legacy
    Show-Management image here (same policy as the composite endpoint)."""
    from fastapi.responses import Response
    from io import BytesIO
    import httpx
    from PIL import Image

    url = await _resolve_slot_avatar_url(presenter_ids, slot)
    if not url:
        return _placeholder_image_response()

    # Resolve relative `/uploads/...` paths against the local backend so the
    # same loader works for S3 and legacy pod-local uploads.
    if url.startswith("/"):
        import os
        base = os.environ.get("INTERNAL_BACKEND_URL") or "http://localhost:8001"
        url = f"{base}{url}"

    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return _placeholder_image_response()
            img = Image.open(BytesIO(resp.content)).convert("RGBA")
    except Exception:
        return _placeholder_image_response()

    # Center-crop to a square then resize to 512×512 for a predictable
    # consumer size (matches the per-slot size inside the composite).
    side = min(img.size)
    left = (img.width - side) // 2
    top = (img.height - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((512, 512), Image.LANCZOS)

    buf = BytesIO()
    img.save(buf, format="PNG")
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=60"},
    )


async def _resolve_live_show_presenter_ids(station: str) -> list[str]:
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": [station, "both"]}},
        {"_id": 0, "show_id": 1},
    )
    if not cached:
        return []
    show = await db.shows.find_one(
        {"id": cached.get("show_id")}, {"_id": 0, "presenter_ids": 1}
    )
    return (show or {}).get("presenter_ids") or []


async def _resolve_show_presenter_ids(show_id: str) -> list[str]:
    show = await db.shows.find_one(
        {"id": show_id}, {"_id": 0, "presenter_ids": 1, "title": 1, "team_id": 1}
    )
    if not show:
        return []
    presenter_ids = show.get("presenter_ids") or []
    if not presenter_ids:
        title_doc = await db.show_titles.find_one(
            {"name": show.get("title"), "team_id": show.get("team_id")},
            {"_id": 0, "default_presenter_ids": 1},
        )
        if title_doc:
            presenter_ids = title_doc.get("default_presenter_ids", []) or []
    return presenter_ids


@rds_router.get("/{station}/presenter-image/{slot:int}.png")
async def get_station_presenter_image_by_slot(station: str, slot: int):
    """Public endpoint: Nth presenter's Team-Settings avatar as a square PNG
    for the currently live show on `station`. `slot` is 1-based and capped
    at 3 — slots beyond that return the transparent placeholder (frontend
    warns operators when a 4th presenter is added to a show).

    Example: `/api/rds/grk/presenter-image/2.png` → second presenter."""
    presenter_ids = await _resolve_live_show_presenter_ids(station)
    return await _build_single_presenter_image_response(presenter_ids, slot)


@rds_router.get("/show/{show_id}/presenter-image/{slot:int}.png")
async def get_show_presenter_image_by_slot(show_id: str, slot: int):
    """Public endpoint: Nth presenter's Team-Settings avatar as a square PNG
    for an arbitrary show. 1-based slot, capped at 3.

    Example: `/api/rds/show/<id>/presenter-image/1.png` → first presenter."""
    presenter_ids = await _resolve_show_presenter_ids(show_id)
    return await _build_single_presenter_image_response(presenter_ids, slot)


@rds_router.get("/{station}/image-url.txt")
async def get_station_show_image_url_txt(station: str):
    """Public endpoint: Get just the image URL as plain text."""
    from fastapi.responses import PlainTextResponse

    image_data, _ = await _resolve_show_image_for_station(station)
    image_url = _image_url_from(image_data) or ""
    return PlainTextResponse(content=image_url, media_type="text/plain")


@rds_router.get("/{station}/image-url.json")
async def get_station_show_image_url_json(station: str):
    """Public endpoint: JSON-wrapped image URL of the current live show on this station."""
    image_data, show_title = await _resolve_show_image_for_station(station)
    image_url = _image_url_from(image_data) or ""
    return {
        "station": station,
        "field": "image_url",
        "value": image_url,
        "show_title": show_title or "",
    }


# ============== SHOUTCAST LOGS (admin-only debugging) ==============

@rds_router.get("/shoutcast/logs")
async def get_shoutcast_logs(
    request: Request,
    station: Optional[str] = None,
    stations: Optional[str] = None,
    limit: int = 100,
    current_user: dict = Depends(require_admin)
):
    """Get recent Shoutcast now playing logs. Optionally filter by station code(s)."""
    query = {}
    if station:
        query["station"] = station
    elif stations:
        code_list = [s.strip().lower() for s in stations.split(",") if s.strip()]
        if code_list:
            query["station"] = {"$in": code_list}
    
    logs = await db.shoutcast_logs.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return logs


@rds_router.delete("/shoutcast/logs")
async def clear_shoutcast_logs(
    station: Optional[str] = None,
    current_user: dict = Depends(require_admin)
):
    """Clear Shoutcast logs (optionally for a specific station)."""
    query = {}
    if station:
        query["station"] = station
    
    result = await db.shoutcast_logs.delete_many(query)
    
    return {
        "status": "success",
        "message": f"Deleted {result.deleted_count} log entries"
    }


@rds_router.get("/troubleshoot/{station}")
async def troubleshoot_station(
    station: str,
    current_user: dict = Depends(require_admin),
):
    """Run a live end-to-end diagnostic for a station's stream-monitoring
    chain and report exactly which step is failing. The Monitor UI exposes
    this behind a Troubleshoot button.

    The returned ``checks`` list contains entries shaped as::

        {"name": "...", "ok": bool, "detail": str, "data": {...}}

    Order is meaningful: a downstream check will be SKIPPED (``ok=None``)
    once an upstream check fails.
    """
    import socket
    import time
    import httpx
    from urllib.parse import urlparse

    from services.shoutcast import (
        SHOUTCAST_SERVERS,
        fetch_shoutcast_with_autodiscovery,
        resolve_active_stream,
    )

    checks: list[dict] = []

    def _add(name: str, ok, detail: str = "", data: dict | None = None):
        checks.append({"name": name, "ok": ok, "detail": detail, "data": data or {}})

    # 1) Station configured?
    station_doc = await db.rds_stations.find_one(
        {"code": station}, {"_id": 0, "code": 1, "name": 1, "stream_url": 1, "enabled": 1}
    )
    legacy = SHOUTCAST_SERVERS.get(station)
    if not station_doc and not legacy:
        _add("Station configured", False,
             f"No rds_stations doc with code='{station}' and no legacy SHOUTCAST_SERVERS entry.",
             {})
        return {"station": station, "ok": False, "checks": checks}
    _add("Station configured", True,
         f"Station '{station}' is registered.",
         {"doc": station_doc, "legacy": legacy})

    # 2) Stream URL resolution (honours per-station custom-schedule logic)
    url, station_name, active_custom = await resolve_active_stream(station)
    if not url:
        _add("Stream URL resolved", False,
             "resolve_active_stream returned no URL. Check rds_stations.stream_url and any custom-stream-windows.",
             {"station_name": station_name})
        return {"station": station, "ok": False, "checks": checks}
    _add("Stream URL resolved", True,
         "Active stream URL selected.",
         {"url": url, "station_name": station_name,
          "active_source": "custom" if active_custom else "default",
          "custom_label": (active_custom or {}).get("label") if active_custom else None})

    parsed_url = urlparse(url)
    host = parsed_url.hostname or ""
    port = parsed_url.port or (443 if parsed_url.scheme == "https" else 80)

    # 3) DNS resolution
    dns_ok = False
    dns_ip = None
    try:
        loop = asyncio.get_event_loop()
        addr_info = await loop.run_in_executor(None, socket.gethostbyname, host)
        dns_ip = addr_info
        dns_ok = True
        _add("DNS resolves", True, f"{host} → {dns_ip}", {"host": host, "ip": dns_ip})
    except Exception as e:
        _add("DNS resolves", False, f"{host}: {e}", {"host": host})

    # 4) TCP reachable on stream port (only if DNS ok)
    tcp_ok = None
    if dns_ok:
        try:
            t0 = time.time()
            fut = asyncio.open_connection(host, port)
            reader, writer = await asyncio.wait_for(fut, timeout=4.0)
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            dt = round((time.time() - t0) * 1000, 1)
            tcp_ok = True
            _add("TCP reachable", True, f"{host}:{port} accepted connection in {dt} ms",
                 {"host": host, "port": port, "latency_ms": dt})
        except Exception as e:
            tcp_ok = False
            _add("TCP reachable", False, f"{host}:{port}: {e}",
                 {"host": host, "port": port})
    else:
        _add("TCP reachable", None, "Skipped — DNS failed", {})

    # 5) HTTP request to the stream endpoint (HEAD-style GET with short timeout)
    if tcp_ok:
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                # Some shoutcast servers don't like HEAD; do GET with 0-byte read.
                r = await client.get(url, headers={"Icy-MetaData": "0", "User-Agent": "ClaraRDS/1.0"})
                ct = r.headers.get("content-type", "")
                ok = 200 <= r.status_code < 400
                _add("HTTP reachable", ok,
                     f"HTTP {r.status_code} {ct}",
                     {"status_code": r.status_code, "content_type": ct,
                      "icy_name": r.headers.get("icy-name"),
                      "icy_metaint": r.headers.get("icy-metaint")})
        except Exception as e:
            _add("HTTP reachable", False, f"HTTP request failed: {e}", {"url": url})
    else:
        _add("HTTP reachable", None, "Skipped — TCP failed", {})

    # 6) Shoutcast/Icecast metadata parse via the production helper
    parsed = None
    try:
        parsed = await fetch_shoutcast_with_autodiscovery(url)
    except Exception as e:
        _add("Shoutcast metadata parses", False, f"Parser raised: {e}", {})
    else:
        if parsed is None:
            _add("Shoutcast metadata parses", False,
                 "fetch_shoutcast_with_autodiscovery returned None — "
                 "endpoint not recognised as Shoutcast/Icecast or all autodiscovery paths "
                 "(/7.html, /status-json.xsl, /status.xsl, ICY headers) failed.",
                 {})
        else:
            online = parsed.get("stream_status") == 1
            _add("Shoutcast metadata parses", True,
                 f"server='{parsed.get('server_title')}' song='{parsed.get('raw_song_title','')[:80]}'",
                 {"server_title": parsed.get("server_title"),
                  "raw_song_title": parsed.get("raw_song_title"),
                  "current_listeners": parsed.get("current_listeners"),
                  "stream_status": parsed.get("stream_status"),
                  "bitrate": parsed.get("bitrate")})
            _add("Stream broadcasting (stream_status=1)", bool(online),
                 "Stream is live" if online else "Server reachable but stream_status != 1 (encoder offline / no source connected).",
                 {"stream_status": parsed.get("stream_status")})

    # 7) Cache freshness — when did rds_builder_scheduler last successfully
    #    write to shoutcast_cache for this station?
    cache = await db.shoutcast_cache.find_one(
        {"station": station},
        {"_id": 0, "cached_at": 1, "stream_online": 1, "status": 1, "message": 1}
    )
    if not cache:
        _add("Cache populated", False, "No shoutcast_cache document for this station — scheduler hasn't run yet?", {})
    else:
        from datetime import datetime as _dt, timezone as _tz
        ts = cache.get("cached_at")
        age_s = None
        try:
            dt = _dt.fromisoformat(str(ts).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=_tz.utc)
            age_s = (_dt.now(_tz.utc) - dt).total_seconds()
        except Exception:
            pass
        fresh = age_s is not None and age_s < 90  # scheduler runs every ~15-30s
        _add("Cache populated", fresh,
             f"Last cached at {ts}" + (f" ({int(age_s)}s ago)" if age_s is not None else ""),
             {"cached_at": ts, "age_seconds": int(age_s) if age_s is not None else None,
              "stream_online": cache.get("stream_online"),
              "status": cache.get("status"),
              "message": cache.get("message")})

    # 8) Last 10 logs for context
    logs = await db.shoutcast_logs.find(
        {"station": station}, {"_id": 0, "timestamp": 1, "stream_online": 1, "status": 1, "song_title": 1, "current_listeners": 1}
    ).sort("timestamp", -1).limit(10).to_list(10)

    overall_ok = all(c.get("ok") for c in checks if c.get("ok") is not None)
    return {
        "station": station,
        "ok": overall_ok,
        "checks": checks,
        "recent_logs": logs,
        "summary": _summarise_failure(checks) if not overall_ok else "All checks passed.",
    }


def _summarise_failure(checks: list[dict]) -> str:
    """Build a one-line human summary of the first failing diagnostic step."""
    for c in checks:
        if c.get("ok") is False:
            name = c.get("name", "check")
            detail = c.get("detail", "")
            hint = ""
            n = name.lower()
            if "dns" in n:
                hint = " → Check that the stream domain still exists (DNS/Cloudflare)."
            elif "tcp" in n:
                hint = " → Stream server is unreachable on that port (firewall/server down)."
            elif "http" in n:
                hint = " → Server is not responding with a valid HTTP status (check Icecast/Shoutcast process)."
            elif "metadata" in n:
                hint = " → Endpoint is not a valid Shoutcast/Icecast metadata URL (check stream_url path)."
            elif "broadcasting" in n:
                hint = " → Server is up but no source/encoder is connected (DJ software isn't running)."
            elif "cache" in n:
                hint = " → The RDS scheduler has not written recently — check supervisor logs."
            elif "configured" in n:
                hint = " → Add the station via RDS → Settings."
            return f"{name}: {detail}{hint}"
    return ""
