"""Show and rundown management routes."""
from fastapi import APIRouter, HTTPException, Depends, status, Query
from fastapi.responses import HTMLResponse
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import jwt

from database import db, JWT_SECRET
from models.shows import (
    ShowCreate, ShowUpdate, ShowResponse,
    RundownItemCreate, RundownItemUpdate, RundownItemResponse,
    ReorderRequest, AttachContentRequest, DeleteShowRequest,
    ShowTitleCreate, ShowTitleUpdate, ShowTitleResponse,
    StudioCreate, StudioUpdate, StudioResponse
)
from models.content import ContentItemResponse
from models.media import AttachMediaRequest, RundownItemMediaResponse, MediaAssetResponse
from services.auth import get_current_user, require_editor_or_admin, require_admin
from services.websocket import ws_manager
from services.helpers import get_content_with_publish_statuses

shows_router = APIRouter(prefix="/shows", tags=["Shows"])


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

@shows_router.get("/titles", response_model=List[ShowTitleResponse])
async def get_show_titles(
    current_user: dict = Depends(get_current_user)
):
    """Get all show titles for the team. Available to all users."""
    titles = await db.show_titles.find(
        {"team_id": current_user.get('team_id')},
        {"_id": 0}
    ).sort("name", 1).to_list(100)
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
        "team_id": current_user.get('team_id'),
        "created_by": current_user['id'],
        "created_at": now
    }
    
    await db.show_titles.insert_one(title_doc)
    title_doc.pop('_id', None)
    return title_doc


@shows_router.put("/titles/{title_id}", response_model=ShowTitleResponse)
async def update_show_title(
    title_id: str,
    title_data: ShowTitleUpdate,
    current_user: dict = Depends(require_admin)
):
    """Update a show title. Admin only."""
    title = await db.show_titles.find_one({
        "id": title_id,
        "team_id": current_user.get('team_id')
    })
    if not title:
        raise HTTPException(status_code=404, detail="Show title not found")
    
    update_dict = {k: v for k, v in title_data.model_dump().items() if v is not None}
    
    if "name" in update_dict:
        existing = await db.show_titles.find_one({
            "team_id": current_user.get('team_id'),
            "name": {"$regex": f"^{update_dict['name']}$", "$options": "i"},
            "id": {"$ne": title_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="A show title with this name already exists")
    
    if update_dict:
        await db.show_titles.update_one(
            {"id": title_id},
            {"$set": update_dict}
        )
    
    updated = await db.show_titles.find_one({"id": title_id}, {"_id": 0})
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
    
    for show in shows:
        if show.get('studio_id'):
            show['studio_name'] = studios_map.get(show['studio_id'])
    
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
    return updated_show


@shows_router.delete("/{show_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_show(
    show_id: str,
    delete_all: bool = Query(default=False, description="Delete all occurrences of recurring show"),
    current_user: dict = Depends(require_editor_or_admin)
):
    """Delete a show. For recurring shows, can delete just this one or all occurrences."""
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
    current_user: dict = Depends(require_editor_or_admin)
):
    """Delete a rundown item (editor or admin only)."""
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
