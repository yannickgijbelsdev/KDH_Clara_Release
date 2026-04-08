"""Radio Automation API — Track library, playlists, and playout management."""
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import Optional
from database import db
from services.auth import get_current_user, require_editor_or_admin
from services.main_site_context import get_main_site_id_from_header

logger = logging.getLogger(__name__)
radio_router = APIRouter(prefix="/radio-automation", tags=["Radio Automation"])


# ─── Models ───

class TrackCreate(BaseModel):
    title: str
    artist: str = ""
    duration: float = 0
    genre: str = ""
    bpm: Optional[int] = None
    file_url: Optional[str] = None
    cue_points: dict = Field(default_factory=dict)

class TrackUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    genre: Optional[str] = None
    bpm: Optional[int] = None
    cue_points: Optional[dict] = None

class PlaylistCreate(BaseModel):
    name: str
    track_ids: list[str] = Field(default_factory=list)

class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    track_ids: Optional[list[str]] = None
    is_active: Optional[bool] = None


# ─── Helpers ───

async def resolve_site(request: Request, current_user: dict) -> str:
    """Get the main_site_id for the current request context."""
    main_site_id = await get_main_site_id_from_header(request)
    return main_site_id or current_user.get("team_id", "")


# ─── Track Library ───

@radio_router.get("/tracks")
async def list_tracks(
    request: Request,
    search: str = "",
    genre: str = "",
    current_user: dict = Depends(get_current_user)
):
    """List all tracks in the radio automation library."""
    site_id = await resolve_site(request, current_user)
    query = {"site_id": site_id}
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"artist": {"$regex": search, "$options": "i"}},
        ]
    if genre:
        query["genre"] = genre

    tracks = await db.radio_tracks.find(query, {"_id": 0}).sort("title", 1).to_list(500)
    return {"tracks": tracks, "total": len(tracks)}


@radio_router.post("/tracks")
async def create_track(
    body: TrackCreate,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Add a new track to the library."""
    site_id = await resolve_site(request, current_user)
    track = {
        "id": str(uuid.uuid4()),
        "site_id": site_id,
        "title": body.title,
        "artist": body.artist,
        "duration": body.duration,
        "genre": body.genre,
        "bpm": body.bpm,
        "file_url": body.file_url,
        "cue_points": body.cue_points,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"],
    }
    await db.radio_tracks.insert_one(track)
    track.pop("_id", None)
    return track


@radio_router.patch("/tracks/{track_id}")
async def update_track(
    track_id: str,
    body: TrackUpdate,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Update track metadata or cue points."""
    site_id = await resolve_site(request, current_user)
    updates = {k: v for k, v in body.dict(exclude_none=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.radio_tracks.update_one(
        {"id": track_id, "site_id": site_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Track not found")
    return {"updated": True}


@radio_router.delete("/tracks/{track_id}")
async def delete_track(
    track_id: str,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Delete a track from the library."""
    site_id = await resolve_site(request, current_user)
    result = await db.radio_tracks.delete_one({"id": track_id, "site_id": site_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Track not found")
    return {"deleted": True}


# ─── Playlists ───

@radio_router.get("/playlists")
async def list_playlists(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """List all playlists."""
    site_id = await resolve_site(request, current_user)
    playlists = await db.radio_playlists.find(
        {"site_id": site_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"playlists": playlists}


@radio_router.post("/playlists")
async def create_playlist(
    body: PlaylistCreate,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Create a new playlist."""
    site_id = await resolve_site(request, current_user)
    playlist = {
        "id": str(uuid.uuid4()),
        "site_id": site_id,
        "name": body.name,
        "track_ids": body.track_ids,
        "is_active": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"],
    }
    await db.radio_playlists.insert_one(playlist)
    playlist.pop("_id", None)
    return playlist


@radio_router.get("/playlist/active")
async def get_active_playlist(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Get the currently active playlist with full track data."""
    site_id = await resolve_site(request, current_user)
    playlist = await db.radio_playlists.find_one(
        {"site_id": site_id, "is_active": True}, {"_id": 0}
    )
    if not playlist:
        return {"tracks": [], "playlist": None}

    # Resolve track_ids to full track objects
    tracks = []
    if playlist.get("track_ids"):
        track_docs = await db.radio_tracks.find(
            {"id": {"$in": playlist["track_ids"]}, "site_id": site_id}, {"_id": 0}
        ).to_list(500)
        track_map = {t["id"]: t for t in track_docs}
        tracks = [track_map[tid] for tid in playlist["track_ids"] if tid in track_map]

    return {"tracks": tracks, "playlist": playlist}


@radio_router.patch("/playlists/{playlist_id}")
async def update_playlist(
    playlist_id: str,
    body: PlaylistUpdate,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Update a playlist."""
    site_id = await resolve_site(request, current_user)
    updates = {k: v for k, v in body.dict(exclude_none=True).items()}

    if body.is_active:
        # Deactivate all other playlists first
        await db.radio_playlists.update_many(
            {"site_id": site_id}, {"$set": {"is_active": False}}
        )

    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = await db.radio_playlists.update_one(
            {"id": playlist_id, "site_id": site_id},
            {"$set": updates}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Playlist not found")

    return {"updated": True}


@radio_router.delete("/playlists/{playlist_id}")
async def delete_playlist(
    playlist_id: str,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Delete a playlist."""
    site_id = await resolve_site(request, current_user)
    result = await db.radio_playlists.delete_one({"id": playlist_id, "site_id": site_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return {"deleted": True}
