"""Public schedule API endpoints for WordPress integration."""
from fastapi import APIRouter, Query, Request
from typing import Optional
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import logging

from database import db
from services.timezone_utils import BRUSSELS_TZ, now_brussels, WEEKDAY_NAMES_NL

logger = logging.getLogger(__name__)

public_schedule_router = APIRouter(prefix="/public", tags=["Public Schedule"])


async def get_shows_for_week(main_site_id: str, station: str) -> dict:
    """Get all shows for the current week grouped by day.
    
    Args:
        main_site_id: Main site ID for context
        station: 'mfy', 'grk', or 'both'
        
    Returns:
        Dict with day names as keys and list of shows as values
        
    ALL times are in Brussels timezone (Europe/Brussels).
    """
    # Calculate date range for current week (Monday to Sunday)
    today = now_brussels().date()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    
    # Build query for shows in this date range
    query = {
        "main_site_id": main_site_id,
        "date": {
            "$gte": monday.strftime("%Y-%m-%d"),
            "$lte": sunday.strftime("%Y-%m-%d")
        }
    }
    
    # Get all shows for the week
    shows = await db.shows.find(query, {"_id": 0}).to_list(500)
    
    # Get show titles to check rds_station
    show_titles = {}
    titles_cursor = db.show_titles.find({"main_site_id": main_site_id}, {"_id": 0})
    async for title in titles_cursor:
        show_titles[title.get("name")] = title
    
    # Group shows by weekday and filter by station
    result = {
        'maandag': [],
        'dinsdag': [],
        'woensdag': [],
        'donderdag': [],
        'vrijdag': [],
        'zaterdag': [],
        'zondag': []
    }
    
    for show in shows:
        title_name = show.get("title", "")
        title_info = show_titles.get(title_name, {})
        rds_station = title_info.get("rds_station", "none")
        
        # Filter by station
        if station != "both":
            if rds_station != station and rds_station != "both":
                continue
        else:
            if rds_station == "none":
                continue
        
        # Get weekday name
        try:
            show_date = datetime.strptime(show.get("date", ""), "%Y-%m-%d")
            weekday = WEEKDAY_NAMES_NL[show_date.weekday()]
        except:
            continue
        
        # Get presenter names
        presenter_names = []
        if show.get("presenter_ids"):
            presenters = await db.users.find(
                {"id": {"$in": show["presenter_ids"]}},
                {"_id": 0, "name": 1}
            ).to_list(10)
            presenter_names = [p.get("name", "") for p in presenters]
        
        # Get show image from title
        image_url = None
        if title_info.get("image"):
            image_url = title_info["image"].get("s3_url") or title_info["image"].get("url")
        
        show_data = {
            "id": show.get("id"),
            "title": title_name,
            "description": title_info.get("description", ""),
            "start_time": show.get("start_time", ""),
            "end_time": show.get("end_time", ""),
            "date": show.get("date", ""),
            "presenter": ", ".join(presenter_names) if presenter_names else "",
            "presenter_ids": show.get("presenter_ids", []),
            "image": image_url,
            "rds_station": rds_station
        }
        
        result[weekday].append(show_data)
    
    # Sort shows by start time within each day
    for day in result:
        result[day].sort(key=lambda x: x.get("start_time", "00:00"))
    
    return result


async def get_shows_for_today(main_site_id: str, station: str) -> list:
    """Get shows for today.
    
    Args:
        main_site_id: Main site ID for context
        station: 'mfy', 'grk', or 'both'
        
    Returns:
        List of shows for today
    """
    today = datetime.now(BRUSSELS_TZ).strftime("%Y-%m-%d")
    weekday = WEEKDAY_NAMES[datetime.now(BRUSSELS_TZ).weekday()]
    
    week_schedule = await get_shows_for_week(main_site_id, station)
    return week_schedule.get(weekday, [])


@public_schedule_router.get("/schedule/{station}")
async def get_public_schedule(
    station: str,
    request: Request
):
    """Get public schedule for a station.
    
    Args:
        station: 'mfy', 'grk', or 'both'
        
    Returns:
        Weekly schedule grouped by day
    """
    main_site_id = request.headers.get('X-Main-Site-ID', '')
    
    if not main_site_id:
        # Try to get from query param
        main_site_id = request.query_params.get('main_site_id', '')
    
    if not main_site_id:
        return {"error": "main_site_id required"}
    
    if station not in ['mfy', 'grk', 'both']:
        return {"error": "Invalid station. Use: mfy, grk, or both"}
    
    schedule = await get_shows_for_week(main_site_id, station)
    
    return schedule


@public_schedule_router.get("/schedule/{station}/today")
async def get_public_schedule_today(
    station: str,
    request: Request
):
    """Get today's schedule for a station.
    
    Args:
        station: 'mfy', 'grk', or 'both'
        
    Returns:
        List of shows for today
    """
    main_site_id = request.headers.get('X-Main-Site-ID', '')
    
    if not main_site_id:
        main_site_id = request.query_params.get('main_site_id', '')
    
    if not main_site_id:
        return {"error": "main_site_id required"}
    
    if station not in ['mfy', 'grk', 'both']:
        return {"error": "Invalid station. Use: mfy, grk, or both"}
    
    shows = await get_shows_for_today(main_site_id, station)
    
    # Format for ProRadio compatibility
    result = []
    for show in shows:
        result.append({
            "name": show.get("title"),
            "description": show.get("description", ""),
            "time": show.get("start_time"),
            "time_end": show.get("end_time"),
            "timezone_string": "Europe/Brussels",
            "thumbnail": show.get("image") or False,
            "presenter": show.get("presenter", "")
        })
    
    return result


@public_schedule_router.get("/schedule/{station}/day/{day}")
async def get_public_schedule_day(
    station: str,
    day: str,
    request: Request
):
    """Get schedule for a specific day.
    
    Args:
        station: 'mfy', 'grk', or 'both'
        day: Day name (maandag, dinsdag, etc.)
        
    Returns:
        List of shows for the specified day
    """
    main_site_id = request.headers.get('X-Main-Site-ID', '')
    
    if not main_site_id:
        main_site_id = request.query_params.get('main_site_id', '')
    
    if not main_site_id:
        return {"error": "main_site_id required"}
    
    if station not in ['mfy', 'grk', 'both']:
        return {"error": "Invalid station. Use: mfy, grk, or both"}
    
    day_lower = day.lower()
    if day_lower not in WEEKDAY_NAMES.values():
        return {"error": f"Invalid day. Use: {', '.join(WEEKDAY_NAMES.values())}"}
    
    schedule = await get_shows_for_week(main_site_id, station)
    
    return schedule.get(day_lower, [])
