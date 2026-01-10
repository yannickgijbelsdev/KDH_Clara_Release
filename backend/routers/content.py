"""Content library routes."""
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.responses import FileResponse
from typing import Optional, List
from datetime import datetime, timezone
from pathlib import Path
import uuid
import mimetypes
import aiofiles

from database import db, UPLOADS_DIR
from models.content import (
    ContentItemCreate, ContentItemUpdate, ContentItemResponse,
    FeaturedImageResponse
)
from models.wordpress import PublishToWordPressRequest, PublishResponse, PublishResult
from services.auth import get_current_user, require_editor_or_admin
from services.helpers import get_content_with_publish_statuses

content_router = APIRouter(prefix="/content", tags=["Content Library"])


@content_router.get("", response_model=List[ContentItemResponse])
async def get_content_items(
    type: Optional[str] = None,
    status: Optional[str] = None,
    tag: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all content items for the team."""
    query = {"team_id": current_user.get('team_id')}
    
    if type:
        query["type"] = type
    if status:
        query["status"] = status
    if tag:
        query["tags"] = tag
    if search:
        query["title"] = {"$regex": search, "$options": "i"}
    
    items = await db.content_items.find(query, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    
    result = []
    for item in items:
        publish_statuses = await db.content_item_publishes.find(
            {"content_item_id": item["id"]},
            {"_id": 0}
        ).to_list(100)
        
        for ps in publish_statuses:
            site = await db.wordpress_sites.find_one({"id": ps["wordpress_site_id"]}, {"_id": 0})
            ps["wordpress_site_name"] = site["name"] if site else "Unknown"
        
        item["publish_statuses"] = publish_statuses
        result.append(item)
    
    return result


@content_router.post("", response_model=ContentItemResponse, status_code=status.HTTP_201_CREATED)
async def create_content_item(
    content_data: ContentItemCreate,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Create a new content item."""
    content_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    content_doc = {
        "id": content_id,
        "title": content_data.title,
        "type": content_data.type,
        "body": content_data.body or "",
        "excerpt": content_data.excerpt or "",
        "external_url": content_data.external_url or "",
        "tags": content_data.tags or [],
        "status": content_data.status,
        "team_id": current_user.get('team_id', ''),
        "created_by": current_user['id'],
        "created_at": now,
        "updated_at": now
    }
    
    await db.content_items.insert_one(content_doc)
    content_doc.pop('_id', None)
    content_doc["publish_statuses"] = []
    return content_doc


@content_router.get("/{content_id}", response_model=ContentItemResponse)
async def get_content_item(
    content_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single content item."""
    content = await get_content_with_publish_statuses(content_id, current_user.get('team_id'))
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    return content


@content_router.put("/{content_id}", response_model=ContentItemResponse)
async def update_content_item(
    content_id: str,
    content_data: ContentItemUpdate,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Update a content item."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    update_dict = {k: v for k, v in content_data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.content_items.update_one(
        {"id": content_id},
        {"$set": update_dict}
    )
    
    return await get_content_with_publish_statuses(content_id, current_user.get('team_id'))


@content_router.delete("/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_content_item(
    content_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Delete a content item."""
    result = await db.content_items.delete_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    await db.content_item_publishes.delete_many({"content_item_id": content_id})
    
    featured_images = await db.content_item_featured_images.find(
        {"content_item_id": content_id}
    ).to_list(100)
    for img in featured_images:
        file_path = UPLOADS_DIR / img.get("file_storage_key", "")
        if file_path.exists():
            file_path.unlink()
    await db.content_item_featured_images.delete_many({"content_item_id": content_id})
    
    await db.rundown_items.update_many(
        {"content_ids": content_id},
        {"$pull": {"content_ids": content_id}}
    )


# ============== FEATURED IMAGE ROUTES ==============

@content_router.get("/{content_id}/featured-images", response_model=List[FeaturedImageResponse])
async def get_featured_images(
    content_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all featured images for a content item."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    images = await db.content_item_featured_images.find(
        {"content_item_id": content_id},
        {"_id": 0}
    ).to_list(100)
    
    for img in images:
        site = await db.wordpress_sites.find_one({"id": img["wordpress_site_id"]}, {"_id": 0})
        img["wordpress_site_name"] = site["name"] if site else "Unknown"
    
    return images


@content_router.post("/{content_id}/featured-images/{site_id}", response_model=FeaturedImageResponse)
async def upload_featured_image(
    content_id: str,
    site_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_editor_or_admin)
):
    """Upload a featured image for a specific WordPress site."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    site = await db.wordpress_sites.find_one(
        {"id": site_id, "team_id": current_user.get('team_id')}
    )
    if not site:
        raise HTTPException(status_code=404, detail="WordPress site not found")
    
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    content_type = file.content_type or mimetypes.guess_type(file.filename)[0]
    if content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}")
    
    existing = await db.content_item_featured_images.find_one({
        "content_item_id": content_id,
        "wordpress_site_id": site_id
    })
    if existing:
        old_file = UPLOADS_DIR / existing.get("file_storage_key", "")
        if old_file.exists():
            old_file.unlink()
        await db.content_item_featured_images.delete_one({"id": existing["id"]})
    
    file_ext = Path(file.filename).suffix or '.jpg'
    storage_key = f"{content_id}_{site_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    file_path = UPLOADS_DIR / storage_key
    
    file_size = 0
    async with aiofiles.open(file_path, 'wb') as f:
        while chunk := await file.read(8192):
            await f.write(chunk)
            file_size += len(chunk)
    
    now = datetime.now(timezone.utc).isoformat()
    image_doc = {
        "id": str(uuid.uuid4()),
        "content_item_id": content_id,
        "wordpress_site_id": site_id,
        "file_storage_key": storage_key,
        "file_name": file.filename,
        "mime_type": content_type,
        "size": file_size,
        "wp_media_id": None,
        "wp_media_url": None,
        "sync_status": "not_synced",
        "sync_error_message": None,
        "last_synced_at": None,
        "created_at": now,
        "updated_at": now
    }
    
    await db.content_item_featured_images.insert_one(image_doc)
    image_doc.pop("_id", None)
    image_doc["wordpress_site_name"] = site["name"]
    
    return image_doc


@content_router.delete("/{content_id}/featured-images/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_featured_image(
    content_id: str,
    site_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Delete a featured image for a specific WordPress site."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    image = await db.content_item_featured_images.find_one({
        "content_item_id": content_id,
        "wordpress_site_id": site_id
    })
    if not image:
        raise HTTPException(status_code=404, detail="Featured image not found")
    
    file_path = UPLOADS_DIR / image.get("file_storage_key", "")
    if file_path.exists():
        file_path.unlink()
    
    await db.content_item_featured_images.delete_one({"id": image["id"]})


# ============== PUBLISH STATUS ==============

@content_router.get("/{content_id}/publish/{site_id}")
async def get_publish_status(
    content_id: str,
    site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get publish status for a content item on a specific site."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    publish_record = await db.content_item_publishes.find_one(
        {"content_item_id": content_id, "wordpress_site_id": site_id},
        {"_id": 0}
    )
    
    if not publish_record:
        return {"sync_status": "not_synced"}
    
    site = await db.wordpress_sites.find_one({"id": site_id}, {"_id": 0})
    publish_record["wordpress_site_name"] = site["name"] if site else "Unknown"
    
    return publish_record
