"""Video Endpoints router.

Manages a reusable library of video resources (embeds + uploaded ads) per
team / main site. Exposes:

  * ``GET    /api/videos``                — list (filterable by ?type=)
  * ``GET    /api/videos/{id}``           — single, authenticated
  * ``POST   /api/videos``                — create from URL/embed code
  * ``PUT    /api/videos/{id}``           — update fields
  * ``DELETE /api/videos/{id}``           — delete (also nukes S3 object)
  * ``POST   /api/videos/upload``         — upload an mp4/webm to S3 (ads)

Auth: any editor or admin can manage video endpoints (group ``a`` per UX
spec). For the public-facing read of a single endpoint we mirror the
``news_public`` pattern with ``/api/videos/public/{id}``.
"""
from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, Query

from database import db
from models.video_endpoints import (
    VideoEndpointCreate,
    VideoEndpointUpdate,
    VideoEndpointResponse,
)
from services.video_embed import serialize_video
from services.auth import require_editor_or_admin
from services.s3_storage import upload_file_to_s3, delete_file_from_s3, is_s3_configured
from services.main_site_context import get_main_site_id_from_header


video_router = APIRouter(prefix="/videos", tags=["Video Endpoints"])

# Reasonable cap for ad/preroll videos — S3 cost + UX (don't make editors
# wait minutes for a 2GB upload). We don't enforce a hard duration limit
# server-side because that requires probing the file.
MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB

ALLOWED_VIDEO_CONTENT_TYPES = {
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-m4v",
    "video/ogg",
}


def _build_scope_query(current_user: dict, main_site_id: Optional[str]) -> dict:
    """A user sees videos for the active main site (or their team if no
    main-site context). System/Network admins see everything."""
    role = (current_user.get("role") or "").lower()
    if role in ("system_admin", "system administrator", "network_admin", "network administrator"):
        if main_site_id:
            return {"main_site_id": main_site_id}
        return {}
    q: dict = {}
    if main_site_id:
        q["main_site_id"] = main_site_id
    elif current_user.get("team_id"):
        q["team_id"] = current_user["team_id"]
    return q


@video_router.get("", response_model=List[VideoEndpointResponse])
async def list_video_endpoints(
    request: Request,
    type: Optional[str] = Query(None, description="Filter by video type (show/ad/promo/other)"),
    current_user: dict = Depends(require_editor_or_admin),
):
    main_site_id = await get_main_site_id_from_header(request)
    q = _build_scope_query(current_user, main_site_id)
    if type:
        q["type"] = type
    cur = db.video_endpoints.find(q).sort("created_at", -1)
    items = [serialize_video(d) async for d in cur]
    return items


@video_router.get("/{video_id}", response_model=VideoEndpointResponse)
async def get_video_endpoint(
    video_id: str,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin),
):
    main_site_id = await get_main_site_id_from_header(request)
    q = _build_scope_query(current_user, main_site_id)
    q["id"] = video_id
    item = await db.video_endpoints.find_one(q)
    if not item:
        raise HTTPException(status_code=404, detail="Video endpoint not found")
    return serialize_video(item)


@video_router.post("", response_model=VideoEndpointResponse, status_code=201)
async def create_video_endpoint(
    payload: VideoEndpointCreate,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin),
):
    if not (payload.embed_code or payload.uploaded_url):
        raise HTTPException(
            status_code=400,
            detail="Provide either an embed_code (URL / iframe) or upload a file first.",
        )

    main_site_id = await get_main_site_id_from_header(request)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid4()),
        "name": payload.name.strip(),
        "description": (payload.description or "").strip(),
        "type": payload.type,
        "embed_code": (payload.embed_code or "").strip() or None,
        "uploaded_url": (payload.uploaded_url or "").strip() or None,
        "uploaded_key": (payload.uploaded_key or "").strip() or None,
        "poster_url": (payload.poster_url or "").strip() or None,
        "tags": payload.tags or [],
        "main_site_id": main_site_id,
        "team_id": current_user.get("team_id"),
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id"),
    }
    await db.video_endpoints.insert_one(doc)
    return serialize_video(doc)


@video_router.put("/{video_id}", response_model=VideoEndpointResponse)
async def update_video_endpoint(
    video_id: str,
    payload: VideoEndpointUpdate,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin),
):
    main_site_id = await get_main_site_id_from_header(request)
    q = _build_scope_query(current_user, main_site_id)
    q["id"] = video_id
    existing = await db.video_endpoints.find_one(q)
    if not existing:
        raise HTTPException(status_code=404, detail="Video endpoint not found")

    updates = payload.model_dump(exclude_unset=True)
    # Strip whitespace on string fields
    for k in ("name", "description", "embed_code", "uploaded_url", "uploaded_key", "poster_url"):
        if k in updates and isinstance(updates[k], str):
            updates[k] = updates[k].strip() or None
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.video_endpoints.update_one({"id": video_id}, {"$set": updates})
    refreshed = await db.video_endpoints.find_one({"id": video_id})
    return serialize_video(refreshed)


@video_router.delete("/{video_id}", status_code=204)
async def delete_video_endpoint(
    video_id: str,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin),
):
    main_site_id = await get_main_site_id_from_header(request)
    q = _build_scope_query(current_user, main_site_id)
    q["id"] = video_id
    existing = await db.video_endpoints.find_one(q)
    if not existing:
        raise HTTPException(status_code=404, detail="Video endpoint not found")
    # Clean up the S3 object if this was an uploaded ad
    key = existing.get("uploaded_key")
    if key:
        try:
            await delete_file_from_s3(key)
        except Exception:  # noqa: BLE001 — best-effort cleanup
            pass
    # Clear references on shows that pointed to this endpoint
    await db.shows.update_many(
        {"video_endpoint_id": video_id},
        {"$set": {"video_endpoint_id": None}},
    )
    await db.video_endpoints.delete_one({"id": video_id})
    return None


@video_router.post("/upload")
async def upload_video_file(
    request: Request,
    file: UploadFile = File(...),
    poster_url: Optional[str] = Form(None),
    current_user: dict = Depends(require_editor_or_admin),
):
    """Upload an ad / promo video to S3 and return its public URL.

    The frontend then POSTs to ``/api/videos`` with this URL set as
    ``uploaded_url`` (so the editor can name it & pick a type).
    """
    if not is_s3_configured():
        raise HTTPException(status_code=503, detail="S3 storage is not configured.")

    if file.content_type not in ALLOWED_VIDEO_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video type: {file.content_type}. Use mp4, webm, mov, m4v or ogg.",
        )

    main_site_id = await get_main_site_id_from_header(request)
    # Same S3 fallback chain as content uploads — avoids /None/ paths.
    scope = (
        main_site_id
        or current_user.get("team_id")
        or "shared"
    )

    body = await file.read()
    if len(body) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {MAX_UPLOAD_BYTES // (1024*1024)} MB.",
        )

    ext = (file.filename or "video.mp4").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "mp4"
    key = f"videos/{scope}/{uuid4()}.{ext}"
    result = await upload_file_to_s3(
        file_content=body,
        file_key=key,
        content_type=file.content_type,
        main_site_id=main_site_id,
        user_id=current_user.get("id"),
        user_name=current_user.get("name"),
    )
    return {
        "url": result["url"],
        "key": result["key"],
        "content_type": file.content_type,
        "size": len(body),
        "poster_url": (poster_url or "").strip() or None,
    }


# ── Public read endpoint ─────────────────────────────────────────────────
public_video_router = APIRouter(prefix="/videos/public", tags=["Video Endpoints (public)"])


@public_video_router.get("/{video_id}")
async def public_video_endpoint(video_id: str):
    """Anonymous read — used by the public consumer sites to embed a video."""
    item = await db.video_endpoints.find_one({"id": video_id})
    if not item:
        raise HTTPException(status_code=404, detail="Video endpoint not found")
    out = serialize_video(item)
    # Strip internal scoping fields
    for k in ("team_id", "main_site_id", "created_by", "uploaded_key"):
        out.pop(k, None)
    return out
