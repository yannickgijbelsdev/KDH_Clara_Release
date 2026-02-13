"""RDS Integration routes for MagicRDS and external systems."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid

from database import db
from services.auth import get_current_user, require_admin

rds_router = APIRouter(prefix="/rds", tags=["RDS Integration"])


class RDSSettings(BaseModel):
    """RDS integration settings."""
    production_base_url: str = "https://clara.koodh.com"
    cache_refresh_interval: int = 5  # minutes


class RDSSettingsResponse(BaseModel):
    """Response model for RDS settings."""
    id: str
    team_id: str
    production_base_url: str
    cache_refresh_interval: int
    last_cache_refresh: Optional[str] = None
    created_at: str
    updated_at: str


class RDSCacheLog(BaseModel):
    """Log entry for RDS cache refresh."""
    id: str
    team_id: str
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


@rds_router.get("/settings", response_model=RDSSettingsResponse)
async def get_rds_settings(current_user: dict = Depends(require_admin)):
    """Get RDS integration settings for the team."""
    team_id = current_user.get('team_id')
    
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
            "production_base_url": "https://clara.koodh.com",
            "cache_refresh_interval": 5,
            "last_cache_refresh": None,
            "created_at": now,
            "updated_at": now
        }
        await db.rds_settings.insert_one(settings)
        settings.pop("_id", None)
    
    return settings


@rds_router.put("/settings", response_model=RDSSettingsResponse)
async def update_rds_settings(
    settings_data: RDSSettings,
    current_user: dict = Depends(require_admin)
):
    """Update RDS integration settings."""
    team_id = current_user.get('team_id')
    now = datetime.now(timezone.utc).isoformat()
    
    existing = await db.rds_settings.find_one({"team_id": team_id})
    
    update_data = {
        "production_base_url": settings_data.production_base_url.rstrip('/'),
        "cache_refresh_interval": settings_data.cache_refresh_interval,
        "updated_at": now
    }
    
    if existing:
        await db.rds_settings.update_one(
            {"team_id": team_id},
            {"$set": update_data}
        )
    else:
        update_data["id"] = str(uuid.uuid4())
        update_data["team_id"] = team_id
        update_data["created_at"] = now
        update_data["last_cache_refresh"] = None
        await db.rds_settings.insert_one(update_data)
    
    settings = await db.rds_settings.find_one(
        {"team_id": team_id},
        {"_id": 0}
    )
    return settings


@rds_router.get("/endpoints")
async def get_rds_endpoints(current_user: dict = Depends(require_admin)):
    """Get all available RDS API endpoints with production URLs."""
    team_id = current_user.get('team_id')
    
    settings = await db.rds_settings.find_one(
        {"team_id": team_id},
        {"_id": 0}
    )
    
    base_url = settings.get("production_base_url", "https://clara.koodh.com") if settings else "https://clara.koodh.com"
    
    return {
        "base_url": base_url,
        "endpoints": [
            # MFY Station Endpoints
            {
                "name": "MFY - Live Show",
                "description": "Title of the current MFY live show (plain text)",
                "path": "/api/rds/mfy/live",
                "full_url": f"{base_url}/api/rds/mfy/live",
                "method": "GET",
                "auth_required": False,
                "response_type": "text/plain",
                "station": "mfy"
            },
            {
                "name": "MFY - Now Playing",
                "description": "Current track from MFY Shoutcast (plain text)",
                "path": "/api/rds/mfy/now-playing.txt",
                "full_url": f"{base_url}/api/rds/mfy/now-playing.txt",
                "method": "GET",
                "auth_required": False,
                "response_type": "text/plain",
                "station": "mfy"
            },
            {
                "name": "MFY - Now Playing (JSON)",
                "description": "Shoutcast info including listeners (JSON)",
                "path": "/api/rds/mfy/now-playing",
                "full_url": f"{base_url}/api/rds/mfy/now-playing",
                "method": "GET",
                "auth_required": False,
                "response_type": "application/json",
                "station": "mfy"
            },
            {
                "name": "MFY - Cached Rundown",
                "description": "Cached JSON rundown from MFY live show",
                "path": "/api/rds/mfy/cached-rundown",
                "full_url": f"{base_url}/api/rds/mfy/cached-rundown",
                "method": "GET",
                "auth_required": False,
                "response_type": "application/json",
                "station": "mfy"
            },
            # GRK Station Endpoints
            {
                "name": "GRK - Live Show",
                "description": "Title of the current GRK live show (plain text)",
                "path": "/api/rds/grk/live",
                "full_url": f"{base_url}/api/rds/grk/live",
                "method": "GET",
                "auth_required": False,
                "response_type": "text/plain",
                "station": "grk"
            },
            {
                "name": "GRK - Now Playing",
                "description": "Current track from GRK Shoutcast (plain text)",
                "path": "/api/rds/grk/now-playing.txt",
                "full_url": f"{base_url}/api/rds/grk/now-playing.txt",
                "method": "GET",
                "auth_required": False,
                "response_type": "text/plain",
                "station": "grk"
            },
            {
                "name": "GRK - Now Playing (JSON)",
                "description": "Shoutcast info including listeners (JSON)",
                "path": "/api/rds/grk/now-playing",
                "full_url": f"{base_url}/api/rds/grk/now-playing",
                "method": "GET",
                "auth_required": False,
                "response_type": "application/json",
                "station": "grk"
            },
            {
                "name": "GRK - Cached Rundown",
                "description": "Cached JSON rundown from GRK live show",
                "path": "/api/rds/grk/cached-rundown",
                "full_url": f"{base_url}/api/rds/grk/cached-rundown",
                "method": "GET",
                "auth_required": False,
                "response_type": "application/json",
                "station": "grk"
            },
            # General Endpoints (backwards compatibility)
            {
                "name": "All Stations - Live Show",
                "description": "Title of any current live show (plain text)",
                "path": "/api/rds/live",
                "full_url": f"{base_url}/api/rds/live",
                "method": "GET",
                "auth_required": False,
                "response_type": "text/plain",
                "station": "all"
            },
            {
                "name": "All Stations - Cached Rundown",
                "description": "Cached JSON rundown from any live show",
                "path": "/api/rds/cached-rundown",
                "full_url": f"{base_url}/api/rds/cached-rundown",
                "method": "GET",
                "auth_required": False,
                "response_type": "application/json",
                "station": "all"
            }
        ]
    }


@rds_router.get("/logs", response_model=List[RDSCacheLog])
async def get_rds_logs(
    limit: int = 50,
    current_user: dict = Depends(require_admin)
):
    """Get recent RDS cache refresh logs."""
    team_id = current_user.get('team_id')
    
    logs = await db.rds_cache_logs.find(
        {"team_id": team_id},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return logs


@rds_router.post("/refresh-cache")
async def manual_refresh_cache(current_user: dict = Depends(require_admin)):
    """Manually trigger a cache refresh for the current live show."""
    from services.rds_scheduler import refresh_live_show_cache
    
    team_id = current_user.get('team_id')
    result = await refresh_live_show_cache(team_id)
    
    return result


@rds_router.get("/debug-live-shows")
async def debug_live_shows(current_user: dict = Depends(require_admin)):
    """Debug endpoint to see why a show might not be syncing.
    
    Shows the current time (UTC and CET), and any shows that match the current timeframe.
    """
    from datetime import timedelta
    
    now_utc = datetime.now(timezone.utc)
    now_cet = now_utc + timedelta(hours=1)
    
    team_id = current_user.get('team_id')
    
    # Find all shows for today (CET)
    today_cet = now_cet.strftime('%Y-%m-%d')
    today_utc = now_utc.strftime('%Y-%m-%d')
    
    shows_today_cet = await db.shows.find(
        {"date": today_cet, "team_id": team_id},
        {"_id": 0, "id": 1, "title": 1, "date": 1, "start_time": 1, "end_time": 1, "status": 1, "rds_station": 1}
    ).to_list(50)
    
    shows_today_utc = await db.shows.find(
        {"date": today_utc, "team_id": team_id},
        {"_id": 0, "id": 1, "title": 1, "date": 1, "start_time": 1, "end_time": 1, "status": 1, "rds_station": 1}
    ).to_list(50) if today_utc != today_cet else []
    
    # Check which shows would be considered "live" right now
    current_time_cet = now_cet.strftime('%H:%M')
    current_time_utc = now_utc.strftime('%H:%M')
    
    live_shows_cet = [
        s for s in shows_today_cet 
        if s.get('start_time', '99:99') <= current_time_cet <= s.get('end_time', '00:00')
        and s.get('status') == 'scheduled'
    ]
    
    # Check cached rundown
    cached = await db.rds_cached_rundowns.find_one(
        {"team_id": team_id},
        {"_id": 0}
    )
    
    return {
        "debug_info": {
            "current_time_utc": now_utc.isoformat(),
            "current_time_cet": now_cet.isoformat(),
            "current_time_cet_formatted": current_time_cet,
            "today_date_cet": today_cet,
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


@rds_router.get("/mfy/now-playing")
async def get_mfy_now_playing():
    """Public endpoint: Get the current now playing info from MFY Shoutcast (cached, 10s interval)."""
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
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
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
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
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

@rds_router.get("/{station}/image")
async def get_station_show_image(station: str):
    """Public endpoint: Get the current show image URL for a station.
    
    Returns the S3 URL or local URL of the current live show's image.
    If no show is active, returns the default station image (if configured).
    
    URL format: /api/rds/{station}/image
    Example: /api/rds/grk/image
    
    Returns JSON with image URL for programmatic access.
    """
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    # Get the current live show for this station
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": [station, "both"]}},
        {"_id": 0, "show_title": 1, "show_image": 1}
    )
    
    image_data = None
    show_title = None
    
    if cached:
        show_title = cached.get("show_title")
        image_data = cached.get("show_image")
    
    # If no image in cached rundown, try to get from show_titles
    if not image_data and show_title:
        title_doc = await db.show_titles.find_one(
            {"name": show_title},
            {"_id": 0, "image": 1}
        )
        if title_doc:
            image_data = title_doc.get("image")
    
    if image_data:
        # Return the S3 URL if available, otherwise construct local URL
        image_url = image_data.get("s3_url")
        if not image_url:
            # Construct local URL
            file_key = image_data.get("file_key", "")
            image_url = f"/uploads/show_title_images/{file_key}"
        
        return {
            "station": station,
            "show_title": show_title,
            "has_image": True,
            "image_url": image_url,
            "mime_type": image_data.get("mime_type", "image/jpeg"),
            "filename": image_data.get("filename")
        }
    
    return {
        "station": station,
        "show_title": show_title,
        "has_image": False,
        "image_url": None,
        "message": "No image available for current show"
    }


@rds_router.get("/{station}/image.jpg")
async def get_station_show_image_redirect(station: str):
    """Public endpoint: Redirect to the actual image file.
    
    This endpoint is useful for MagicRDS and other systems that expect
    a direct image URL. It redirects to the actual S3 or local image.
    
    URL format: /api/rds/{station}/image.jpg
    Example: /api/rds/grk/image.jpg
    
    Returns: 302 redirect to actual image, or 404 if no image available.
    """
    from fastapi.responses import RedirectResponse
    
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=404, detail="Station not found")
    
    # Get the current live show for this station
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": [station, "both"]}},
        {"_id": 0, "show_title": 1, "show_image": 1}
    )
    
    image_data = None
    show_title = None
    
    if cached:
        show_title = cached.get("show_title")
        image_data = cached.get("show_image")
    
    # If no image in cached rundown, try to get from show_titles
    if not image_data and show_title:
        title_doc = await db.show_titles.find_one(
            {"name": show_title},
            {"_id": 0, "image": 1}
        )
        if title_doc:
            image_data = title_doc.get("image")
    
    if image_data:
        image_url = image_data.get("s3_url")
        if image_url:
            return RedirectResponse(url=image_url, status_code=302)
        else:
            # Local file - redirect to static file serving
            file_key = image_data.get("file_key", "")
            return RedirectResponse(url=f"/uploads/show_title_images/{file_key}", status_code=302)
    
    raise HTTPException(status_code=404, detail="No image available for current show")


@rds_router.get("/{station}/image-url.txt")
async def get_station_show_image_url_txt(station: str):
    """Public endpoint: Get just the image URL as plain text.
    
    This is useful for systems that need to read a URL from a text file.
    
    URL format: /api/rds/{station}/image-url.txt
    Example: /api/rds/grk/image-url.txt
    
    Returns: Plain text with the image URL, or empty if no image.
    """
    from fastapi.responses import PlainTextResponse
    
    if station not in ["mfy", "grk"]:
        return PlainTextResponse(content="", media_type="text/plain")
    
    # Get the current live show for this station
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": [station, "both"]}},
        {"_id": 0, "show_title": 1, "show_image": 1}
    )
    
    image_data = None
    show_title = None
    
    if cached:
        show_title = cached.get("show_title")
        image_data = cached.get("show_image")
    
    # If no image in cached rundown, try to get from show_titles
    if not image_data and show_title:
        title_doc = await db.show_titles.find_one(
            {"name": show_title},
            {"_id": 0, "image": 1}
        )
        if title_doc:
            image_data = title_doc.get("image")
    
    if image_data:
        image_url = image_data.get("s3_url")
        if not image_url:
            file_key = image_data.get("file_key", "")
            # Return full URL for MagicRDS
            image_url = f"https://clara.koodh.com/uploads/show_title_images/{file_key}"
        return PlainTextResponse(content=image_url, media_type="text/plain")
    
    return PlainTextResponse(content="", media_type="text/plain")

@rds_router.get("/shoutcast/logs")
async def get_shoutcast_logs(
    station: Optional[str] = None,
    limit: int = 100,
    current_user: dict = Depends(require_admin)
):
    """Get recent Shoutcast now playing logs."""
    query = {}
    if station:
        if station not in ["mfy", "grk"]:
            raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
        query["station"] = station
    
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
        if station not in ["mfy", "grk"]:
            raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
        query["station"] = station
    
    result = await db.shoutcast_logs.delete_many(query)
    
    return {
        "status": "success",
        "message": f"Deleted {result.deleted_count} log entries"
    }
