"""Media folders routes."""
from fastapi import APIRouter, HTTPException, Depends, status
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from database import db
from models.media import (
    MediaFolderCreate, MediaFolderUpdate, MediaFolderResponse,
    FolderShareRequest, FolderShareResponse
)
from services.auth import get_current_user, require_can_edit_content

folders_router = APIRouter(prefix="/media/folders", tags=["Media Folders"])


@folders_router.get("", response_model=List[MediaFolderResponse])
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


@folders_router.get("/tree")
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


@folders_router.post("", response_model=MediaFolderResponse, status_code=status.HTTP_201_CREATED)
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


@folders_router.get("/{folder_id}", response_model=MediaFolderResponse)
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


@folders_router.put("/{folder_id}", response_model=MediaFolderResponse)
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


@folders_router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
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

@folders_router.get("/{folder_id}/shares", response_model=List[FolderShareResponse])
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


@folders_router.post("/{folder_id}/shares")
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


@folders_router.delete("/{folder_id}/shares/{share_id}")
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

@folders_router.get("/show/{show_id}")
async def get_show_folders(
    show_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all folders linked to a show."""
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
    
    folder_ids = list(set(folder_ids))
    
    if not folder_ids:
        return []
    
    folders = await db.media_folders.find(
        {"id": {"$in": folder_ids}},
        {"_id": 0}
    ).to_list(100)
    
    for folder in folders:
        folder["asset_count"] = await db.media_assets.count_documents({"folder_id": folder["id"]})
    
    return folders


@folders_router.get("/occurrence/{occurrence_id}")
async def get_occurrence_folders(
    occurrence_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all folders linked to an occurrence (via its series)."""
    occurrence = await db.show_occurrences.find_one({"id": occurrence_id})
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    folder_ids = []
    
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
    
    for folder in folders:
        folder["asset_count"] = await db.media_assets.count_documents({"folder_id": folder["id"]})
    
    return folders
