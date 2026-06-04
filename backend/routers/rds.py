"""RDS Integration routes for MagicRDS and external systems."""
from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid

from database import db
from services.auth import get_current_user, require_admin
from services.main_site_context import get_main_site_id_from_header

rds_router = APIRouter(prefix="/rds", tags=["RDS Integration"])


class RDSSettings(BaseModel):
    """RDS integration settings."""
    production_base_url: str = "https://clara.koodh.com"
    cache_refresh_interval: int = 1  # minutes


class RDSSettingsResponse(BaseModel):
    """Response model for RDS settings."""
    id: str
    team_id: Optional[str] = None
    production_base_url: str
    cache_refresh_interval: int
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
            "last_cache_refresh": None,
            "created_at": now,
            "updated_at": now
        }
        await db.rds_settings.insert_one(settings)
        settings.pop("_id", None)
    
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


@rds_router.get("/debug-live-shows")
async def debug_live_shows(request: Request, current_user: dict = Depends(require_admin)):
    """Debug endpoint to see why a show might not be syncing.
    
    Shows the current time (UTC and Brussels), and any shows that match the current timeframe.
    """
    from datetime import timedelta
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
    current_time_utc = now_utc.strftime('%H:%M')
    
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
            "message": "Er is momenteel geen live show",
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

# Default station names when no live show
DEFAULT_STATION_NAMES = {
    "grk": "the feelgood station",
    "mfy": "altijd dichtbij"
}


async def get_live_show_title_for_station(station: str) -> str:
    """Get the current live show title for a specific station.
    
    First tries to find a show specifically assigned to this station or "both".
    If no station-specific show, returns default station name.
    """
    # Try to find a show specifically assigned to this station or "both"
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": [station, "both"]}},
        {"_id": 0, "show_title": 1}
    )
    if cached and cached.get("show_title"):
        return cached["show_title"]
    
    # Default fallback when no show for this station
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
            "message": "Er is momenteel geen MFY live show",
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
            "message": "Er is momenteel geen GRK live show",
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
    """Walk every known source to find the best image for the currently
    LIVE show on `station`, in priority order:

    1. `rds_cached_rundowns.show_image`  — pre-baked by the scheduler
    2. `shows.{show_id}.image`           — per-show upload (Show Management)
    3. `show_titles.{name}.image`        — per-template upload (Show Titles)

    Returns `(image_dict_normalised_or_None, show_title)`. The normalised dict
    always exposes `s3_url`, `file_key` and `mime_type` regardless of the
    source field naming (`file_storage_key` vs `file_key`).
    """
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": [station, "both"]}},
        {"_id": 0, "show_id": 1, "team_id": 1, "show_title": 1, "show_image": 1},
    )
    if not cached:
        return None, None

    show_title = cached.get("show_title")
    team_id = cached.get("team_id")
    show_id = cached.get("show_id")

    def normalise(raw: dict | None) -> dict | None:
        """Make `{s3_url, file_key, mime_type, filename}` regardless of source."""
        if not raw or not isinstance(raw, dict):
            return None
        s3_url = raw.get("s3_url")
        file_key = raw.get("file_key") or raw.get("file_storage_key")
        if not s3_url and not file_key:
            # Empty placeholder — treat as missing
            return None
        return {
            "s3_url": s3_url,
            "file_key": file_key,
            "mime_type": raw.get("mime_type", "image/jpeg"),
            "filename": raw.get("filename") or raw.get("file_name"),
        }

    # 1. Cached rundown
    img = normalise(cached.get("show_image"))
    if img:
        return img, show_title

    # 2. Show instance (Show Management upload)
    if show_id:
        show_doc = await db.shows.find_one({"id": show_id}, {"_id": 0, "image": 1})
        img = normalise((show_doc or {}).get("image"))
        if img:
            return img, show_title

    # 3. Show title template
    if show_title:
        # Prefer the title doc that belongs to the same team_id / main_site_id as
        # the cached rundown — otherwise we risk picking another site's image
        # if two main sites share a show title name.
        title_doc = None
        if team_id:
            title_doc = await db.show_titles.find_one(
                {"name": show_title, "$or": [{"team_id": team_id}, {"main_site_id": team_id}]},
                {"_id": 0, "image": 1},
            )
        if not title_doc:
            title_doc = await db.show_titles.find_one(
                {"name": show_title}, {"_id": 0, "image": 1}
            )
        img = normalise((title_doc or {}).get("image"))
        if img:
            return img, show_title

    return None, show_title


def _image_url_from(img: dict | None) -> str | None:
    """Public URL for an image dict, S3 preferred, else local upload path."""
    if not img:
        return None
    if img.get("s3_url"):
        return img["s3_url"]
    if img.get("file_key"):
        return f"/uploads/show_title_images/{img['file_key']}"
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

    Used by MagicRDS and similar systems that expect a direct image URL.

    URL format: /api/rds/{station}/image.jpg
    """
    from fastapi.responses import RedirectResponse

    image_data, _ = await _resolve_show_image_for_station(station)
    image_url = _image_url_from(image_data)
    if image_url:
        return RedirectResponse(url=image_url, status_code=302)
    raise HTTPException(status_code=404, detail="No image available for current show")


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
