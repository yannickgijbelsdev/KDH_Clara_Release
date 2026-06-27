"""Liveblog router — per-article timeline entries with WebSocket fan-out.

CRUD + S3 upload + publish toggle for entries on a content_item with
``is_liveblog: true``. All mutations broadcast over the
``liveblog:{content_id}`` room so multiple editors stay in sync.
"""
from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File

from database import db
from services.auth import require_editor_or_admin
from services.main_site_context import get_main_site_id_from_header
from services.s3_storage import upload_file_to_s3, is_s3_configured
from services.websocket import ws_manager
from models.liveblog import (
    LiveblogEntryCreate,
    LiveblogEntryUpdate,
    LiveblogEntryResponse,
    serialize_entry,
)


liveblog_router = APIRouter(prefix="/content", tags=["Liveblog"])

MAX_IMAGE_BYTES = 20 * 1024 * 1024     # 20 MB per photo
MAX_VIDEO_BYTES = 500 * 1024 * 1024    # 500 MB per video

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"}
ALLOWED_VIDEO_TYPES = {
    "video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/ogg",
}


async def _load_article(content_id: str, request: Request, current_user: dict) -> dict:
    main_site_id = await get_main_site_id_from_header(request)
    q = {"id": content_id}
    if main_site_id:
        q["main_site_id"] = main_site_id
    elif current_user.get("team_id"):
        q["team_id"] = current_user.get("team_id")
    item = await db.content_items.find_one(q)
    if not item:
        # Fall back to lookup without scope filter — covers legacy items
        # that pre-date the main_site_id column on content_items.
        item = await db.content_items.find_one({"id": content_id})
        if not item:
            raise HTTPException(status_code=404, detail="Article not found")
    return item


def _entry_image_missing(entry: dict) -> bool:
    for img in (entry.get("images") or []):
        if not (img.get("credit") or "").strip():
            return True
    return False


async def _touch_article_activity(content_id: str):
    """Mark the article as having recent liveblog activity so the
    12-hour auto-archive job (in ``news_public``) doesn't flip
    ``is_liveblog`` to false while editors are still posting."""
    try:
        await db.content_items.update_one(
            {"id": content_id},
            {"$set": {"liveblog_last_activity_at": datetime.now(timezone.utc).isoformat()}},
        )
    except Exception:
        pass


async def _broadcast(content_id: str, event: str, payload: dict):
    """Fan out an entry event to every editor connected to this article."""
    try:
        await ws_manager.broadcast(f"liveblog:{content_id}", {
            "type": event,
            "content_id": content_id,
            **payload,
        })
    except Exception:
        pass  # broadcast failure must never break the API call


# ── Manually end the liveblog ────────────────────────────────────────────
@liveblog_router.post("/{content_id}/liveblog/end")
async def end_liveblog(
    content_id: str,
    request: Request,
    delete_entries: bool = False,
    current_user: dict = Depends(require_editor_or_admin),
):
    """Editor manually ends the liveblog. Two modes:

    * ``delete_entries=false`` (default) — same as auto-archive after 6h:
      ``is_liveblog`` flips to false, the entries stay so the article
      keeps showing them as a static timeline.
    * ``delete_entries=true`` — wipes every liveblog entry for this article.
      Use when the editor wants a clean slate (e.g. test posts).
    """
    await _load_article(content_id, request, current_user)
    now = datetime.now(timezone.utc).isoformat()
    await db.content_items.update_one(
        {"id": content_id},
        {"$set": {"is_liveblog": False, "liveblog_ended_at": now}},
    )
    deleted = 0
    if delete_entries:
        res = await db.liveblog_entries.delete_many({"content_id": content_id})
        deleted = res.deleted_count
    await _broadcast(content_id, "liveblog_ended", {"deleted_entries": deleted})
    return {"is_liveblog": False, "liveblog_ended_at": now, "deleted_entries": deleted}


# ── Entry CRUD ───────────────────────────────────────────────────────────
@liveblog_router.get("/{content_id}/liveblog/entries", response_model=List[LiveblogEntryResponse])
async def list_entries(
    content_id: str,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin),
):
    await _load_article(content_id, request, current_user)
    cur = db.liveblog_entries.find({"content_id": content_id}).sort("timestamp", -1)
    return [serialize_entry(d) async for d in cur]


@liveblog_router.post("/{content_id}/liveblog/entries", response_model=LiveblogEntryResponse, status_code=201)
async def create_entry(
    content_id: str,
    payload: LiveblogEntryCreate,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin),
):
    await _load_article(content_id, request, current_user)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid4()),
        "content_id": content_id,
        "title": (payload.title or "").strip(),
        "body": payload.body or "",
        "timestamp": payload.timestamp or now,
        "images": [i.model_dump() for i in (payload.images or [])],
        "videos": [v.model_dump() for v in (payload.videos or [])],
        "published": False,
        "published_at": None,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name"),
    }
    await db.liveblog_entries.insert_one(doc)
    await _touch_article_activity(content_id)
    out = serialize_entry(doc)
    await _broadcast(content_id, "entry_created", {"entry": out})
    return out


@liveblog_router.put("/{content_id}/liveblog/entries/{entry_id}", response_model=LiveblogEntryResponse)
async def update_entry(
    content_id: str,
    entry_id: str,
    payload: LiveblogEntryUpdate,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin),
):
    await _load_article(content_id, request, current_user)
    existing = await db.liveblog_entries.find_one({"id": entry_id, "content_id": content_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Entry not found")

    updates = payload.model_dump(exclude_unset=True)
    if "title" in updates:
        updates["title"] = (updates["title"] or "").strip()
    if "images" in updates:
        updates["images"] = [i.model_dump() if hasattr(i, "model_dump") else i for i in (updates["images"] or [])]
    if "videos" in updates:
        updates["videos"] = [v.model_dump() if hasattr(v, "model_dump") else v for v in (updates["videos"] or [])]
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.liveblog_entries.update_one({"id": entry_id}, {"$set": updates})

    refreshed = await db.liveblog_entries.find_one({"id": entry_id})
    await _touch_article_activity(content_id)
    out = serialize_entry(refreshed)
    await _broadcast(content_id, "entry_updated", {"entry": out})
    return out


@liveblog_router.delete("/{content_id}/liveblog/entries/{entry_id}", status_code=204)
async def delete_entry(
    content_id: str,
    entry_id: str,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin),
):
    await _load_article(content_id, request, current_user)
    existing = await db.liveblog_entries.find_one({"id": entry_id, "content_id": content_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.liveblog_entries.delete_one({"id": entry_id})
    await _broadcast(content_id, "entry_deleted", {"entry_id": entry_id})
    return None


# ── Publish toggle ───────────────────────────────────────────────────────
@liveblog_router.post("/{content_id}/liveblog/entries/{entry_id}/publish", response_model=LiveblogEntryResponse)
async def publish_entry(
    content_id: str,
    entry_id: str,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin),
):
    await _load_article(content_id, request, current_user)
    entry = await db.liveblog_entries.find_one({"id": entry_id, "content_id": content_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if _entry_image_missing(entry):
        raise HTTPException(
            status_code=409,
            detail="One or more images in this entry are missing rights "
                   "(source / photographer / license). Fill them in before publishing.",
        )
    now = datetime.now(timezone.utc).isoformat()
    await db.liveblog_entries.update_one(
        {"id": entry_id},
        {"$set": {"published": True, "published_at": now, "updated_at": now}},
    )
    refreshed = await db.liveblog_entries.find_one({"id": entry_id})
    await _touch_article_activity(content_id)
    out = serialize_entry(refreshed)
    await _broadcast(content_id, "entry_published", {"entry": out})
    return out


@liveblog_router.post("/{content_id}/liveblog/entries/{entry_id}/unpublish", response_model=LiveblogEntryResponse)
async def unpublish_entry(
    content_id: str,
    entry_id: str,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin),
):
    await _load_article(content_id, request, current_user)
    now = datetime.now(timezone.utc).isoformat()
    await db.liveblog_entries.update_one(
        {"id": entry_id, "content_id": content_id},
        {"$set": {"published": False, "updated_at": now}},
    )
    refreshed = await db.liveblog_entries.find_one({"id": entry_id})
    if not refreshed:
        raise HTTPException(status_code=404, detail="Entry not found")
    out = serialize_entry(refreshed)
    await _broadcast(content_id, "entry_unpublished", {"entry": out})
    return out


# ── Media uploads ────────────────────────────────────────────────────────
@liveblog_router.post("/{content_id}/liveblog/upload-image")
async def upload_entry_image(
    content_id: str,
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_editor_or_admin),
):
    if not is_s3_configured():
        raise HTTPException(status_code=503, detail="S3 storage is not configured.")
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {file.content_type}")

    article = await _load_article(content_id, request, current_user)
    body = await file.read()
    if len(body) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail=f"Image too large. Max {MAX_IMAGE_BYTES // (1024*1024)} MB.")

    scope = (
        article.get("main_site_id")
        or current_user.get("team_id")
        or "shared"
    )
    ext = (file.filename or "img.jpg").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    key = f"liveblog/{scope}/{content_id}/{uuid4()}.{ext}"
    res = await upload_file_to_s3(
        file_content=body,
        file_key=key,
        content_type=file.content_type,
        main_site_id=article.get("main_site_id"),
        user_id=current_user.get("id"),
        user_name=current_user.get("name"),
    )
    return {"url": res["url"], "key": res["key"], "content_type": file.content_type, "size": len(body)}


@liveblog_router.post("/{content_id}/liveblog/upload-video")
async def upload_entry_video(
    content_id: str,
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_editor_or_admin),
):
    if not is_s3_configured():
        raise HTTPException(status_code=503, detail="S3 storage is not configured.")
    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported video type: {file.content_type}")

    article = await _load_article(content_id, request, current_user)
    body = await file.read()
    if len(body) > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=413, detail=f"Video too large. Max {MAX_VIDEO_BYTES // (1024*1024)} MB.")

    scope = (
        article.get("main_site_id")
        or current_user.get("team_id")
        or "shared"
    )
    ext = (file.filename or "video.mp4").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "mp4"
    key = f"liveblog/{scope}/{content_id}/{uuid4()}.{ext}"
    res = await upload_file_to_s3(
        file_content=body,
        file_key=key,
        content_type=file.content_type,
        main_site_id=article.get("main_site_id"),
        user_id=current_user.get("id"),
        user_name=current_user.get("name"),
    )
    return {"url": res["url"], "key": res["key"], "content_type": file.content_type, "size": len(body)}
