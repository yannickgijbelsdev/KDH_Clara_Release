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
from models.media import (
    MediaAssetResponse, MediaAssetUpdate,
    MediaFolderCreate, MediaFolderUpdate, MediaFolderResponse,
    FolderShareRequest, FolderShareResponse
)
from services.auth import get_current_user, require_can_edit_content, require_admin

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
    folder_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all media assets for the team."""
    query = {"team_id": current_user.get('team_id')}
    
    if kind:
        query["kind"] = kind
    if search:
        query["title"] = {"$regex": search, "$options": "i"}
    if folder_id:
        query["folder_id"] = folder_id
    elif folder_id == "":
        # Get assets without folder (root level)
        query["$or"] = [{"folder_id": None}, {"folder_id": {"$exists": False}}]
    
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



# ============== FOLDER ENDPOINTS ==============

@media_router.get("/folders", response_model=List[MediaFolderResponse])
async def get_folders(
    parent_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all folders for the team, optionally filtered by parent."""
    query = {"team_id": current_user.get('team_id')}
    
    if parent_id:
        query["parent_id"] = parent_id
    elif parent_id is None:
        # Get root level folders (no parent)
        query["$or"] = [{"parent_id": None}, {"parent_id": {"$exists": False}}]
    
    folders = await db.media_folders.find(
        query,
        {"_id": 0}
    ).sort("name", 1).to_list(1000)
    
    # Enrich with creator names and asset counts
    for folder in folders:
        user = await db.users.find_one({"id": folder["created_by"]}, {"name": 1})
        folder["created_by_name"] = user.get("name") if user else "Unknown"
        
        # Count assets in folder
        asset_count = await db.media_assets.count_documents({
            "folder_id": folder["id"],
            "team_id": current_user.get('team_id')
        })
        folder["asset_count"] = asset_count
    
    return folders


@media_router.get("/folders/tree")
async def get_folder_tree(current_user: dict = Depends(get_current_user)):
    """Get complete folder tree with nested structure."""
    all_folders = await db.media_folders.find(
        {"team_id": current_user.get('team_id')},
        {"_id": 0}
    ).sort("name", 1).to_list(1000)
    
    # Build tree structure
    folder_map = {f["id"]: {**f, "children": [], "asset_count": 0} for f in all_folders}
    root_folders = []
    
    # Count assets per folder
    for folder_id in folder_map:
        count = await db.media_assets.count_documents({
            "folder_id": folder_id,
            "team_id": current_user.get('team_id')
        })
        folder_map[folder_id]["asset_count"] = count
    
    # Build tree
    for folder in all_folders:
        folder_data = folder_map[folder["id"]]
        parent_id = folder.get("parent_id")
        
        if parent_id and parent_id in folder_map:
            folder_map[parent_id]["children"].append(folder_data)
        else:
            root_folders.append(folder_data)
    
    return root_folders


@media_router.post("/folders", response_model=MediaFolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    folder_data: MediaFolderCreate,
    current_user: dict = Depends(require_can_edit_content)
):
    """Create a new folder."""
    now = datetime.now(timezone.utc).isoformat()
    
    # Validate parent folder if specified
    if folder_data.parent_id:
        parent = await db.media_folders.find_one({
            "id": folder_data.parent_id,
            "team_id": current_user.get('team_id')
        })
        if not parent:
            raise HTTPException(status_code=404, detail="Parent folder not found")
    
    folder_doc = {
        "id": str(uuid.uuid4()),
        "team_id": current_user.get('team_id'),
        "name": folder_data.name,
        "parent_id": folder_data.parent_id,
        "color": folder_data.color,
        "created_by": current_user['id'],
        "created_at": now,
        "updated_at": now
    }
    
    await db.media_folders.insert_one(folder_doc)
    folder_doc.pop("_id", None)
    folder_doc["created_by_name"] = current_user.get("name")
    folder_doc["asset_count"] = 0
    
    return folder_doc


@media_router.get("/folders/{folder_id}", response_model=MediaFolderResponse)
async def get_folder(
    folder_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single folder with its contents."""
    folder = await db.media_folders.find_one(
        {"id": folder_id, "team_id": current_user.get('team_id')},
        {"_id": 0}
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    user = await db.users.find_one({"id": folder["created_by"]}, {"name": 1})
    folder["created_by_name"] = user.get("name") if user else "Unknown"
    
    # Count assets
    asset_count = await db.media_assets.count_documents({
        "folder_id": folder_id,
        "team_id": current_user.get('team_id')
    })
    folder["asset_count"] = asset_count
    
    return folder


@media_router.put("/folders/{folder_id}", response_model=MediaFolderResponse)
async def update_folder(
    folder_id: str,
    update_data: MediaFolderUpdate,
    current_user: dict = Depends(require_can_edit_content)
):
    """Update a folder."""
    folder = await db.media_folders.find_one(
        {"id": folder_id, "team_id": current_user.get('team_id')}
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Validate parent folder if specified
    if update_data.parent_id and update_data.parent_id != folder_id:
        parent = await db.media_folders.find_one({
            "id": update_data.parent_id,
            "team_id": current_user.get('team_id')
        })
        if not parent:
            raise HTTPException(status_code=404, detail="Parent folder not found")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.media_folders.update_one(
        {"id": folder_id},
        {"$set": update_dict}
    )
    
    updated = await db.media_folders.find_one({"id": folder_id}, {"_id": 0})
    user = await db.users.find_one({"id": updated["created_by"]}, {"name": 1})
    updated["created_by_name"] = user.get("name") if user else "Unknown"
    updated["asset_count"] = await db.media_assets.count_documents({"folder_id": folder_id})
    
    return updated


@media_router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: str,
    move_to_root: bool = True,
    current_user: dict = Depends(require_can_edit_content)
):
    """Delete a folder. Assets can be moved to root or deleted with folder."""
    folder = await db.media_folders.find_one(
        {"id": folder_id, "team_id": current_user.get('team_id')}
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    if move_to_root:
        # Move all assets in this folder to root (no folder)
        await db.media_assets.update_many(
            {"folder_id": folder_id},
            {"$unset": {"folder_id": ""}}
        )
        # Move child folders to root
        await db.media_folders.update_many(
            {"parent_id": folder_id},
            {"$unset": {"parent_id": ""}}
        )
    
    # Delete folder shares
    await db.folder_shares.delete_many({"folder_id": folder_id})
    
    # Delete the folder
    await db.media_folders.delete_one({"id": folder_id})


# ============== FOLDER SHARING ==============

@media_router.get("/folders/{folder_id}/shares", response_model=List[FolderShareResponse])
async def get_folder_shares(
    folder_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all shares for a folder."""
    folder = await db.media_folders.find_one(
        {"id": folder_id, "team_id": current_user.get('team_id')}
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    shares = await db.folder_shares.find(
        {"folder_id": folder_id},
        {"_id": 0}
    ).to_list(1000)
    
    # Enrich with names
    for share in shares:
        if share.get("user_id"):
            user = await db.users.find_one({"id": share["user_id"]}, {"name": 1})
            share["user_name"] = user.get("name") if user else "Unknown"
        if share.get("show_id"):
            show = await db.shows.find_one({"id": share["show_id"]}, {"title": 1})
            share["show_title"] = show.get("title") if show else "Unknown"
        if share.get("series_id"):
            series = await db.show_series.find_one({"id": share["series_id"]}, {"title": 1})
            share["series_title"] = series.get("title") if series else "Unknown"
    
    return shares


@media_router.post("/folders/{folder_id}/shares")
async def share_folder(
    folder_id: str,
    share_data: FolderShareRequest,
    current_user: dict = Depends(require_can_edit_content)
):
    """Share a folder with users or link to shows/series."""
    folder = await db.media_folders.find_one(
        {"id": folder_id, "team_id": current_user.get('team_id')}
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    now = datetime.now(timezone.utc).isoformat()
    shares_created = []
    
    # Share with users
    if share_data.user_ids:
        for user_id in share_data.user_ids:
            # Check if share already exists
            existing = await db.folder_shares.find_one({
                "folder_id": folder_id,
                "user_id": user_id
            })
            if not existing:
                share_doc = {
                    "id": str(uuid.uuid4()),
                    "folder_id": folder_id,
                    "user_id": user_id,
                    "created_by": current_user['id'],
                    "created_at": now
                }
                await db.folder_shares.insert_one(share_doc)
                shares_created.append({"type": "user", "id": user_id})
    
    # Link to shows
    if share_data.show_ids:
        for show_id in share_data.show_ids:
            existing = await db.folder_shares.find_one({
                "folder_id": folder_id,
                "show_id": show_id
            })
            if not existing:
                share_doc = {
                    "id": str(uuid.uuid4()),
                    "folder_id": folder_id,
                    "show_id": show_id,
                    "created_by": current_user['id'],
                    "created_at": now
                }
                await db.folder_shares.insert_one(share_doc)
                shares_created.append({"type": "show", "id": show_id})
    
    # Link to series
    if share_data.series_ids:
        for series_id in share_data.series_ids:
            existing = await db.folder_shares.find_one({
                "folder_id": folder_id,
                "series_id": series_id
            })
            if not existing:
                share_doc = {
                    "id": str(uuid.uuid4()),
                    "folder_id": folder_id,
                    "series_id": series_id,
                    "created_by": current_user['id'],
                    "created_at": now
                }
                await db.folder_shares.insert_one(share_doc)
                shares_created.append({"type": "series", "id": series_id})
    
    return {"message": "Folder shared", "shares_created": shares_created}


@media_router.delete("/folders/{folder_id}/shares/{share_id}")
async def remove_folder_share(
    folder_id: str,
    share_id: str,
    current_user: dict = Depends(require_can_edit_content)
):
    """Remove a folder share."""
    folder = await db.media_folders.find_one(
        {"id": folder_id, "team_id": current_user.get('team_id')}
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    result = await db.folder_shares.delete_one({
        "id": share_id,
        "folder_id": folder_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Share not found")
    
    return {"message": "Share removed"}


# ============== FOLDERS LINKED TO SHOWS ==============

@media_router.get("/show/{show_id}/folders")
async def get_show_folders(
    show_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all folders linked to a show."""
    # Get direct show links
    show_shares = await db.folder_shares.find(
        {"show_id": show_id},
        {"_id": 0}
    ).to_list(100)
    
    folder_ids = [s["folder_id"] for s in show_shares]
    
    # Also check if show belongs to a series with linked folders
    show = await db.shows.find_one({"id": show_id})
    if show and show.get("series_id"):
        series_shares = await db.folder_shares.find(
            {"series_id": show["series_id"]},
            {"_id": 0}
        ).to_list(100)
        folder_ids.extend([s["folder_id"] for s in series_shares])
    
    # Get unique folder IDs
    folder_ids = list(set(folder_ids))
    
    if not folder_ids:
        return []
    
    folders = await db.media_folders.find(
        {"id": {"$in": folder_ids}},
        {"_id": 0}
    ).to_list(100)
    
    # Enrich with asset counts
    for folder in folders:
        folder["asset_count"] = await db.media_assets.count_documents({"folder_id": folder["id"]})
    
    return folders


@media_router.get("/occurrence/{occurrence_id}/folders")
async def get_occurrence_folders(
    occurrence_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all folders linked to an occurrence (via its series)."""
    occurrence = await db.show_occurrences.find_one({"id": occurrence_id})
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    folder_ids = []
    
    # Check series links
    if occurrence.get("show_series_id"):
        series_shares = await db.folder_shares.find(
            {"series_id": occurrence["show_series_id"]},
            {"_id": 0}
        ).to_list(100)
        folder_ids.extend([s["folder_id"] for s in series_shares])
    
    if not folder_ids:
        return []
    
    folders = await db.media_folders.find(
        {"id": {"$in": folder_ids}},
        {"_id": 0}
    ).to_list(100)
    
    # Enrich with asset counts
    for folder in folders:
        folder["asset_count"] = await db.media_assets.count_documents({"folder_id": folder["id"]})
    
    return folders
