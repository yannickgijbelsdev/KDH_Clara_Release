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
    rpid: Optional[str] = None
    country_code: Optional[str] = "056"
    ingest_base_url: Optional[str] = "https://core-ingest.radioplayer.cloud"
    auto_np: bool = True
    auto_schedule: bool = True


@radioplayer_router.get("/config")
async def get_config(current_user: dict = Depends(require_admin)):
    """Get Radioplayer configuration."""
    config = await get_radioplayer_config()
    # Mask the password
    if config.get("password"):
        config["password_set"] = True
        config["password"] = "***"
    else:
        config["password_set"] = False
    return config


@radioplayer_router.put("/config")
async def update_config(data: RadioplayerConfigUpdate, current_user: dict = Depends(require_admin)):
    """Update Radioplayer configuration."""
    update_data = data.dict()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = current_user.get("email", "")

    # Don't overwrite password if masked
    if data.password == "***":
        existing = await get_radioplayer_config()
        update_data["password"] = existing.get("password", "")

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
