"""Show series and recurring shows routes."""
from fastapi import APIRouter, HTTPException, Depends, status
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from database import db
from models.series import (
    ShowSeriesCreate, ShowSeriesUpdate, ShowSeriesResponse,
    ShowOccurrenceResponse, GenerateOccurrencesRequest
)
from models.assignments import ShowAssignmentCreate, ShowAssignmentResponse
from services.auth import get_current_user, require_admin
from services.helpers import parse_rrule, generate_dates_from_recurrence

series_router = APIRouter(prefix="/series", tags=["Show Series"])


@series_router.get("", response_model=List[ShowSeriesResponse])
async def get_show_series(
    current_user: dict = Depends(get_current_user)
):
    """Get all show series for the team."""
    series_list = await db.show_series.find(
        {"team_id": current_user.get('team_id')},
        {"_id": 0}
    ).sort("title", 1).to_list(1000)
    return series_list


@series_router.post("", response_model=ShowSeriesResponse, status_code=status.HTTP_201_CREATED)
async def create_show_series(
    series_data: ShowSeriesCreate,
    current_user: dict = Depends(require_admin)
):
    """Create a new show series (admin only)."""
    series_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    series_doc = {
        "id": series_id,
        "team_id": current_user.get('team_id'),
        "title": series_data.title,
        "description": series_data.description or "",
        "default_start_time": series_data.default_start_time,
        "default_end_time": series_data.default_end_time,
        "recurrence_rule": series_data.recurrence_rule,
        "is_active": series_data.is_active,
        "created_by": current_user['id'],
        "created_at": now,
        "updated_at": now,
        "recurrence_type": series_data.recurrence_type or "weekly",
        "start_date": series_data.start_date,
        "end_date": series_data.end_date,
        "interval_weeks": series_data.interval_weeks or 1,
        "days_of_week": series_data.days_of_week
    }
    
    await db.show_series.insert_one(series_doc)
    series_doc.pop("_id", None)
    return series_doc


@series_router.get("/{series_id}", response_model=ShowSeriesResponse)
async def get_show_series_detail(
    series_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single show series."""
    series = await db.show_series.find_one(
        {"id": series_id, "team_id": current_user.get('team_id')},
        {"_id": 0}
    )
    if not series:
        raise HTTPException(status_code=404, detail="Show series not found")
    return series


@series_router.put("/{series_id}", response_model=ShowSeriesResponse)
async def update_show_series(
    series_id: str,
    series_data: ShowSeriesUpdate,
    current_user: dict = Depends(require_admin)
):
    """Update a show series (admin only)."""
    series = await db.show_series.find_one(
        {"id": series_id, "team_id": current_user.get('team_id')}
    )
    if not series:
        raise HTTPException(status_code=404, detail="Show series not found")
    
    update_dict = {k: v for k, v in series_data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.show_series.update_one(
        {"id": series_id},
        {"$set": update_dict}
    )
    
    updated = await db.show_series.find_one({"id": series_id}, {"_id": 0})
    return updated


@series_router.delete("/{series_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_show_series(
    series_id: str,
    current_user: dict = Depends(require_admin)
):
    """Delete a show series and all its occurrences (admin only)."""
    result = await db.show_series.delete_one(
        {"id": series_id, "team_id": current_user.get('team_id')}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Show series not found")
    
    occurrences = await db.show_occurrences.find({"show_series_id": series_id}).to_list(1000)
    for occ in occurrences:
        await db.rundowns.delete_many({"occurrence_id": occ["id"]})
        await db.rundown_items_v2.delete_many({"occurrence_id": occ["id"]})
    await db.show_occurrences.delete_many({"show_series_id": series_id})
    await db.series_assignments.delete_many({"series_id": series_id})


@series_router.post("/{series_id}/generate", response_model=List[ShowOccurrenceResponse])
async def generate_occurrences(
    series_id: str,
    gen_data: GenerateOccurrencesRequest,
    current_user: dict = Depends(require_admin)
):
    """Generate occurrences for a show series (admin only)."""
    series = await db.show_series.find_one(
        {"id": series_id, "team_id": current_user.get('team_id')}
    )
    if not series:
        raise HTTPException(status_code=404, detail="Show series not found")
    
    existing_occs = await db.show_occurrences.find(
        {"show_series_id": series_id},
        {"date": 1}
    ).to_list(1000)
    existing_dates = set(occ.get("date") for occ in existing_occs)
    
    days_of_week = series.get('days_of_week')
    start_date = series.get('start_date')
    recurrence_type = series.get('recurrence_type', 'weekly')
    
    if days_of_week and start_date:
        dates = generate_dates_from_recurrence(
            recurrence_type=recurrence_type,
            start_date=start_date,
            end_date=series.get('end_date'),
            interval_weeks=series.get('interval_weeks', 1),
            days_of_week=days_of_week,
            weeks_ahead=gen_data.weeks_ahead
        )
    else:
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        dates = parse_rrule(
            series.get('recurrence_rule', ''),
            today,
            gen_data.weeks_ahead
        )
    
    created_occurrences = []
    now = datetime.now(timezone.utc).isoformat()
    
    for date in dates:
        if date in existing_dates:
            continue
        
        occ_id = str(uuid.uuid4())
        rundown_id = str(uuid.uuid4())
        
        occ_doc = {
            "id": occ_id,
            "team_id": current_user.get('team_id'),
            "show_series_id": series_id,
            "title": series['title'],
            "date": date,
            "start_time": series['default_start_time'],
            "end_time": series['default_end_time'],
            "status": "draft",
            "rundown_id": rundown_id,
            "created_at": now,
            "updated_at": now
        }
        
        rundown_doc = {
            "id": rundown_id,
            "occurrence_id": occ_id,
            "created_at": now,
            "updated_at": now
        }
        
        await db.show_occurrences.insert_one(occ_doc)
        await db.rundowns.insert_one(rundown_doc)
        
        occ_doc.pop("_id", None)
        created_occurrences.append(occ_doc)
    
    return created_occurrences


# Series Assignments
@series_router.get("/{series_id}/assignments", response_model=List[ShowAssignmentResponse])
async def get_series_assignments(
    series_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all users assigned to a series."""
    series = await db.show_series.find_one(
        {"id": series_id, "team_id": current_user.get('team_id')}
    )
    if not series:
        raise HTTPException(status_code=404, detail="Show series not found")
    
    assignments = await db.series_assignments.find(
        {"series_id": series_id},
        {"_id": 0}
    ).to_list(100)
    
    for assignment in assignments:
        user = await db.users.find_one({"id": assignment["user_id"]}, {"_id": 0})
        if user:
            assignment["user_name"] = user.get("name")
            assignment["user_email"] = user.get("email")
        assignment["show_id"] = series_id
    
    return assignments


@series_router.post("/{series_id}/assignments", response_model=ShowAssignmentResponse)
async def create_series_assignment(
    series_id: str,
    assignment_data: ShowAssignmentCreate,
    current_user: dict = Depends(require_admin)
):
    """Assign a user to a series (admin only)."""
    series = await db.show_series.find_one(
        {"id": series_id, "team_id": current_user.get('team_id')}
    )
    if not series:
        raise HTTPException(status_code=404, detail="Show series not found")
    
    user = await db.users.find_one(
        {"id": assignment_data.user_id, "team_id": current_user.get('team_id')}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    existing = await db.series_assignments.find_one({
        "series_id": series_id,
        "user_id": assignment_data.user_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="User already assigned to this series")
    
    now = datetime.now(timezone.utc).isoformat()
    assignment_doc = {
        "id": str(uuid.uuid4()),
        "series_id": series_id,
        "user_id": assignment_data.user_id,
        "role_on_show": assignment_data.role_on_show,
        "created_at": now
    }
    
    await db.series_assignments.insert_one(assignment_doc)
    assignment_doc.pop("_id", None)
    assignment_doc["show_id"] = series_id
    assignment_doc["user_name"] = user.get("name")
    assignment_doc["user_email"] = user.get("email")
    
    return assignment_doc


@series_router.delete("/{series_id}/assignments/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_series_assignment(
    series_id: str,
    user_id: str,
    current_user: dict = Depends(require_admin)
):
    """Remove a user assignment from a series (admin only)."""
    result = await db.series_assignments.delete_one({
        "series_id": series_id,
        "user_id": user_id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")



# ============== BULK ASSIGNMENT CHANGES ==============

from pydantic import BaseModel
from typing import Literal

class BulkAssignmentRequest(BaseModel):
    user_id: str
    role_on_show: str = "presenter"
    apply_to: Literal["this_only", "all_future", "all"] = "this_only"


@series_router.post("/{series_id}/assignments/bulk", response_model=dict)
async def bulk_assign_to_series(
    series_id: str,
    assignment_data: BulkAssignmentRequest,
    current_user: dict = Depends(require_admin)
):
    """
    Assign a user to a series with options for how to apply.
    - this_only: Only add to series assignment (new occurrences will inherit)
    - all_future: Add to series + all future occurrence assignments  
    - all: Add to series + all occurrence assignments (past & future)
    """
    series = await db.show_series.find_one(
        {"id": series_id, "team_id": current_user.get('team_id')}
    )
    if not series:
        raise HTTPException(status_code=404, detail="Show series not found")
    
    user = await db.users.find_one(
        {"id": assignment_data.user_id, "team_id": current_user.get('team_id')}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    now = datetime.now(timezone.utc).isoformat()
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    # Always create/update series assignment
    existing_series = await db.series_assignments.find_one({
        "series_id": series_id,
        "user_id": assignment_data.user_id
    })
    
    if not existing_series:
        series_assignment_doc = {
            "id": str(uuid.uuid4()),
            "series_id": series_id,
            "user_id": assignment_data.user_id,
            "role_on_show": assignment_data.role_on_show,
            "created_at": now
        }
        await db.series_assignments.insert_one(series_assignment_doc)
    
    occurrences_updated = 0
    
    if assignment_data.apply_to in ["all_future", "all"]:
        # Get occurrences to update
        occ_query = {"show_series_id": series_id}
        
        if assignment_data.apply_to == "all_future":
            occ_query["date"] = {"$gte": today}
        
        occurrences = await db.show_occurrences.find(
            occ_query,
            {"id": 1}
        ).to_list(1000)
        
        for occ in occurrences:
            # Check if assignment already exists
            existing_occ = await db.occurrence_assignments.find_one({
                "occurrence_id": occ["id"],
                "user_id": assignment_data.user_id
            })
            
            if not existing_occ:
                occ_assignment_doc = {
                    "id": str(uuid.uuid4()),
                    "occurrence_id": occ["id"],
                    "user_id": assignment_data.user_id,
                    "role_on_show": assignment_data.role_on_show,
                    "created_at": now
                }
                await db.occurrence_assignments.insert_one(occ_assignment_doc)
                occurrences_updated += 1
    
    return {
        "message": "Assignment created",
        "series_assigned": not existing_series,
        "occurrences_updated": occurrences_updated
    }


@series_router.delete("/{series_id}/assignments/{user_id}/bulk")
async def bulk_remove_assignment(
    series_id: str,
    user_id: str,
    apply_to: Literal["this_only", "all_future", "all"] = "this_only",
    current_user: dict = Depends(require_admin)
):
    """
    Remove a user assignment from a series with options.
    - this_only: Only remove from series (occurrences keep their assignments)
    - all_future: Remove from series + all future occurrences
    - all: Remove from series + all occurrences
    """
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    # Remove series assignment
    series_result = await db.series_assignments.delete_one({
        "series_id": series_id,
        "user_id": user_id
    })
    
    occurrences_updated = 0
    
    if apply_to in ["all_future", "all"]:
        # Get occurrences
        occ_query = {"show_series_id": series_id}
        
        if apply_to == "all_future":
            occ_query["date"] = {"$gte": today}
        
        occurrences = await db.show_occurrences.find(
            occ_query,
            {"id": 1}
        ).to_list(1000)
        
        occ_ids = [occ["id"] for occ in occurrences]
        
        if occ_ids:
            result = await db.occurrence_assignments.delete_many({
                "occurrence_id": {"$in": occ_ids},
                "user_id": user_id
            })
            occurrences_updated = result.deleted_count
    
    return {
        "message": "Assignment removed",
        "series_removed": series_result.deleted_count > 0,
        "occurrences_updated": occurrences_updated
    }
