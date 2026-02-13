"""Show and rundown management routes."""
from fastapi import APIRouter, HTTPException, Depends, status, Query, UploadFile, File
from fastapi.responses import HTMLResponse
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pathlib import Path
import uuid
import jwt
import aiofiles
import mimetypes
import logging

from database import db, JWT_SECRET, UPLOADS_DIR
from models.shows import (
    ShowCreate, ShowUpdate, ShowResponse,
    RundownItemCreate, RundownItemUpdate, RundownItemResponse,
    ReorderRequest, AttachContentRequest, ShowTitleCreate, ShowTitleUpdate, ShowTitleResponse,
    StudioCreate, StudioUpdate, StudioResponse
)
from models.content import ContentItemResponse
from models.media import AttachMediaRequest, RundownItemMediaResponse
from services.auth import get_current_user, require_editor_or_admin, require_admin
from services.websocket import ws_manager
from services.helpers import get_content_with_publish_statuses
from services.s3_storage import upload_file_to_s3, delete_file_from_s3, is_s3_configured

logger = logging.getLogger(__name__)

shows_router = APIRouter(prefix="/shows", tags=["Shows"])

# Create show images directory (fallback for local storage)
SHOW_IMAGES_DIR = UPLOADS_DIR.parent / 'show_images'
SHOW_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# Create show title images directory (fallback for local storage)
SHOW_TITLE_IMAGES_DIR = UPLOADS_DIR.parent / 'show_title_images'
SHOW_TITLE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB


def generate_occurrence_dates(start_date: str, interval_weeks: int, end_date: Optional[str], max_occurrences: int = 52) -> List[str]:
    """Generate dates for recurring shows."""
    dates = []
    current = datetime.strptime(start_date, '%Y-%m-%d')
    
    if end_date:
        end = datetime.strptime(end_date, '%Y-%m-%d')
    else:
        # Default to 1 year ahead if no end date
        end = current + timedelta(days=365)
    
    while current <= end and len(dates) < max_occurrences:
        dates.append(current.strftime('%Y-%m-%d'))
        current += timedelta(weeks=interval_weeks)
    
    return dates


# ============== SHOW TITLES (Templates) ==============

async def get_presenters_info(presenter_ids: List[str], team_id: str) -> List[dict]:
    """Fetch presenter information for given IDs."""
    if not presenter_ids:
        return []
    
    presenters = await db.users.find(
        {"id": {"$in": presenter_ids}, "team_id": team_id},
        {"_id": 0, "id": 1, "name": 1, "avatar": 1}
    ).to_list(100)
    
    # Preserve order from presenter_ids
    presenter_map = {p["id"]: p for p in presenters}
    return [presenter_map[pid] for pid in presenter_ids if pid in presenter_map]


@shows_router.get("/titles", response_model=List[ShowTitleResponse])
async def get_show_titles(
    current_user: dict = Depends(get_current_user)
):
    """Get all show titles for the team. Available to all users."""
    titles = await db.show_titles.find(
        {"team_id": current_user.get('team_id')},
        {"_id": 0}
    ).sort("name", 1).to_list(100)
    
    # Enrich with presenter info
    for title in titles:
        presenter_ids = title.get("default_presenter_ids", [])
        if presenter_ids:
            title["default_presenters"] = await get_presenters_info(presenter_ids, current_user.get('team_id'))
    
    return titles


@shows_router.post("/titles", response_model=ShowTitleResponse, status_code=status.HTTP_201_CREATED)
async def create_show_title(
    title_data: ShowTitleCreate,
    current_user: dict = Depends(require_admin)
):
    """Create a new show title. Admin only."""
    title_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # Check for duplicate name
    existing = await db.show_titles.find_one({
        "team_id": current_user.get('team_id'),
        "name": {"$regex": f"^{title_data.name}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(status_code=400, detail="A show title with this name already exists")
    
    title_doc = {
        "id": title_id,
        "name": title_data.name,
        "description": title_data.description or "",
        "default_start_time": title_data.default_start_time,
        "default_end_time": title_data.default_end_time,
        "rds_station": title_data.rds_station or "none",
        "default_presenter_ids": title_data.default_presenter_ids or [],
        "team_id": current_user.get('team_id'),
        "created_by": current_user['id'],
        "created_at": now
    }
    
    await db.show_titles.insert_one(title_doc)
    title_doc.pop('_id', None)
    
    # Add presenter info to response
    if title_doc.get("default_presenter_ids"):
        title_doc["default_presenters"] = await get_presenters_info(title_doc["default_presenter_ids"], current_user.get('team_id'))
    
    return title_doc


@shows_router.put("/titles/{title_id}", response_model=ShowTitleResponse)
async def update_show_title(
    title_id: str,
    title_data: ShowTitleUpdate,
    current_user: dict = Depends(require_admin)
):
    """Update a show title. Admin only.
    
    When the name is changed, all shows with the old name will be updated to the new name.
    """
    title = await db.show_titles.find_one({
        "id": title_id,
        "team_id": current_user.get('team_id')
    })
    if not title:
        raise HTTPException(status_code=404, detail="Show title not found")
    
    old_name = title.get("name")
    update_dict = {k: v for k, v in title_data.model_dump().items() if v is not None}
    
    if "name" in update_dict:
        new_name = update_dict["name"]
        # Check for duplicates (case-insensitive)
        existing = await db.show_titles.find_one({
            "team_id": current_user.get('team_id'),
            "name": {"$regex": f"^{new_name}$", "$options": "i"},
            "id": {"$ne": title_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="A show title with this name already exists")
        
        # Update all shows with the old name to use the new name
        if old_name and new_name and old_name != new_name:
            result = await db.shows.update_many(
                {"title": old_name, "team_id": current_user.get('team_id')},
                {"$set": {"title": new_name}}
            )
            logger.info(f"Updated {result.modified_count} shows from '{old_name}' to '{new_name}'")
            
            # Also update any cached rundowns with the old show title
            await db.rds_cached_rundowns.update_many(
                {"show_title": old_name},
                {"$set": {"show_title": new_name}}
            )
    
    # Handle default_presenter_ids - allow setting to empty list
    if title_data.default_presenter_ids is not None:
        update_dict["default_presenter_ids"] = title_data.default_presenter_ids
    
    if update_dict:
        await db.show_titles.update_one(
            {"id": title_id},
            {"$set": update_dict}
        )
    
    updated = await db.show_titles.find_one({"id": title_id}, {"_id": 0})
    
    # Add presenter info to response
    if updated.get("default_presenter_ids"):
        updated["default_presenters"] = await get_presenters_info(updated["default_presenter_ids"], current_user.get('team_id'))
    
    return updated


@shows_router.delete("/titles/{title_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_show_title(
    title_id: str,
    current_user: dict = Depends(require_admin)
):
    """Delete a show title. Admin only."""
    result = await db.show_titles.delete_one({
        "id": title_id,
        "team_id": current_user.get('team_id')
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Show title not found")


@shows_router.post("/titles/{title_id}/image")
async def upload_show_title_image(
    title_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_admin)
):
    """Upload an image for a show title to S3. Admin only."""
    # Verify title exists
    title = await db.show_titles.find_one({
        "id": title_id,
        "team_id": current_user.get('team_id')
    })
    if not title:
        raise HTTPException(status_code=404, detail="Show title not found")
    
    # Validate file type
    content_type = file.content_type or mimetypes.guess_type(file.filename)[0]
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid image type. Allowed: JPEG, PNG, GIF, WebP, HEIC")
    
    # Read file content
    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max 10MB")
    
    # Delete old image if exists
    if title.get('image'):
        old_key = title['image'].get('file_key', '')
        if old_key.startswith("show_titles/") and is_s3_configured():
            try:
                await delete_file_from_s3(old_key)
            except:
                pass
        else:
            old_path = SHOW_TITLE_IMAGES_DIR / old_key
            if old_path.exists():
                old_path.unlink()
    
    # Generate storage key and upload
    file_ext = Path(file.filename).suffix or '.jpg'
    storage_key = f"show_titles/{current_user.get('team_id')}/{title_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    s3_url = None
    
    if is_s3_configured():
        try:
            result = await upload_file_to_s3(content, storage_key, content_type)
            s3_url = result['url']
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to upload: {str(e)}")
    else:
        local_key = f"{title_id}_{uuid.uuid4().hex[:8]}{file_ext}"
        file_path = SHOW_TITLE_IMAGES_DIR / local_key
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(content)
        storage_key = local_key
    
    # Update title record
    image_data = {
        "file_key": storage_key,
        "s3_url": s3_url,
        "filename": file.filename,
        "mime_type": content_type,
        "size": len(content)
    }
    
    await db.show_titles.update_one(
        {"id": title_id},
        {"$set": {"image": image_data}}
    )
    
    # Sync image to all shows with this title name
    title_name = title.get("name")
    if title_name:
        result = await db.shows.update_many(
            {"title": title_name, "team_id": current_user.get('team_id')},
            {"$set": {"image": image_data}}
        )
        logger.info(f"Synced image to {result.modified_count} shows for '{title_name}'")
        
        # Also update RDS cached rundowns
        await db.rds_cached_rundowns.update_many(
            {"show_title": title_name},
            {"$set": {"show_image": image_data}}
        )
    
    return {"image": image_data}


@shows_router.delete("/titles/{title_id}/image")
async def delete_show_title_image(
    title_id: str,
    current_user: dict = Depends(require_admin)
):
    """Remove image from a show title. Admin only.
    
    Also removes the image from all shows with this title.
    """
    title = await db.show_titles.find_one({
        "id": title_id,
        "team_id": current_user.get('team_id')
    })
    if not title:
        raise HTTPException(status_code=404, detail="Show title not found")
    
    if title.get('image'):
        storage_key = title['image'].get('file_key', '')
        if storage_key.startswith("show_titles/") and is_s3_configured():
            try:
                await delete_file_from_s3(storage_key)
            except:
                pass
        else:
            file_path = SHOW_TITLE_IMAGES_DIR / storage_key
            if file_path.exists():
                file_path.unlink()
    
    await db.show_titles.update_one(
        {"id": title_id},
        {"$unset": {"image": ""}}
    )
    
    # Also remove image from all shows with this title
    title_name = title.get("name")
    if title_name:
        result = await db.shows.update_many(
            {"title": title_name, "team_id": current_user.get('team_id')},
            {"$unset": {"image": ""}}
        )
        logger.info(f"Removed image from {result.modified_count} shows for '{title_name}'")
        
        # Also update RDS cached rundowns
        await db.rds_cached_rundowns.update_many(
            {"show_title": title_name},
            {"$unset": {"show_image": ""}}
        )
    
    return {"message": "Image removed"}


# ============== STUDIOS/ROOMS ==============

@shows_router.get("/studios", response_model=List[StudioResponse])
async def get_studios(
    current_user: dict = Depends(get_current_user)
):
    """Get all studios for the team. Available to all users."""
    studios = await db.studios.find(
        {"team_id": current_user.get('team_id')},
        {"_id": 0}
    ).sort("name", 1).to_list(100)
    return studios


@shows_router.post("/studios", response_model=StudioResponse, status_code=status.HTTP_201_CREATED)
async def create_studio(
    studio_data: StudioCreate,
    current_user: dict = Depends(require_admin)
):
    """Create a new studio. Admin only."""
    studio_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # Check for duplicate name
    existing = await db.studios.find_one({
        "team_id": current_user.get('team_id'),
        "name": {"$regex": f"^{studio_data.name}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(status_code=400, detail="A studio with this name already exists")
    
    studio_doc = {
        "id": studio_id,
        "name": studio_data.name,
        "description": studio_data.description or "",
        "team_id": current_user.get('team_id'),
        "created_by": current_user['id'],
        "created_at": now
    }
    
    await db.studios.insert_one(studio_doc)
    studio_doc.pop('_id', None)
    return studio_doc


@shows_router.put("/studios/{studio_id}", response_model=StudioResponse)
async def update_studio(
    studio_id: str,
    studio_data: StudioUpdate,
    current_user: dict = Depends(require_admin)
):
    """Update a studio. Admin only."""
    studio = await db.studios.find_one({
        "id": studio_id,
        "team_id": current_user.get('team_id')
    })
    if not studio:
        raise HTTPException(status_code=404, detail="Studio not found")
    
    update_dict = {k: v for k, v in studio_data.model_dump().items() if v is not None}
    
    if "name" in update_dict:
        existing = await db.studios.find_one({
            "team_id": current_user.get('team_id'),
            "name": {"$regex": f"^{update_dict['name']}$", "$options": "i"},
            "id": {"$ne": studio_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="A studio with this name already exists")
    
    if update_dict:
        await db.studios.update_one(
            {"id": studio_id},
            {"$set": update_dict}
        )
    
    updated = await db.studios.find_one({"id": studio_id}, {"_id": 0})
    return updated


@shows_router.delete("/studios/{studio_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_studio(
    studio_id: str,
    current_user: dict = Depends(require_admin)
):
    """Delete a studio. Admin only."""
    result = await db.studios.delete_one({
        "id": studio_id,
        "team_id": current_user.get('team_id')
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Studio not found")


# ============== SHOW IMAGE UPLOAD ==============

@shows_router.post("/{show_id}/image")
async def upload_show_image(
    show_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_editor_or_admin)
):
    """Upload an image for a show to S3."""
    show = await db.shows.find_one({
        "id": show_id,
        "team_id": current_user.get('team_id')
    })
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
    content_type = file.content_type or mimetypes.guess_type(file.filename)[0]
    if content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: JPEG, PNG, GIF, WebP, HEIC")
    
    # Delete old image if exists
    old_image = show.get("image")
    if old_image:
        old_key = old_image.get("file_storage_key", "")
        if old_key.startswith("shows/") and is_s3_configured():
            try:
                await delete_file_from_s3(old_key)
            except:
                pass
        else:
            old_file = SHOW_IMAGES_DIR / old_key
            if old_file.exists():
                old_file.unlink()
    
    # Read file content
    file_content = await file.read()
    file_size = len(file_content)
    
    # Save to S3 or local
    file_ext = Path(file.filename).suffix or '.jpg'
    storage_key = f"shows/{current_user.get('team_id')}/{show_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    s3_url = None
    
    if is_s3_configured():
        try:
            result = await upload_file_to_s3(file_content, storage_key, content_type)
            s3_url = result['url']
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to upload: {str(e)}")
    else:
        local_key = f"show_{show_id}_{uuid.uuid4().hex[:8]}{file_ext}"
        file_path = SHOW_IMAGES_DIR / local_key
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(file_content)
        storage_key = local_key
    
    now = datetime.now(timezone.utc).isoformat()
    image_data = {
        "file_storage_key": storage_key,
        "s3_url": s3_url,
        "file_name": file.filename,
        "mime_type": content_type,
        "size": file_size
    }
    
    await db.shows.update_one(
        {"id": show_id},
        {"$set": {"image": image_data, "updated_at": now}}
    )
    
    return {"success": True, "image": image_data}


@shows_router.delete("/{show_id}/image")
async def delete_show_image(
    show_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Delete the image from a show."""
    show = await db.shows.find_one({
        "id": show_id,
        "team_id": current_user.get('team_id')
    })
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    image = show.get("image")
    if image:
        storage_key = image.get("file_storage_key", "")
        if storage_key.startswith("shows/") and is_s3_configured():
            try:
                await delete_file_from_s3(storage_key)
            except:
                pass
        else:
            file_path = SHOW_IMAGES_DIR / storage_key
            if file_path.exists():
                file_path.unlink()
    
    await db.shows.update_one(
        {"id": show_id},
        {"$set": {"image": None, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"success": True}


# ============== SHOWS CRUD ==============

@shows_router.get("", response_model=List[ShowResponse])
async def get_shows(
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get shows for the current team."""
    query = {"team_id": current_user.get('team_id')}
    if status:
        query["status"] = status
    if date_from or date_to:
        query["date"] = {}
        if date_from:
            query["date"]["$gte"] = date_from
        if date_to:
            query["date"]["$lte"] = date_to
        if not query["date"]:
            del query["date"]
    
    shows = await db.shows.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    # Get studio names for shows that have studio_id
    studio_ids = list(set(s.get('studio_id') for s in shows if s.get('studio_id')))
    studios_map = {}
    if studio_ids:
        studios = await db.studios.find({"id": {"$in": studio_ids}}, {"_id": 0}).to_list(100)
        studios_map = {s['id']: s['name'] for s in studios}
    
    # Get all presenter IDs and fetch info
    all_presenter_ids = []
    for show in shows:
        all_presenter_ids.extend(show.get('presenter_ids', []))
    all_presenter_ids = list(set(all_presenter_ids))
    
    presenters_map = {}
    if all_presenter_ids:
        presenters = await db.users.find(
            {"id": {"$in": all_presenter_ids}},
            {"_id": 0, "id": 1, "name": 1, "avatar": 1}
        ).to_list(100)
        presenters_map = {p["id"]: p for p in presenters}
    
    for show in shows:
        if show.get('studio_id'):
            show['studio_name'] = studios_map.get(show['studio_id'])
        # Add presenter info
        presenter_ids = show.get('presenter_ids', [])
        if presenter_ids:
            show['presenters'] = [presenters_map[pid] for pid in presenter_ids if pid in presenters_map]
    
    return shows


@shows_router.post("", response_model=ShowResponse, status_code=status.HTTP_201_CREATED)
async def create_show(
    show_data: ShowCreate,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Create a new show. If recurring, also creates future occurrences."""
    now = datetime.now(timezone.utc).isoformat()
    team_id = current_user.get('team_id', '')
    
    # For recurring shows, create parent and occurrences
    if show_data.recurrence_type == "weekly" and show_data.recurrence_interval >= 1:
        parent_id = str(uuid.uuid4())
        
        # Create parent show (first occurrence)
        parent_doc = {
            "id": parent_id,
            "title": show_data.title,
            "description": show_data.description or "",
            "date": show_data.date,
            "start_time": show_data.start_time,
            "end_time": show_data.end_time,
            "status": show_data.status,
            "studio_id": show_data.studio_id,
            "presenter_ids": show_data.presenter_ids or [],
            "editor_id": current_user['id'],
            "team_id": team_id,
            "created_at": now,
            "updated_at": now,
            "recurrence_type": show_data.recurrence_type,
            "recurrence_interval": show_data.recurrence_interval,
            "recurrence_end_date": show_data.recurrence_end_date,
            "parent_show_id": None,  # This is the parent
            "is_recurring": True
        }
        await db.shows.insert_one(parent_doc)
        
        # Generate occurrence dates (skip first as it's the parent)
        occurrence_dates = generate_occurrence_dates(
            show_data.date,
            show_data.recurrence_interval,
            show_data.recurrence_end_date
        )
        
        # Create child occurrences for future dates
        for occ_date in occurrence_dates[1:]:  # Skip first date (parent)
            occ_id = str(uuid.uuid4())
            occ_doc = {
                "id": occ_id,
                "title": show_data.title,
                "description": show_data.description or "",
                "date": occ_date,
                "start_time": show_data.start_time,
                "end_time": show_data.end_time,
                "status": show_data.status,
                "studio_id": show_data.studio_id,
                "presenter_ids": show_data.presenter_ids or [],
                "editor_id": current_user['id'],
                "team_id": team_id,
                "created_at": now,
                "updated_at": now,
                "recurrence_type": show_data.recurrence_type,
                "recurrence_interval": show_data.recurrence_interval,
                "recurrence_end_date": show_data.recurrence_end_date,
                "parent_show_id": parent_id,
                "is_recurring": True
            }
            await db.shows.insert_one(occ_doc)
        
        parent_doc.pop('_id', None)
        
        # Add presenter info to response
        if parent_doc.get("presenter_ids"):
            parent_doc["presenters"] = await get_presenters_info(parent_doc["presenter_ids"], team_id)
        
        return parent_doc
    else:
        # Non-recurring show
        show_id = str(uuid.uuid4())
        show_doc = {
            "id": show_id,
            "title": show_data.title,
            "description": show_data.description or "",
            "date": show_data.date,
            "start_time": show_data.start_time,
            "end_time": show_data.end_time,
            "status": show_data.status,
            "studio_id": show_data.studio_id,
            "presenter_ids": show_data.presenter_ids or [],
            "editor_id": current_user['id'],
            "team_id": team_id,
            "created_at": now,
            "updated_at": now,
            "recurrence_type": "none",
            "recurrence_interval": 1,
            "recurrence_end_date": None,
            "parent_show_id": None,
            "is_recurring": False
        }
        
        await db.shows.insert_one(show_doc)
        show_doc.pop('_id', None)
        
        # Add presenter info to response
        if show_doc.get("presenter_ids"):
            show_doc["presenters"] = await get_presenters_info(show_doc["presenter_ids"], team_id)
        
        return show_doc


@shows_router.get("/{show_id}", response_model=ShowResponse)
async def get_show(
    show_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single show (must be in user's team)."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')},
        {"_id": 0}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    # Get studio name if exists
    if show.get('studio_id'):
        studio = await db.studios.find_one({"id": show['studio_id']}, {"_id": 0})
        if studio:
            show['studio_name'] = studio['name']
    
    # Get presenter info
    if show.get('presenter_ids'):
        show['presenters'] = await get_presenters_info(show['presenter_ids'], current_user.get('team_id'))
    
    return show


@shows_router.put("/{show_id}", response_model=ShowResponse)
async def update_show(
    show_id: str,
    show_data: ShowUpdate,
    update_all: bool = Query(default=False, description="Update all occurrences of recurring show"),
    current_user: dict = Depends(require_editor_or_admin)
):
    """Update a show. For recurring shows, can update just this one or all occurrences."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    update_dict = {k: v for k, v in show_data.model_dump().items() if v is not None and k != 'update_all_occurrences'}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Remove date from update_dict if updating all (each occurrence has different date)
    if update_all and 'date' in update_dict:
        del update_dict['date']
    
    if update_all and show.get('is_recurring'):
        # Update this show and all related occurrences
        parent_id = show.get('parent_show_id') or show_id
        
        # Update parent and all children
        await db.shows.update_many(
            {
                "team_id": current_user.get('team_id'),
                "$or": [
                    {"id": parent_id},
                    {"parent_show_id": parent_id}
                ]
            },
            {"$set": update_dict}
        )
    else:
        # Update only this show
        await db.shows.update_one(
            {"id": show_id},
            {"$set": update_dict}
        )
    
    updated_show = await db.shows.find_one({"id": show_id}, {"_id": 0})
    
    # Get studio name if exists
    if updated_show.get('studio_id'):
        studio = await db.studios.find_one({"id": updated_show['studio_id']}, {"_id": 0})
        if studio:
            updated_show['studio_name'] = studio['name']
    
    return updated_show


@shows_router.delete("/{show_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_show(
    show_id: str,
    delete_all: bool = Query(default=False, description="Delete all occurrences of recurring show"),
    current_user: dict = Depends(require_admin)
):
    """Delete a show. Admin only. For recurring shows, can delete just this one or all occurrences."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    if delete_all and show.get('is_recurring'):
        # Delete this show and all related occurrences
        parent_id = show.get('parent_show_id') or show_id
        
        # Get all show IDs to delete
        shows_to_delete = await db.shows.find(
            {
                "team_id": current_user.get('team_id'),
                "$or": [
                    {"id": parent_id},
                    {"parent_show_id": parent_id}
                ]
            },
            {"id": 1}
        ).to_list(1000)
        
        show_ids = [s['id'] for s in shows_to_delete]
        
        # Delete rundown items for all shows
        await db.rundown_items.delete_many({"show_id": {"$in": show_ids}})
        
        # Delete all shows
        await db.shows.delete_many(
            {
                "team_id": current_user.get('team_id'),
                "$or": [
                    {"id": parent_id},
                    {"parent_show_id": parent_id}
                ]
            }
        )
    else:
        # Delete only this show
        await db.shows.delete_one({"id": show_id})
        await db.rundown_items.delete_many({"show_id": show_id})


# ============== RECURRENCE SETTINGS ==============

@shows_router.put("/{show_id}/recurrence", response_model=ShowResponse)
async def update_recurrence_settings(
    show_id: str,
    recurrence_interval: Optional[int] = Query(None, ge=1, le=4, description="Repeat every N weeks"),
    recurrence_end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD or 'none' to clear"),
    current_user: dict = Depends(require_editor_or_admin)
):
    """Update recurrence settings for a recurring show (applies to all occurrences)."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    if not show.get('is_recurring'):
        raise HTTPException(status_code=400, detail="This show is not recurring")
    
    parent_id = show.get('parent_show_id') or show_id
    now = datetime.now(timezone.utc).isoformat()
    
    update_dict = {"updated_at": now}
    
    if recurrence_interval is not None:
        update_dict["recurrence_interval"] = recurrence_interval
    
    if recurrence_end_date is not None:
        if recurrence_end_date.lower() == 'none':
            update_dict["recurrence_end_date"] = None
        else:
            update_dict["recurrence_end_date"] = recurrence_end_date
    
    # Update all occurrences
    await db.shows.update_many(
        {
            "team_id": current_user.get('team_id'),
            "$or": [
                {"id": parent_id},
                {"parent_show_id": parent_id}
            ]
        },
        {"$set": update_dict}
    )
    
    updated_show = await db.shows.find_one({"id": show_id}, {"_id": 0})
    return updated_show


@shows_router.post("/{show_id}/stop-recurrence")
async def stop_recurrence(
    show_id: str,
    delete_future: bool = Query(default=True, description="Delete future occurrences"),
    current_user: dict = Depends(require_editor_or_admin)
):
    """Stop a recurring show from repeating. Optionally delete future occurrences."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    if not show.get('is_recurring'):
        raise HTTPException(status_code=400, detail="This show is not recurring")
    
    parent_id = show.get('parent_show_id') or show_id
    now = datetime.now(timezone.utc).isoformat()
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    current_show_deleted = False
    
    if delete_future:
        # Delete all future occurrences (keep past and today's)
        future_shows = await db.shows.find(
            {
                "team_id": current_user.get('team_id'),
                "date": {"$gt": today},
                "$or": [
                    {"id": parent_id},
                    {"parent_show_id": parent_id}
                ]
            },
            {"id": 1}
        ).to_list(1000)
        
        future_ids = [s['id'] for s in future_shows]
        
        # Check if current show will be deleted
        if show_id in future_ids:
            current_show_deleted = True
        
        if future_ids:
            await db.rundown_items.delete_many({"show_id": {"$in": future_ids}})
            await db.shows.delete_many({"id": {"$in": future_ids}})
    
    # Mark all remaining occurrences as non-recurring
    await db.shows.update_many(
        {
            "team_id": current_user.get('team_id'),
            "$or": [
                {"id": parent_id},
                {"parent_show_id": parent_id}
            ]
        },
        {
            "$set": {
                "is_recurring": False,
                "recurrence_type": "none",
                "recurrence_interval": 1,
                "recurrence_end_date": None,
                "parent_show_id": None,
                "updated_at": now
            }
        }
    )
    
    if current_show_deleted:
        # Return a special response indicating the show was deleted
        return {"deleted": True, "message": "This show was a future occurrence and has been deleted"}
    
    updated_show = await db.shows.find_one({"id": show_id}, {"_id": 0})
    if updated_show:
        updated_show["deleted"] = False
        return updated_show
    
    return {"deleted": True, "message": "Show not found after update"}


@shows_router.post("/{show_id}/enable-recurrence", response_model=ShowResponse)
async def enable_recurrence(
    show_id: str,
    recurrence_interval: int = Query(1, ge=1, le=4, description="Repeat every N weeks"),
    recurrence_end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD or None for 1 year"),
    current_user: dict = Depends(require_editor_or_admin)
):
    """Convert a non-recurring show into a recurring show and generate future occurrences."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    if show.get('is_recurring'):
        raise HTTPException(status_code=400, detail="This show is already recurring")
    
    now = datetime.now(timezone.utc).isoformat()
    team_id = current_user.get('team_id')
    
    # This show becomes the parent
    parent_id = show_id
    
    # Update the original show to be the parent of the recurring series
    await db.shows.update_one(
        {"id": show_id},
        {
            "$set": {
                "is_recurring": True,
                "recurrence_type": "weekly",
                "recurrence_interval": recurrence_interval,
                "recurrence_end_date": recurrence_end_date,
                "parent_show_id": None,
                "updated_at": now
            }
        }
    )
    
    # Generate future occurrence dates (skip the first one as it's the original show)
    all_dates = generate_occurrence_dates(
        show['date'], 
        recurrence_interval, 
        recurrence_end_date
    )
    future_dates = all_dates[1:]  # Skip the original show's date
    
    # Create future occurrences
    if future_dates:
        child_docs = []
        for date in future_dates:
            child_doc = {
                "id": str(uuid.uuid4()),
                "title": show['title'],
                "description": show.get('description', ''),
                "date": date,
                "start_time": show['start_time'],
                "end_time": show['end_time'],
                "status": show.get('status', 'draft'),
                "editor_id": show.get('editor_id'),
                "team_id": team_id,
                "created_at": now,
                "updated_at": now,
                "recurrence_type": "weekly",
                "recurrence_interval": recurrence_interval,
                "recurrence_end_date": recurrence_end_date,
                "parent_show_id": parent_id,
                "is_recurring": True
            }
            child_docs.append(child_doc)
        
        if child_docs:
            await db.shows.insert_many(child_docs)
    
    updated_show = await db.shows.find_one({"id": show_id}, {"_id": 0})
    return updated_show


# ============== RUNDOWN ROUTES ==============

@shows_router.get("/{show_id}/rundown", response_model=List[RundownItemResponse])
async def get_rundown(
    show_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get rundown items for a show."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    items = await db.rundown_items.find(
        {"show_id": show_id},
        {"_id": 0}
    ).sort("order", 1).to_list(1000)
    return items


@shows_router.post("/{show_id}/rundown", response_model=RundownItemResponse, status_code=status.HTTP_201_CREATED)
async def create_rundown_item(
    show_id: str,
    item_data: RundownItemCreate,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Add a rundown item (editor or admin only)."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    last_item = await db.rundown_items.find_one(
        {"show_id": show_id},
        sort=[("order", -1)]
    )
    next_order = (last_item['order'] + 1) if last_item else 0
    
    item_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    item_doc = {
        "id": item_id,
        "show_id": show_id,
        "type": item_data.type,
        "title": item_data.title,
        "notes": item_data.notes or "",
        "duration": item_data.duration or "",
        "order": next_order,
        "created_at": now
    }
    
    await db.rundown_items.insert_one(item_doc)
    item_doc.pop('_id', None)
    
    # Broadcast WebSocket event for legacy shows
    await ws_manager.broadcast(f"show_{show_id}", {
        "type": "item_created",
        "item": item_doc,
        "user": {"id": current_user['id'], "name": current_user.get('name')}
    })
    
    return item_doc


@shows_router.put("/{show_id}/rundown/reorder", response_model=List[RundownItemResponse])
async def reorder_rundown(
    show_id: str,
    reorder_data: ReorderRequest,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Reorder rundown items (editor or admin only)."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    for index, item_id in enumerate(reorder_data.item_ids):
        await db.rundown_items.update_one(
            {"id": item_id, "show_id": show_id},
            {"$set": {"order": index}}
        )
    
    items = await db.rundown_items.find(
        {"show_id": show_id},
        {"_id": 0}
    ).sort("order", 1).to_list(1000)
    
    # Broadcast WebSocket event for legacy shows
    await ws_manager.broadcast(f"show_{show_id}", {
        "type": "items_reordered",
        "item_ids": reorder_data.item_ids,
        "items": items,
        "user": {"id": current_user['id'], "name": current_user.get('name')}
    })
    
    return items


@shows_router.put("/{show_id}/rundown/{item_id}", response_model=RundownItemResponse)
async def update_rundown_item(
    show_id: str,
    item_id: str,
    item_data: RundownItemUpdate,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Update a rundown item (editor or admin only)."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    item = await db.rundown_items.find_one({"id": item_id, "show_id": show_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    update_dict = {k: v for k, v in item_data.model_dump().items() if v is not None}
    
    if update_dict:
        await db.rundown_items.update_one(
            {"id": item_id},
            {"$set": update_dict}
        )
    
    updated_item = await db.rundown_items.find_one({"id": item_id}, {"_id": 0})
    
    # Broadcast WebSocket event for legacy shows
    await ws_manager.broadcast(f"show_{show_id}", {
        "type": "item_updated",
        "item": updated_item,
        "user": {"id": current_user['id'], "name": current_user.get('name')}
    })
    
    return updated_item


@shows_router.delete("/{show_id}/rundown/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rundown_item(
    show_id: str,
    item_id: str,
    current_user: dict = Depends(require_admin)
):
    """Delete a rundown item. Admin only."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    result = await db.rundown_items.delete_one({"id": item_id, "show_id": show_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Broadcast WebSocket event for legacy shows
    await ws_manager.broadcast(f"show_{show_id}", {
        "type": "item_deleted",
        "item_id": item_id,
        "user": {"id": current_user['id'], "name": current_user.get('name')}
    })


# ============== SHOW RUNDOWN PRINT VIEW ==============

@shows_router.get("/{show_id}/rundown/print", response_class=HTMLResponse)
async def get_show_rundown_print_view(
    show_id: str,
    token: Optional[str] = None
):
    """Get print-friendly HTML view of a show's rundown. Supports token in query param."""
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user_id = payload.get("user_id")
            current_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
            if not current_user:
                raise HTTPException(status_code=401, detail="Invalid token")
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")
    else:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')},
        {"_id": 0}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    items = await db.rundown_items.find(
        {"show_id": show_id},
        {"_id": 0}
    ).sort("order", 1).to_list(1000)
    
    for item in items:
        media_attachments = await db.rundown_item_media.find(
            {"rundown_item_id": item["id"]},
            {"_id": 0}
        ).to_list(100)
        
        item["media"] = []
        for attachment in media_attachments:
            asset = await db.media_assets.find_one(
                {"id": attachment["media_asset_id"]},
                {"_id": 0}
            )
            if asset:
                item["media"].append(asset)
    
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    
    status_labels = {
        "draft": "Draft",
        "scheduled": "Scheduled",
        "completed": "Completed"
    }
    
    items_html = ""
    for idx, item in enumerate(items, 1):
        media_html = ""
        if item.get("media"):
            media_links = ", ".join([f'{m["title"]} ({m["kind"]})' for m in item["media"]])
            media_html = f'<div class="media-attachments">📎 {media_links}</div>'
        
        notes_html = item.get("notes", "").replace("\n", "<br>") if item.get("notes") else "-"
        
        items_html += f'''
        <tr>
            <td class="order">{idx}</td>
            <td class="type"><span class="type-badge">{item.get("type", "-").upper()}</span></td>
            <td class="title">{item.get("title", "-")}</td>
            <td class="duration">{item.get("duration") or "-"}</td>
            <td class="notes">{notes_html}{media_html}</td>
        </tr>
        '''
    
    html = generate_print_html(show, items_html, now, status_labels)
    return HTMLResponse(content=html)


# ============== RUNDOWN-CONTENT ATTACHMENT ==============

@shows_router.get("/{show_id}/rundown/{item_id}/content", response_model=List[ContentItemResponse])
async def get_rundown_item_content(
    show_id: str,
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get content items attached to a rundown item."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    item = await db.rundown_items.find_one({"id": item_id, "show_id": show_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    content_ids = item.get("content_ids", [])
    if not content_ids:
        return []
    
    content_items = []
    for cid in content_ids:
        content = await get_content_with_publish_statuses(cid, current_user.get('team_id'))
        if content:
            content_items.append(content)
    
    return content_items


@shows_router.put("/{show_id}/rundown/{item_id}/content")
async def attach_content_to_rundown(
    show_id: str,
    item_id: str,
    attach_data: AttachContentRequest,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Attach content items to a rundown item."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    item = await db.rundown_items.find_one({"id": item_id, "show_id": show_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    for content_id in attach_data.content_ids:
        content = await db.content_items.find_one(
            {"id": content_id, "team_id": current_user.get('team_id')}
        )
        if not content:
            raise HTTPException(status_code=404, detail=f"Content item {content_id} not found")
    
    await db.rundown_items.update_one(
        {"id": item_id},
        {"$set": {"content_ids": attach_data.content_ids}}
    )
    
    updated_item = await db.rundown_items.find_one({"id": item_id}, {"_id": 0})
    return updated_item


# ============== SHOW MEDIA ATTACHMENTS ==============

@shows_router.get("/{show_id}/media", response_model=List[RundownItemMediaResponse])
async def get_show_media(
    show_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all media attached to a show."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    attachments = await db.show_media.find(
        {"show_id": show_id},
        {"_id": 0}
    ).to_list(100)
    
    result = []
    for att in attachments:
        asset = await db.media_assets.find_one(
            {"id": att["media_asset_id"]},
            {"_id": 0}
        )
        if asset:
            uploader = await db.users.find_one({"id": asset.get("uploaded_by")}, {"_id": 0})
            asset["uploaded_by_name"] = uploader.get("name") if uploader else "Unknown"
        att["media_asset"] = asset
        result.append(att)
    
    return result


@shows_router.post("/{show_id}/media", response_model=List[RundownItemMediaResponse])
async def attach_media_to_show(
    show_id: str,
    attach_data: AttachMediaRequest,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Attach media assets to a show."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    for asset_id in attach_data.media_asset_ids:
        asset = await db.media_assets.find_one(
            {"id": asset_id, "team_id": current_user.get('team_id')}
        )
        if not asset:
            continue
        
        existing = await db.show_media.find_one({
            "show_id": show_id,
            "media_asset_id": asset_id
        })
        if existing:
            continue
        
        await db.show_media.insert_one({
            "id": str(uuid.uuid4()),
            "show_id": show_id,
            "media_asset_id": asset_id,
            "created_at": now
        })
    
    return await get_show_media(show_id, current_user)


@shows_router.delete("/{show_id}/media/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def detach_media_from_show(
    show_id: str,
    asset_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Detach a media asset from a show."""
    result = await db.show_media.delete_one({
        "show_id": show_id,
        "media_asset_id": asset_id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Attachment not found")


# ============== RUNDOWN ITEM MEDIA ==============

@shows_router.get("/{show_id}/rundown/{item_id}/media", response_model=List[RundownItemMediaResponse])
async def get_rundown_item_media(
    show_id: str,
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get media attached to a rundown item."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    item = await db.rundown_items.find_one({"id": item_id, "show_id": show_id})
    if not item:
        raise HTTPException(status_code=404, detail="Rundown item not found")
    
    attachments = await db.rundown_item_media.find(
        {"rundown_item_id": item_id},
        {"_id": 0}
    ).to_list(100)
    
    result = []
    for att in attachments:
        asset = await db.media_assets.find_one(
            {"id": att["media_asset_id"]},
            {"_id": 0}
        )
        if asset:
            uploader = await db.users.find_one({"id": asset.get("uploaded_by")}, {"_id": 0})
            asset["uploaded_by_name"] = uploader.get("name") if uploader else "Unknown"
        att["media_asset"] = asset
        result.append(att)
    
    return result


@shows_router.post("/{show_id}/rundown/{item_id}/media", response_model=List[RundownItemMediaResponse])
async def attach_media_to_rundown_item(
    show_id: str,
    item_id: str,
    attach_data: AttachMediaRequest,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Attach media assets to a rundown item."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    item = await db.rundown_items.find_one({"id": item_id, "show_id": show_id})
    if not item:
        raise HTTPException(status_code=404, detail="Rundown item not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    for asset_id in attach_data.media_asset_ids:
        asset = await db.media_assets.find_one(
            {"id": asset_id, "team_id": current_user.get('team_id')}
        )
        if not asset:
            continue
        
        existing = await db.rundown_item_media.find_one({
            "rundown_item_id": item_id,
            "media_asset_id": asset_id
        })
        if existing:
            continue
        
        await db.rundown_item_media.insert_one({
            "id": str(uuid.uuid4()),
            "rundown_item_id": item_id,
            "media_asset_id": asset_id,
            "created_at": now
        })
    
    return await get_rundown_item_media(show_id, item_id, current_user)


@shows_router.delete("/{show_id}/rundown/{item_id}/media/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def detach_media_from_rundown_item(
    show_id: str,
    item_id: str,
    asset_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Detach a media asset from a rundown item."""
    result = await db.rundown_item_media.delete_one({
        "rundown_item_id": item_id,
        "media_asset_id": asset_id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Attachment not found")


def generate_print_html(show: dict, items_html: str, now: str, status_labels: dict) -> str:
    """Generate print-friendly HTML for rundown."""
    return f'''
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Rundown - {show.get("title", "Untitled")}</title>
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 12pt; line-height: 1.5; color: #1a1a1a; background: white; padding: 20mm;
            }}
            .header {{ border-bottom: 3px solid #e11d48; padding-bottom: 20px; margin-bottom: 30px; }}
            .show-title {{ font-size: 24pt; font-weight: bold; margin-bottom: 8px; }}
            .show-meta {{ display: flex; gap: 30px; font-size: 11pt; color: #444; }}
            .show-meta span {{ display: flex; align-items: center; gap: 6px; }}
            .status-badge {{ display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 10pt; font-weight: 600; text-transform: uppercase; }}
            .status-draft {{ background: #f4f4f5; color: #71717a; }}
            .status-scheduled {{ background: #fef3c7; color: #d97706; }}
            .status-completed {{ background: #dcfce7; color: #16a34a; }}
            .rundown-table {{ width: 100%; border-collapse: collapse; margin-top: 20px; }}
            .rundown-table th {{ background: #f8fafc; padding: 12px 10px; text-align: left; font-weight: 600; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 2px solid #e2e8f0; }}
            .rundown-table td {{ padding: 12px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }}
            .rundown-table tr:last-child td {{ border-bottom: none; }}
            .order {{ width: 40px; text-align: center; font-weight: 600; color: #e11d48; }}
            .type {{ width: 80px; }}
            .type-badge {{ display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 9pt; font-weight: 600; background: #fce7f3; color: #be185d; }}
            .title {{ width: 180px; font-weight: 500; }}
            .duration {{ width: 80px; text-align: center; color: #64748b; }}
            .notes {{ font-size: 11pt; color: #475569; }}
            .media-attachments {{ margin-top: 8px; font-size: 10pt; color: #0891b2; }}
            .footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 10pt; color: #94a3b8; display: flex; justify-content: space-between; }}
            @media print {{
                body {{ padding: 10mm; }}
                .header {{ page-break-after: avoid; }}
                .rundown-table {{ page-break-inside: auto; }}
                .rundown-table tr {{ page-break-inside: avoid; page-break-after: auto; }}
                @page {{ size: A4; margin: 15mm; }}
                .no-print {{ display: none; }}
            }}
            .no-print {{ margin-bottom: 20px; }}
            .print-button {{ background: #e11d48; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 500; }}
            .print-button:hover {{ background: #be123c; }}
        </style>
    </head>
    <body>
        <div class="no-print">
            <button class="print-button" onclick="window.print()">🖨️ Print Rundown</button>
        </div>
        <div class="header">
            <h1 class="show-title">{show.get("title", "Untitled Show")}</h1>
            <div class="show-meta">
                <span>📅 {show.get("date", "-")}</span>
                <span>🕐 {show.get("start_time", "-")} - {show.get("end_time", "-")}</span>
                <span class="status-badge status-{show.get("status", "draft")}">{status_labels.get(show.get("status", "draft"), "Draft")}</span>
            </div>
        </div>
        <table class="rundown-table">
            <thead>
                <tr><th>#</th><th>Type</th><th>Title</th><th>Duration</th><th>Notes / Script</th></tr>
            </thead>
            <tbody>
                {items_html if items_html else '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:40px;">No rundown items</td></tr>'}
            </tbody>
        </table>
        <div class="footer">
            <span>Generated: {now}</span>
            <span>Radio Show Planner</span>
        </div>
    </body>
    </html>
    '''
