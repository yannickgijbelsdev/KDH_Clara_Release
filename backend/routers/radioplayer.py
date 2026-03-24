"""Radioplayer configuration and status endpoints."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from database import db
from services.auth import require_admin
from services.radioplayer import (
    push_now_playing,
    auto_push_schedule_for_grk,
    get_radioplayer_config,
)

radioplayer_router = APIRouter(prefix="/radioplayer", tags=["Radioplayer"])


class RadioplayerConfigUpdate(BaseModel):
    enabled: bool = False
    username: Optional[str] = None
    password: Optional[str] = None
    api_key: Optional[str] = None
    rpid: Optional[str] = None
    station_name: Optional[str] = None
    country_code: Optional[str] = "056"
    ingest_base_url: Optional[str] = "https://core-ingest.radioplayer.cloud"
    auto_np: bool = True
    auto_schedule: bool = True


@radioplayer_router.get("/config")
async def get_config(current_user: dict = Depends(require_admin)):
    """Get Radioplayer configuration."""
    config = await get_radioplayer_config()
    # Mask sensitive fields
    if config.get("password"):
        config["password_set"] = True
        config["password"] = "***"
    else:
        config["password_set"] = False
    if config.get("api_key"):
        config["api_key_set"] = True
        config["api_key"] = f"...{config['api_key'][-8:]}"
    else:
        config["api_key_set"] = False
    return config


@radioplayer_router.put("/config")
async def update_config(data: RadioplayerConfigUpdate, current_user: dict = Depends(require_admin)):
    """Update Radioplayer configuration."""
    update_data = data.dict()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = current_user.get("email", "")

    existing = await get_radioplayer_config()

    # Don't overwrite password if masked
    if data.password == "***":
        update_data["password"] = existing.get("password", "")

    # Don't overwrite api_key if masked
    if data.api_key and data.api_key.startswith("..."):
        update_data["api_key"] = existing.get("api_key", "")

    await db.radioplayer_config.update_one(
        {},
        {"$set": update_data},
        upsert=True,
    )
    return {"status": "ok", "message": "Configuration updated"}


@radioplayer_router.get("/push-log")
async def get_push_log(limit: int = 50, current_user: dict = Depends(require_admin)):
    """Get recent Radioplayer push log entries."""
    logs = await db.radioplayer_push_log.find(
        {},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(limit)
    return {"logs": logs, "total": len(logs)}


@radioplayer_router.post("/push-now-playing")
async def manual_push_np(current_user: dict = Depends(require_admin)):
    """Manually push current now playing to Radioplayer."""
    cached = await db.shoutcast_cache.find_one({"station": "grk"}, {"_id": 0})
    if not cached or not cached.get("song_title"):
        return {"status": "error", "message": "No current song data for GRK"}

    song = cached.get("original_song_title") or cached.get("song_title", "")
    artist = ""
    title = song
    if " - " in song:
        parts = song.split(" - ", 1)
        artist = parts[0].strip()
        title = parts[1].strip()

    await push_now_playing(artist, title)
    return {"status": "ok", "message": f"Pushed: {artist} - {title}" if artist else f"Pushed: {title}"}


@radioplayer_router.post("/push-schedule")
async def manual_push_schedule(current_user: dict = Depends(require_admin)):
    """Manually push upcoming schedule to Radioplayer."""
    await auto_push_schedule_for_grk()
    return {"status": "ok", "message": "Schedule push triggered"}


@radioplayer_router.get("/test-connection")
async def test_connection(current_user: dict = Depends(require_admin)):
    """Test the Radioplayer API connection by attempting a small authenticated request."""
    import httpx

    config = await get_radioplayer_config()
    if not config:
        return {"status": "error", "message": "No configuration found", "suggestion": "Enter your API credentials in Step 1."}

    api_key = config.get("api_key", "")
    username = config.get("username", "")
    password = config.get("password", "")

    if not api_key and (not username or not password):
        return {"status": "error", "message": "No API credentials configured", "suggestion": "Enter your API Key or username/password in the API Credentials step."}

    rpid = config.get("rpid", "")
    if not rpid:
        return {"status": "error", "message": "No RPUID configured", "suggestion": "Enter your station RPUID in the Station Info step."}

    base = config.get("ingest_base_url", "https://core-ingest.radioplayer.cloud").rstrip("/")
    country_code = config.get("country_code", "056")
    test_url = f"{base}/latest/{country_code}/v1/nowplaying/{rpid}"

    try:
        headers = {"Content-Type": "text/xml;charset=UTF-8"}
        auth = None
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        else:
            auth = (username, password)

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(test_url, headers=headers, auth=auth)
            if resp.status_code in (200, 201, 204, 405):
                return {"status": "ok", "message": f"Connection successful (HTTP {resp.status_code})", "endpoint": test_url}
            elif resp.status_code == 401:
                return {"status": "error", "message": "Authentication failed (401 Unauthorized)", "suggestion": "Check your API Key or username/password. Ensure they match your radioplayer.org account."}
            elif resp.status_code == 403:
                return {"status": "error", "message": "Access denied (403 Forbidden)", "suggestion": "Your credentials are valid but lack permission. Contact Radioplayer support to verify your account access."}
            elif resp.status_code == 404:
                return {"status": "error", "message": f"Endpoint not found (404). RPUID '{rpid}' may be incorrect.", "suggestion": "Verify your RPUID on the Radioplayer portal. Make sure the station ID is correct."}
            else:
                return {"status": "warning", "message": f"Unexpected response (HTTP {resp.status_code})", "suggestion": f"The server responded with status {resp.status_code}. This may be temporary. Try again later."}
    except httpx.ConnectError:
        return {"status": "error", "message": "Cannot reach Radioplayer servers", "suggestion": f"Failed to connect to {base}. Check your internet connection or verify the Ingest Base URL."}
    except httpx.TimeoutException:
        return {"status": "error", "message": "Connection timed out", "suggestion": "Radioplayer servers are slow to respond. Try again later."}
    except Exception as e:
        return {"status": "error", "message": f"Connection test failed: {str(e)}", "suggestion": "An unexpected error occurred. Check your configuration and try again."}

