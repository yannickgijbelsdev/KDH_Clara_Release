"""ProRadio sync management routes."""
from fastapi import APIRouter, HTTPException, Depends, Query, Request, BackgroundTasks
from typing import Optional, List
from datetime import datetime, timezone
import logging

from database import db
from services.auth import get_current_user, require_admin
from services.main_site_context import get_main_site_id_from_header
from services.proradio_service import (
    sync_show_to_proradio,
    sync_shows_for_date,
    get_wordpress_credentials,
    STATION_CONFIG
)

logger = logging.getLogger(__name__)

proradio_router = APIRouter(prefix="/proradio", tags=["ProRadio"])


@proradio_router.get("/status")
async def get_proradio_status(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Get ProRadio sync status and WordPress connection info."""
    main_site_id = await get_main_site_id_from_header(request)
    
    result = {
        "stations": {},
        "sync_records_count": 0,
        "last_sync": None
    }
    
    # Check credentials for each station
    for station in ["mfy", "grk"]:
        creds = await get_wordpress_credentials(station, main_site_id)
        result["stations"][station] = {
            "configured": creds is not None,
            "wp_url": STATION_CONFIG[station]["wp_url"]
        }
    
    # Get sync statistics
    query = {}
    if main_site_id:
        query["main_site_id"] = main_site_id
    
    result["sync_records_count"] = await db.proradio_sync.count_documents(query)
    
    # Get last sync time
    last_sync = await db.proradio_sync.find_one(
        query,
        sort=[("synced_at", -1)]
    )
    if last_sync:
        result["last_sync"] = last_sync.get("synced_at")
    
    return result


@proradio_router.post("/sync/show/{show_id}")
async def sync_single_show(
    show_id: str,
    request: Request,
    current_user: dict = Depends(require_admin)
):
    """Manually sync a single show to ProRadio."""
    main_site_id = await get_main_site_id_from_header(request)
    team_id = current_user.get('team_id', '')
    
    # Get the show
    if main_site_id:
        show = await db.shows.find_one({"id": show_id, "main_site_id": main_site_id}, {"_id": 0})
    else:
        show = await db.shows.find_one({"id": show_id, "team_id": team_id}, {"_id": 0})
    
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    # Sync to ProRadio
    result = await sync_show_to_proradio(show, main_site_id, team_id)
    
    return {
        "show_id": show_id,
        "show_title": show.get("title"),
        "date": show.get("date"),
        "result": result
    }


@proradio_router.post("/sync/date/{date_str}")
async def sync_shows_by_date(
    date_str: str,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_admin)
):
    """Sync all shows for a specific date to ProRadio."""
    main_site_id = await get_main_site_id_from_header(request)
    team_id = current_user.get('team_id', '')
    
    # Validate date format
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Run sync
    result = await sync_shows_for_date(date_str, main_site_id, team_id)
    
    return result


@proradio_router.post("/sync/week")
async def sync_shows_for_week(
    request: Request,
    background_tasks: BackgroundTasks,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    current_user: dict = Depends(require_admin)
):
    """Sync all shows for a week starting from the given date."""
    main_site_id = await get_main_site_id_from_header(request)
    team_id = current_user.get('team_id', '')
    
    # Validate date format
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    results = []
    
    # Sync each day of the week
    from datetime import timedelta
    for i in range(7):
        date_str = (start + timedelta(days=i)).strftime("%Y-%m-%d")
        day_result = await sync_shows_for_date(date_str, main_site_id, team_id)
        results.append(day_result)
    
    # Calculate totals
    totals = {
        "total_shows": sum(r["total"] for r in results),
        "synced": sum(r["synced"] for r in results),
        "skipped": sum(r["skipped"] for r in results),
        "errors": sum(r["errors"] for r in results),
        "days": results
    }
    
    return totals


@proradio_router.get("/sync/history")
async def get_sync_history(
    request: Request,
    limit: int = Query(default=50, le=200),
    current_user: dict = Depends(get_current_user)
):
    """Get ProRadio sync history."""
    main_site_id = await get_main_site_id_from_header(request)
    
    query = {}
    if main_site_id:
        query["main_site_id"] = main_site_id
    
    records = await db.proradio_sync.find(
        query,
        {"_id": 0}
    ).sort("synced_at", -1).limit(limit).to_list(limit)
    
    return records


@proradio_router.delete("/sync/clear")
async def clear_sync_records(
    request: Request,
    station: Optional[str] = Query(default=None, description="Clear only for specific station (mfy/grk)"),
    current_user: dict = Depends(require_admin)
):
    """Clear ProRadio sync records. This does not delete shows from WordPress."""
    main_site_id = await get_main_site_id_from_header(request)
    
    query = {}
    if main_site_id:
        query["main_site_id"] = main_site_id
    if station:
        query["station"] = station
    
    result = await db.proradio_sync.delete_many(query)
    
    return {
        "deleted_count": result.deleted_count,
        "station_filter": station
    }
