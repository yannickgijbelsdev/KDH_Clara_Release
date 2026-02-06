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
            {
                "name": "Live Show Title",
                "description": "Geeft de titel van de huidige live show terug (plain text)",
                "path": "/api/rds/live",
                "full_url": f"{base_url}/api/rds/live",
                "method": "GET",
                "auth_required": False,
                "response_type": "text/plain"
            },
            {
                "name": "Live Show Title (.txt)",
                "description": "Zelfde als hierboven maar met .txt extensie",
                "path": "/api/rds/live.txt",
                "full_url": f"{base_url}/api/rds/live.txt",
                "method": "GET",
                "auth_required": False,
                "response_type": "text/plain"
            },
            {
                "name": "Cached Live Rundown (JSON)",
                "description": "Gecachte JSON rundown van de huidige live show (vernieuwt elke 5 min)",
                "path": "/api/rds/cached-rundown",
                "full_url": f"{base_url}/api/rds/cached-rundown",
                "method": "GET",
                "auth_required": False,
                "response_type": "application/json"
            },
            {
                "name": "Show Rundown by ID",
                "description": "JSON rundown voor een specifieke show",
                "path": "/api/shows/{show_id}/rundown",
                "full_url": f"{base_url}/api/shows/{{show_id}}/rundown",
                "method": "GET",
                "auth_required": True,
                "response_type": "application/json"
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
    Returns empty string if no live show is currently running.
    """
    from fastapi.responses import PlainTextResponse
    
    # Get the most recent cached rundown
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True},
        {"_id": 0, "show_title": 1}
    )
    
    if cached and cached.get("show_title"):
        return PlainTextResponse(content=cached.get("show_title"), media_type="text/plain")
    
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

@rds_router.get("/mfy/live")
async def get_mfy_live_show_title():
    """Public endpoint: Get the title of the current MFY live show as plain text."""
    from fastapi.responses import PlainTextResponse
    
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": ["mfy", "both"]}},
        {"_id": 0, "show_title": 1}
    )
    
    if cached and cached.get("show_title"):
        return PlainTextResponse(content=cached.get("show_title"), media_type="text/plain")
    
    return PlainTextResponse(content="", media_type="text/plain")


@rds_router.get("/mfy/live.txt")
async def get_mfy_live_show_title_txt():
    """Public endpoint: Same as /mfy/live but with .txt extension."""
    from fastapi.responses import PlainTextResponse
    
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": ["mfy", "both"]}},
        {"_id": 0, "show_title": 1}
    )
    
    if cached and cached.get("show_title"):
        return PlainTextResponse(content=cached.get("show_title"), media_type="text/plain")
    
    return PlainTextResponse(content="", media_type="text/plain")


@rds_router.get("/grk/live")
async def get_grk_live_show_title():
    """Public endpoint: Get the title of the current GRK live show as plain text."""
    from fastapi.responses import PlainTextResponse
    
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": ["grk", "both"]}},
        {"_id": 0, "show_title": 1}
    )
    
    if cached and cached.get("show_title"):
        return PlainTextResponse(content=cached.get("show_title"), media_type="text/plain")
    
    return PlainTextResponse(content="", media_type="text/plain")


@rds_router.get("/grk/live.txt")
async def get_grk_live_show_title_txt():
    """Public endpoint: Same as /grk/live but with .txt extension."""
    from fastapi.responses import PlainTextResponse
    
    cached = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": ["grk", "both"]}},
        {"_id": 0, "show_title": 1}
    )
    
    if cached and cached.get("show_title"):
        return PlainTextResponse(content=cached.get("show_title"), media_type="text/plain")
    
    return PlainTextResponse(content="", media_type="text/plain")


@rds_router.get("/mfy/now-playing")
async def get_mfy_now_playing():
    """Public endpoint: Get the current now playing info from MFY Shoutcast."""
    from services.shoutcast import get_now_playing
    return await get_now_playing("mfy")


@rds_router.get("/mfy/now-playing.txt")
async def get_mfy_now_playing_txt():
    """Public endpoint: Get just the song title from MFY Shoutcast as plain text."""
    from fastapi.responses import PlainTextResponse
    from services.shoutcast import get_now_playing
    
    data = await get_now_playing("mfy")
    return PlainTextResponse(content=data.get("song_title", ""), media_type="text/plain")


@rds_router.get("/grk/now-playing")
async def get_grk_now_playing():
    """Public endpoint: Get the current now playing info from GRK Shoutcast."""
    from services.shoutcast import get_now_playing
    return await get_now_playing("grk")


@rds_router.get("/grk/now-playing.txt")
async def get_grk_now_playing_txt():
    """Public endpoint: Get just the song title from GRK Shoutcast as plain text."""
    from fastapi.responses import PlainTextResponse
    from services.shoutcast import get_now_playing
    
    data = await get_now_playing("grk")
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
