"""Media library routes."""
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.responses import FileResponse
from typing import Optional, List
from datetime import datetime, timezone
from pathlib import Path
import uuid
import mimetypes
import aiofiles
import secrets

from database import db, MEDIA_UPLOADS_DIR
from models.media import MediaAssetResponse, MediaAssetUpdate
from services.auth import get_current_user, require_can_edit_content

media_router = APIRouter(prefix="/media", tags=["Media Library"])

# Allowed file types
ALLOWED_DOCUMENT_TYPES = {
    'application/pdf': 'document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
    'text/plain': 'document'
}
ALLOWED_AUDIO_TYPES = {
    'audio/mpeg': 'audio',
    'audio/mp3': 'audio',
    'audio/wav': 'audio',
    'audio/x-wav': 'audio',
    'audio/x-m4a': 'audio',
    'audio/m4a': 'audio'
}
ALLOWED_IMAGE_TYPES = {
    'image/jpeg': 'image',
    'image/png': 'image',
    'image/gif': 'image',
    'image/webp': 'image'
}
ALLOWED_MEDIA_TYPES = {**ALLOWED_DOCUMENT_TYPES, **ALLOWED_AUDIO_TYPES, **ALLOWED_IMAGE_TYPES}
MAX_MEDIA_SIZE = 100 * 1024 * 1024  # 100MB


@media_router.get("", response_model=List[MediaAssetResponse])
async def get_media_assets(
    kind: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all media assets for the team."""
    query = {"team_id": current_user.get('team_id')}
    
    if kind:
        query["kind"] = kind
    if search:
        query["title"] = {"$regex": search, "$options": "i"}
    
    assets = await db.media_assets.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    for asset in assets:
        user = await db.users.find_one({"id": asset["uploaded_by"]}, {"name": 1})
        asset["uploaded_by_name"] = user.get("name") if user else "Unknown"
    
    return assets


@media_router.post("", response_model=MediaAssetResponse, status_code=status.HTTP_201_CREATED)
async def upload_media_asset(
    file: UploadFile = File(...),
    title: Optional[str] = None,
    current_user: dict = Depends(require_can_edit_content)
):
    """Upload a new media asset."""
    content_type = file.content_type or mimetypes.guess_type(file.filename)[0]
    
    if content_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Allowed: PDF, DOCX, TXT, MP3, WAV, M4A, JPEG, PNG, GIF, WebP"
        )
    
    kind = ALLOWED_MEDIA_TYPES.get(content_type, 'document')
    
    file_ext = Path(file.filename).suffix or '.bin'
    storage_key = f"{current_user.get('team_id')}_{uuid.uuid4().hex[:12]}{file_ext}"
    file_path = MEDIA_UPLOADS_DIR / storage_key
    
    file_size = 0
    async with aiofiles.open(file_path, 'wb') as f:
        while chunk := await file.read(8192):
            await f.write(chunk)
            file_size += len(chunk)
            if file_size > MAX_MEDIA_SIZE:
                await f.close()
                file_path.unlink()
                raise HTTPException(status_code=400, detail="File too large. Maximum size is 100MB")
    
    now = datetime.now(timezone.utc).isoformat()
    asset_doc = {
        "id": str(uuid.uuid4()),
        "team_id": current_user.get('team_id'),
        "uploaded_by": current_user['id'],
        "kind": kind,
        "title": title or file.filename,
        "file_storage_key": storage_key,
        "original_filename": file.filename,
        "mime_type": content_type,
        "size": file_size,
        "duration_seconds": None,
        "created_at": now,
        "updated_at": now
    }
    
    await db.media_assets.insert_one(asset_doc)
    asset_doc.pop("_id", None)
    asset_doc["uploaded_by_name"] = current_user.get("name")
    
    return asset_doc


@media_router.get("/{asset_id}", response_model=MediaAssetResponse)
async def get_media_asset(
    asset_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single media asset."""
    asset = await db.media_assets.find_one(
        {"id": asset_id, "team_id": current_user.get('team_id')},
        {"_id": 0}
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    
    user = await db.users.find_one({"id": asset["uploaded_by"]}, {"name": 1})
    asset["uploaded_by_name"] = user.get("name") if user else "Unknown"
    
    return asset


@media_router.put("/{asset_id}", response_model=MediaAssetResponse)
async def update_media_asset(
    asset_id: str,
    update_data: MediaAssetUpdate,
    current_user: dict = Depends(require_can_edit_content)
):
    """Update media asset metadata."""
    asset = await db.media_assets.find_one(
        {"id": asset_id, "team_id": current_user.get('team_id')}
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.media_assets.update_one(
        {"id": asset_id},
        {"$set": update_dict}
    )
    
    updated = await db.media_assets.find_one({"id": asset_id}, {"_id": 0})
    user = await db.users.find_one({"id": updated["uploaded_by"]}, {"name": 1})
    updated["uploaded_by_name"] = user.get("name") if user else "Unknown"
    
    return updated


@media_router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media_asset(
    asset_id: str,
    current_user: dict = Depends(require_can_edit_content)
):
    """Delete a media asset."""
    asset = await db.media_assets.find_one(
        {"id": asset_id, "team_id": current_user.get('team_id')}
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    
    file_path = MEDIA_UPLOADS_DIR / asset.get("file_storage_key", "")
    if file_path.exists():
        file_path.unlink()
    
    await db.media_assets.delete_one({"id": asset_id})
    
    await db.show_media.delete_many({"media_asset_id": asset_id})
    await db.rundown_item_media.delete_many({"media_asset_id": asset_id})
    await db.media_share_links.delete_many({"asset_id": asset_id})


@media_router.post("/{asset_id}/share")
async def create_share_link(
    asset_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Generate a public share link for a media asset."""
    asset = await db.media_assets.find_one(
        {"id": asset_id, "team_id": current_user.get('team_id')},
        {"_id": 0}
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    
    # Check if share link already exists
    existing = await db.media_share_links.find_one({"asset_id": asset_id})
    if existing:
        return {
            "share_token": existing["share_token"],
            "created_at": existing["created_at"]
        }
    
    # Create new share link
    share_token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc).isoformat()
    
    share_doc = {
        "id": str(uuid.uuid4()),
        "asset_id": asset_id,
        "team_id": current_user.get('team_id'),
        "share_token": share_token,
        "created_by": current_user['id'],
        "created_at": now
    }
    
    await db.media_share_links.insert_one(share_doc)
    
    return {
        "share_token": share_token,
        "created_at": now
    }


@media_router.delete("/{asset_id}/share")
async def revoke_share_link(
    asset_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Revoke a public share link for a media asset."""
    asset = await db.media_assets.find_one(
        {"id": asset_id, "team_id": current_user.get('team_id')},
        {"_id": 0}
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    
    result = await db.media_share_links.delete_one({"asset_id": asset_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Share link not found")
    
    return {"message": "Share link revoked"}


@media_router.get("/{asset_id}/share")
async def get_share_link(
    asset_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get the share link for a media asset if it exists."""
    asset = await db.media_assets.find_one(
        {"id": asset_id, "team_id": current_user.get('team_id')},
        {"_id": 0}
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    
    share = await db.media_share_links.find_one({"asset_id": asset_id}, {"_id": 0})
    
    if not share:
        return {"has_share_link": False}
    
    return {
        "has_share_link": True,
        "share_token": share["share_token"],
        "created_at": share["created_at"]
    }
