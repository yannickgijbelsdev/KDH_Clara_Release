"""RDS Builder models and routes."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from pydantic import BaseModel
import uuid
import asyncio

from database import db
from services.auth import require_admin
from services.timezone_utils import (
    BRUSSELS_TZ, now_brussels, today_brussels, current_time_brussels,
    format_datetime_brussels
)

rds_builder_router = APIRouter(prefix="/rds-builder", tags=["RDS Builder"])


class RDSItem(BaseModel):
    """A single item in the RDS sequence."""
    id: str
    type: Literal["now_playing", "show_name", "presenter_name", "audio_trigger", "custom_text"]
    content: Optional[str] = None  # For custom_text type
    duration: int = 5  # How long to display this item (seconds)


class RDSSequence(BaseModel):
    """A complete RDS sequence for a station."""
    station: Literal["mfy", "grk"]
    items: List[RDSItem]
    enabled: bool = True
    loop: bool = True  # Whether to loop the sequence


class RDSSequenceResponse(BaseModel):
    """Response model for RDS sequence."""
    id: str
    station: str
    items: List[dict]
    enabled: bool
    loop: bool
    current_index: int
    current_text: str
    updated_at: str


@rds_builder_router.get("/sequence/{station}", response_model=RDSSequenceResponse)
async def get_rds_sequence(
    station: str,
    current_user: dict = Depends(require_admin)
):
    """Get the RDS sequence for a station."""
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    sequence = await db.rds_sequences.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    if not sequence:
        # Return default sequence
        now = datetime.now(timezone.utc).isoformat()
        return {
            "id": str(uuid.uuid4()),
            "station": station,
            "items": [
                {"id": str(uuid.uuid4()), "type": "show_name", "content": None, "duration": 10},
                {"id": str(uuid.uuid4()), "type": "now_playing", "content": None, "duration": 5},
            ],
            "enabled": False,
            "loop": True,
            "current_index": 0,
            "current_text": "",
            "updated_at": now
        }
    
    return sequence


@rds_builder_router.put("/sequence/{station}")
async def update_rds_sequence(
    station: str,
    data: RDSSequence,
    current_user: dict = Depends(require_admin)
):
    """Update the RDS sequence for a station."""
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Convert items to dicts
    items_data = [item.dict() for item in data.items]
    
    sequence_data = {
        "station": station,
        "items": items_data,
        "enabled": data.enabled,
        "loop": data.loop,
        "updated_at": now
    }
    
    existing = await db.rds_sequences.find_one({"station": station}, {"_id": 0})
    
    if existing:
        await db.rds_sequences.update_one(
            {"station": station},
            {"$set": sequence_data}
        )
        sequence_data["id"] = existing.get("id", str(uuid.uuid4()))
        sequence_data["current_index"] = existing.get("current_index", 0)
        sequence_data["current_text"] = existing.get("current_text", "")
    else:
        sequence_data["id"] = str(uuid.uuid4())
        sequence_data["current_index"] = 0
        sequence_data["current_text"] = ""
        await db.rds_sequences.insert_one(sequence_data)
    
    return {
        "status": "success",
        "message": f"Sequence updated for {station}",
        "sequence": sequence_data
    }


@rds_builder_router.get("/output/{station}.txt")
async def get_rds_output_txt(station: str):
    """Public endpoint: Get the current RDS text output with .txt extension.
    
    This is the endpoint you configure in MagicRDS as the text source.
    Returns plain text that rotates based on the configured sequence.
    """
    from fastapi.responses import PlainTextResponse
    
    if station not in ["mfy", "grk"]:
        return PlainTextResponse(content="", media_type="text/plain")
    
    output = await db.rds_builder_output.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    if output and output.get("current_text"):
        return PlainTextResponse(content=output["current_text"], media_type="text/plain")
    
    return PlainTextResponse(content="", media_type="text/plain")


@rds_builder_router.get("/output/{station}")
async def get_rds_output(station: str):
    """Public endpoint: Get the current RDS text output for a station.
    
    This is the endpoint you configure in MagicRDS as the text source.
    Returns plain text that rotates based on the configured sequence.
    """
    from fastapi.responses import PlainTextResponse
    
    if station not in ["mfy", "grk"]:
        return PlainTextResponse(content="", media_type="text/plain")
    
    # Get current output from cache
    output = await db.rds_builder_output.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    if output and output.get("current_text"):
        return PlainTextResponse(content=output["current_text"], media_type="text/plain")
    
    return PlainTextResponse(content="", media_type="text/plain")


@rds_builder_router.get("/debug/{station}")
async def debug_output(station: str):
    """Debug endpoint to check output data."""
    output = await db.rds_builder_output.find_one(
        {"station": station},
        {"_id": 0}
    )
    return {
        "output_found": output is not None,
        "current_text": output.get("current_text", "NOT_FOUND") if output else "NO_OUTPUT_RECORD",
        "full_output": output
    }


@rds_builder_router.get("/status/{station}")
async def get_rds_builder_status(
    station: str,
    current_user: dict = Depends(require_admin)
):
    """Get the current status of the RDS builder for a station."""
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    output = await db.rds_builder_output.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    sequence = await db.rds_sequences.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    return {
        "station": station,
        "enabled": sequence.get("enabled", False) if sequence else False,
        "current_text": output.get("current_text", "") if output else "",
        "current_index": output.get("current_index", 0) if output else 0,
        "current_item_type": output.get("current_item_type", "") if output else "",
        "next_change_at": output.get("next_change_at", "") if output else "",
        "updated_at": output.get("updated_at", "") if output else ""
    }


# ============== RDS MONITORING DASHBOARD ==============
# Real-time monitoring of RDS outputs with history


async def check_live_shows_from_calendar():
    """Directly check the shows collection for currently live shows.
    
    This is a forced check that bypasses the cache to get real-time data.
    Returns dict with live show info per station.
    """
    now_brussels = datetime.now(BRUSSELS_TZ)
    
    live_shows_by_station = {"mfy": None, "grk": None}
    
    # Shows are stored in Brussels time, so only check with Brussels time
    check_time = now_brussels
    current_date = check_time.strftime('%Y-%m-%d')
    current_time = check_time.strftime('%H:%M')
    yesterday_date = (check_time - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Get all scheduled shows for today and yesterday
    all_shows = await db.shows.find({
        "status": "scheduled",
        "date": {"$in": [current_date, yesterday_date]}
    }, {"_id": 0}).to_list(500)
    
    for show in all_shows:
        start = show.get("start_time", "00:00")
        end = show.get("end_time", "23:59")
        show_date = show.get("date", "")
        rds_station = show.get("rds_station", "none")
        
        # Skip shows not assigned to RDS
        if rds_station == "none":
            # Try to get rds_station from show_titles
            show_title_doc = await db.show_titles.find_one(
                {"name": show.get("title")},
                {"_id": 0, "rds_station": 1}
            )
            if show_title_doc:
                rds_station = show_title_doc.get("rds_station", "none")
        
        if rds_station == "none":
            continue
        
        is_live = False
        crosses_midnight = start > end
        
        if show_date == current_date:
            if crosses_midnight:
                is_live = current_time >= start
            else:
                is_live = start <= current_time < end
        elif show_date == yesterday_date and crosses_midnight:
            is_live = current_time < end
        
        if is_live:
            # Calculate seconds until show ends
            try:
                end_parts = end.split(":")
                end_hour, end_min = int(end_parts[0]), int(end_parts[1])
                now_hour, now_min = check_time.hour, check_time.minute
                
                if crosses_midnight and show_date == current_date:
                    # Show crosses midnight, ends tomorrow
                    end_datetime = check_time.replace(hour=end_hour, minute=end_min, second=0) + timedelta(days=1)
                else:
                    end_datetime = check_time.replace(hour=end_hour, minute=end_min, second=0)
                
                seconds_until_end = (end_datetime - check_time).total_seconds()
            except:
                seconds_until_end = None
            
            show_info = {
                "id": show.get("id"),
                "title": show.get("title"),
                "start_time": start,
                "end_time": end,
                "date": show_date,
                "rds_station": rds_station,
                "is_live": True,
                "seconds_until_end": seconds_until_end,
                "checked_at": now_brussels.isoformat()
            }
            
            # Assign to appropriate station(s)
            if rds_station == "both":
                live_shows_by_station["mfy"] = show_info
                live_shows_by_station["grk"] = show_info
            elif rds_station in ["mfy", "grk"]:
                live_shows_by_station[rds_station] = show_info
    
    return live_shows_by_station


@rds_builder_router.post("/monitor/force-refresh")
async def force_refresh_rds():
    """Force refresh all RDS caches and outputs immediately.
    
    This bypasses the scheduler and forces an immediate update.
    Useful when shows are not updating properly.
    """
    from services.rds_scheduler import refresh_live_show_cache, run_scheduled_cache_refresh
    
    now_brussels = datetime.now(BRUSSELS_TZ)
    
    # 1. Force refresh all RDS caches
    await run_scheduled_cache_refresh()
    
    # 2. Get fresh live show data directly from calendar
    live_shows = await check_live_shows_from_calendar()
    
    # 3. For each station, update the cached rundowns if needed
    for station in ["mfy", "grk"]:
        live_show = live_shows.get(station)
        
        if not live_show:
            # No live show - mark cached rundowns as inactive for this station
            await db.rds_cached_rundowns.update_many(
                {"is_active": True, "rds_station": {"$in": [station, "both"]}},
                {"$set": {"is_active": False, "updated_at": now_brussels.isoformat()}}
            )
        else:
            # There's a live show - make sure it's marked active
            await db.rds_cached_rundowns.update_one(
                {"show_id": live_show["id"]},
                {"$set": {
                    "is_active": True, 
                    "show_title": live_show["title"],
                    "rds_station": live_show["rds_station"],
                    "updated_at": now_brussels.isoformat()
                }},
                upsert=True
            )
    
    # 4. Log the force refresh
    await db.rds_cache_logs.insert_one({
        "id": str(uuid.uuid4()),
        "timestamp": now_brussels.isoformat(),
        "status": "force_refresh",
        "message": f"Force refresh uitgevoerd - MFY: {live_shows['mfy']['title'] if live_shows['mfy'] else 'geen'}, GRK: {live_shows['grk']['title'] if live_shows['grk'] else 'geen'}",
        "live_shows": live_shows
    })
    
    # Invalidate monitor cache after force refresh
    global _monitor_cache
    _monitor_cache = {"data": None, "timestamp": None}
    
    return {
        "status": "success",
        "timestamp": now_brussels.isoformat(),
        "live_shows": live_shows,
        "message": "RDS cache geforceerd vernieuwd"
    }


# Simple in-memory cache for monitor endpoint (5 second TTL)
_monitor_cache = {"data": None, "timestamp": None}
MONITOR_CACHE_TTL_SECONDS = 5


@rds_builder_router.get("/monitor")
async def get_rds_monitor_data():
    """Public endpoint: Get real-time RDS monitoring data for all stations.
    
    Returns current output for both stations plus recent change history.
    No authentication required for monitoring displays.
    Uses 5-second cache to reduce CPU load from frequent polling.
    
    ALL times are in Brussels timezone (Europe/Brussels).
    """
    global _monitor_cache
    
    now_brussels_dt = now_brussels()
    
    # Check if cached data is still valid
    if (_monitor_cache["data"] is not None and 
        _monitor_cache["timestamp"] is not None and
        (now_brussels_dt - _monitor_cache["timestamp"]).total_seconds() < MONITOR_CACHE_TTL_SECONDS):
        # Return cached data with updated timestamp display
        cached = _monitor_cache["data"].copy()
        cached["timestamp"] = now_brussels_dt.isoformat()
        cached["timestamp_formatted"] = now_brussels_dt.strftime("%H:%M:%S")
        cached["cached"] = True
        return cached
    
    # Generate fresh data
    
    # Get current outputs for both stations
    stations_data = {}
    for station in ["mfy", "grk"]:
        output = await db.rds_builder_output.find_one(
            {"station": station},
            {"_id": 0}
        )
        
        # Get sequence config
        sequence = await db.rds_sequences.find_one(
            {"station": station},
            {"_id": 0, "enabled": 1}
        )
        
        # Get cached rundown (live show info)
        cached_rundown = await db.rds_cached_rundowns.find_one(
            {"is_active": True, "rds_station": {"$in": [station, "both"]}},
            {"_id": 0, "show_title": 1, "show_start_time": 1, "show_end_time": 1, "presenter_names": 1, "show_id": 1}
        )
        
        # If we have a cached rundown but no presenter_names, try to get from the show
        presenter_names = []
        if cached_rundown:
            presenter_names = cached_rundown.get("presenter_names", [])
            if not presenter_names and cached_rundown.get("show_id"):
                # Try to get presenter info from the show directly
                show = await db.shows.find_one(
                    {"id": cached_rundown["show_id"]},
                    {"_id": 0, "presenter_ids": 1}
                )
                if show and show.get("presenter_ids"):
                    # Get presenter names
                    presenters = await db.users.find(
                        {"id": {"$in": show["presenter_ids"]}},
                        {"_id": 0, "name": 1}
                    ).to_list(10)
                    presenter_names = [p.get("name", "") for p in presenters if p.get("name")]
        
        # Get shoutcast now playing
        shoutcast = await db.shoutcast_cache.find_one(
            {"station": station},
            {"_id": 0, "song_title": 1, "current_listeners": 1, "stream_online": 1, "is_stale": 1, "song_started_at": 1, "stale_at": 1}
        )
        
        # Get active scheduled text info from output
        scheduled_text_info = None
        if output and output.get("scheduled_text_active"):
            scheduled_text_info = {
                "text": output.get("current_text", ""),
                "ends_at": output.get("scheduled_text_ends_at"),
                "item_id": output.get("current_item_id")
            }
        
        # Get next scheduled text
        from services.rds_builder_scheduler import get_active_scheduled_text_for_station
        active_scheduled = await get_active_scheduled_text_for_station(db, station)
        
        stations_data[station] = {
            "current_text": output.get("current_text", "") if output else "",
            "current_item_type": output.get("current_item_type", "") if output else "",
            "sequence_enabled": sequence.get("enabled", False) if sequence else False,
            "scheduled_text_active": output.get("scheduled_text_active", False) if output else False,
            "scheduled_text_info": scheduled_text_info,
            "active_scheduled_text": {
                "text": active_scheduled["text"],
                "ends_at": active_scheduled["ends_at"].isoformat() if active_scheduled.get("ends_at") else None,
                "is_recurring": active_scheduled.get("is_recurring", False)
            } if active_scheduled else None,
            "audio_trigger_active": output.get("audio_trigger_active", False) if output else False,
            "next_change_at": output.get("next_change_at", "") if output else "",
            "updated_at": output.get("updated_at", "") if output else "",
            "live_show": {
                "title": cached_rundown.get("show_title") if cached_rundown else None,
                "start_time": cached_rundown.get("show_start_time") if cached_rundown else None,
                "end_time": cached_rundown.get("show_end_time") if cached_rundown else None,
                "presenters": presenter_names,
            } if cached_rundown else None,
            "now_playing": {
                "song": shoutcast.get("song_title", "") if shoutcast else "",
                "listeners": shoutcast.get("current_listeners", 0) if shoutcast else 0,
                "online": shoutcast.get("stream_online", False) if shoutcast else False,
                "is_stale": shoutcast.get("is_stale", False) if shoutcast else False,
                "song_started_at": shoutcast.get("song_started_at", "") if shoutcast else "",
                "stale_at": shoutcast.get("stale_at", "") if shoutcast else "",
            }
        }
    
    # Get recent RDS output history (last 50 changes)
    history = await db.rds_output_history.find(
        {},
        {"_id": 0}
    ).sort("timestamp", -1).limit(50).to_list(50)
    
    # Also get live shows directly from calendar (bypass cache)
    calendar_live_shows = await check_live_shows_from_calendar()
    
    # Get next scheduled texts for each station
    scheduled_texts_info = {}
    for station in ["mfy", "grk"]:
        texts = await db.rds_scheduled_texts.find(
            {"$or": [{"station": station}, {"station": "both"}], "enabled": True},
            {"_id": 0}
        ).to_list(100)
        
        next_occurrence = None
        for text in texts:
            try:
                # Parse start datetime - assume Brussels timezone
                start_dt_str = text["start_datetime"].replace("Z", "")
                try:
                    text_start = datetime.fromisoformat(start_dt_str)
                except ValueError:
                    text_start = datetime.fromisoformat(start_dt_str.split("+")[0])
                
                # If naive datetime, assume Brussels time
                if text_start.tzinfo is None:
                    text_start = text_start.replace(tzinfo=BRUSSELS_TZ)
                else:
                    text_start = text_start.astimezone(BRUSSELS_TZ)
                
                recurrence = text.get("recurrence_type", "none")
                duration_minutes = text.get("duration_minutes", 5) or 5
                now_bru = now_brussels()
                
                # Find next occurrence
                current = text_start
                max_iter = 10000
                iter_count = 0
                
                while current <= now_bru and iter_count < max_iter:
                    if recurrence == "hourly":
                        current = current + timedelta(hours=1)
                    elif recurrence == "daily":
                        current = current + timedelta(days=1)
                    elif recurrence == "weekly":
                        current = current + timedelta(weeks=1)
                    elif recurrence == "monthly":
                        from dateutil.relativedelta import relativedelta
                        current = current + relativedelta(months=1)
                    else:
                        break
                    iter_count += 1
                
                if current > now_bru:
                    seconds_until = (current - now_bru).total_seconds()
                    if next_occurrence is None or seconds_until < next_occurrence["seconds_until"]:
                        next_occurrence = {
                            "text": text["text"],
                            "starts_at": current.isoformat(),
                            "seconds_until": seconds_until,
                            "duration_minutes": duration_minutes,
                            "recurrence": recurrence
                        }
            except Exception as e:
                pass
        
        scheduled_texts_info[station] = {
            "next": next_occurrence
        }
    
    # Add calendar check data to each station
    for station in ["mfy", "grk"]:
        calendar_show = calendar_live_shows.get(station)
        stations_data[station]["calendar_live_show"] = calendar_show
        stations_data[station]["next_scheduled_text"] = scheduled_texts_info[station]["next"]
        
        # If there's a mismatch between cache and calendar, flag it
        cached_show = stations_data[station]["live_show"]
        if calendar_show and not cached_show:
            stations_data[station]["cache_stale"] = True
            stations_data[station]["cache_stale_reason"] = "Calendar shows live show but cache is empty"
        elif not calendar_show and cached_show:
            stations_data[station]["cache_stale"] = True
            stations_data[station]["cache_stale_reason"] = "Cache shows live show but calendar says no show"
        else:
            stations_data[station]["cache_stale"] = False
    
    # Build response
    response_data = {
        "timestamp": now_brussels.isoformat(),
        "timestamp_formatted": now_brussels.strftime("%H:%M:%S"),
        "date_formatted": now_brussels.strftime("%d-%m-%Y"),
        "stations": stations_data,
        "history": history,
        "calendar_live_shows": calendar_live_shows,
        "scheduled_texts_info": scheduled_texts_info,
        "cached": False
    }
    
    # Store in cache
    _monitor_cache["data"] = response_data
    _monitor_cache["timestamp"] = now_utc
    
    return response_data


@rds_builder_router.get("/monitor/history")
async def get_rds_output_history(
    station: Optional[str] = None,
    limit: int = 100
):
    """Get RDS output change history.
    
    Args:
        station: Optional filter by station (mfy/grk)
        limit: Number of records to return (default 100, max 500)
    """
    limit = min(limit, 500)
    
    query = {}
    if station and station in ["mfy", "grk"]:
        query["station"] = station
    
    history = await db.rds_output_history.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return history


@rds_builder_router.get("/scheduled-texts-status")
async def get_scheduled_texts_status():
    """Get the current status of scheduled texts for all stations.
    
    Returns active scheduled text (if any) and next upcoming scheduled text for each station.
    This is used by the RDS Monitor to show scheduled text status.
    """
    from services.rds_builder_scheduler import get_active_scheduled_text_for_station
    
    now_brussels = datetime.now(BRUSSELS_TZ)
    now_utc = datetime.now(timezone.utc)
    
    result = {}
    
    for station in ["mfy", "grk"]:
        # Get currently active scheduled text
        active = await get_active_scheduled_text_for_station(db, station)
        
        # Get all enabled scheduled texts for this station
        texts = await db.rds_scheduled_texts.find(
            {"$or": [{"station": station}, {"station": "both"}], "enabled": True},
            {"_id": 0}
        ).to_list(100)
        
        # Calculate next occurrence for each text
        next_occurrences = []
        for text in texts:
            try:
                start_dt_str = text["start_datetime"].replace("Z", "+00:00")
                try:
                    text_start = datetime.fromisoformat(start_dt_str)
                except ValueError:
                    text_start = datetime.fromisoformat(start_dt_str.split("+")[0])
                    text_start = text_start.replace(tzinfo=timezone.utc)
                
                if text_start.tzinfo is None:
                    text_start = text_start.replace(tzinfo=timezone.utc)
                
                recurrence = text.get("recurrence_type", "none")
                duration_minutes = text.get("duration_minutes", 5) or 5
                
                # Find next occurrence
                current = text_start
                max_iter = 10000
                iter_count = 0
                
                while current <= now_utc and iter_count < max_iter:
                    if recurrence == "hourly":
                        current = current + timedelta(hours=1)
                    elif recurrence == "daily":
                        current = current + timedelta(days=1)
                    elif recurrence == "weekly":
                        current = current + timedelta(weeks=1)
                    elif recurrence == "monthly":
                        from dateutil.relativedelta import relativedelta
                        current = current + relativedelta(months=1)
                    else:
                        break
                    iter_count += 1
                
                if current > now_utc:
                    next_occurrences.append({
                        "id": text["id"],
                        "text": text["text"],
                        "next_start": current.isoformat(),
                        "duration_minutes": duration_minutes,
                        "recurrence": recurrence
                    })
            except Exception as e:
                pass
        
        # Sort by next_start
        next_occurrences.sort(key=lambda x: x["next_start"])
        
        result[station] = {
            "active": active,
            "next_scheduled": next_occurrences[0] if next_occurrences else None,
            "upcoming_count": len(next_occurrences)
        }
    
    return {
        "timestamp": now_brussels.isoformat(),
        "stations": result
    }


# ============== MULTI-OUTPUT SYSTEM ==============
# Allows creating multiple named outputs per station (e.g., Streaming, DAB, FM)
# Each output has its own configurable items (now_playing, show_name, custom_text)

class RDSOutputItem(BaseModel):
    """A single item in an RDS output configuration."""
    type: Literal["now_playing", "show_name", "presenter_name", "audio_trigger", "custom_text"]
    enabled: bool = True
    content: Optional[str] = None  # For custom_text type
    duration: int = 5  # How long to display this item (seconds)


class RDSOutputConfig(BaseModel):
    """Configuration for a named RDS output."""
    name: str  # Display name (e.g., "Streaming", "DAB+", "FM")
    slug: str  # URL-safe identifier (e.g., "streaming", "dab", "fm")
    station: Literal["mfy", "grk"]
    items: List[RDSOutputItem]
    enabled: bool = True
    loop: bool = True


class RDSOutputConfigResponse(BaseModel):
    """Response model for RDS output configuration."""
    id: str
    name: str
    slug: str
    station: str
    items: List[dict]
    enabled: bool
    loop: bool
    current_text: str
    updated_at: str


@rds_builder_router.get("/outputs/{station}")
async def get_rds_outputs(
    station: str,
    current_user: dict = Depends(require_admin)
):
    """Get all RDS output configurations for a station."""
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    outputs = await db.rds_outputs.find(
        {"station": station},
        {"_id": 0}
    ).to_list(100)
    
    # Add current text for each output
    for output in outputs:
        output_state = await db.rds_output_states.find_one(
            {"output_id": output.get("id")},
            {"_id": 0, "current_text": 1}
        )
        output["current_text"] = output_state.get("current_text", "") if output_state else ""
    
    return outputs


@rds_builder_router.post("/outputs/{station}")
async def create_rds_output(
    station: str,
    data: RDSOutputConfig,
    current_user: dict = Depends(require_admin)
):
    """Create a new RDS output configuration."""
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    # Validate slug is URL-safe
    import re
    if not re.match(r'^[a-z0-9-]+$', data.slug):
        raise HTTPException(status_code=400, detail="Slug must contain only lowercase letters, numbers, and hyphens")
    
    # Check if slug already exists for this station
    existing = await db.rds_outputs.find_one({"station": station, "slug": data.slug})
    if existing:
        raise HTTPException(status_code=400, detail=f"Output with slug '{data.slug}' already exists for {station}")
    
    now = datetime.now(timezone.utc).isoformat()
    output_id = str(uuid.uuid4())
    
    output_data = {
        "id": output_id,
        "name": data.name,
        "slug": data.slug,
        "station": station,
        "items": [item.dict() for item in data.items],
        "enabled": data.enabled,
        "loop": data.loop,
        "created_at": now,
        "updated_at": now
    }
    
    await db.rds_outputs.insert_one(output_data)
    output_data.pop("_id", None)
    output_data["current_text"] = ""
    
    return output_data


@rds_builder_router.put("/outputs/{station}/{slug}")
async def update_rds_output(
    station: str,
    slug: str,
    data: RDSOutputConfig,
    current_user: dict = Depends(require_admin)
):
    """Update an RDS output configuration."""
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    existing = await db.rds_outputs.find_one({"station": station, "slug": slug})
    if not existing:
        raise HTTPException(status_code=404, detail="Output not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    update_data = {
        "name": data.name,
        "items": [item.dict() for item in data.items],
        "enabled": data.enabled,
        "loop": data.loop,
        "updated_at": now
    }
    
    # If slug is changing, check it doesn't conflict
    if data.slug != slug:
        import re
        if not re.match(r'^[a-z0-9-]+$', data.slug):
            raise HTTPException(status_code=400, detail="Slug must contain only lowercase letters, numbers, and hyphens")
        conflict = await db.rds_outputs.find_one({"station": station, "slug": data.slug})
        if conflict:
            raise HTTPException(status_code=400, detail=f"Output with slug '{data.slug}' already exists")
        update_data["slug"] = data.slug
    
    await db.rds_outputs.update_one(
        {"station": station, "slug": slug},
        {"$set": update_data}
    )
    
    updated = await db.rds_outputs.find_one({"station": station, "slug": data.slug or slug}, {"_id": 0})
    
    # Add current text
    output_state = await db.rds_output_states.find_one(
        {"output_id": updated.get("id")},
        {"_id": 0, "current_text": 1}
    )
    updated["current_text"] = output_state.get("current_text", "") if output_state else ""
    
    return updated


@rds_builder_router.delete("/outputs/{station}/{slug}")
async def delete_rds_output(
    station: str,
    slug: str,
    current_user: dict = Depends(require_admin)
):
    """Delete an RDS output configuration."""
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    existing = await db.rds_outputs.find_one({"station": station, "slug": slug})
    if not existing:
        raise HTTPException(status_code=404, detail="Output not found")
    
    # Delete output and its state
    await db.rds_outputs.delete_one({"station": station, "slug": slug})
    await db.rds_output_states.delete_one({"output_id": existing.get("id")})
    
    return {"status": "success", "message": f"Output '{slug}' deleted"}


# Public endpoints for named outputs
@rds_builder_router.get("/output/{station}/{slug}.txt")
async def get_named_output_txt(station: str, slug: str):
    """Public endpoint: Get the current RDS text for a named output.
    
    URL format: /api/rds-builder/output/{station}/{slug}.txt
    Example: /api/rds-builder/output/grk/streaming.txt
    """
    from fastapi.responses import PlainTextResponse
    
    if station not in ["mfy", "grk"]:
        return PlainTextResponse(content="", media_type="text/plain")
    
    # Find the output configuration
    output_config = await db.rds_outputs.find_one(
        {"station": station, "slug": slug},
        {"_id": 0, "id": 1, "enabled": 1}
    )
    
    if not output_config or not output_config.get("enabled"):
        return PlainTextResponse(content="", media_type="text/plain")
    
    # Get current state
    output_state = await db.rds_output_states.find_one(
        {"output_id": output_config.get("id")},
        {"_id": 0}
    )
    
    if output_state and output_state.get("current_text"):
        return PlainTextResponse(content=output_state["current_text"], media_type="text/plain")
    
    return PlainTextResponse(content="", media_type="text/plain")


@rds_builder_router.get("/output/{station}/{slug}")
async def get_named_output(station: str, slug: str):
    """Public endpoint: Get the current RDS text for a named output (without .txt)."""
    from fastapi.responses import PlainTextResponse
    
    # Avoid matching existing routes like /output/grk (without slug)
    if slug in ["mfy", "grk", "mfy.txt", "grk.txt"]:
        return PlainTextResponse(content="", media_type="text/plain")
    
    if station not in ["mfy", "grk"]:
        return PlainTextResponse(content="", media_type="text/plain")
    
    output_config = await db.rds_outputs.find_one(
        {"station": station, "slug": slug},
        {"_id": 0, "id": 1, "enabled": 1}
    )
    
    if not output_config or not output_config.get("enabled"):
        return PlainTextResponse(content="", media_type="text/plain")
    
    output_state = await db.rds_output_states.find_one(
        {"output_id": output_config.get("id")},
        {"_id": 0}
    )
    
    if output_state and output_state.get("current_text"):
        return PlainTextResponse(content=output_state["current_text"], media_type="text/plain")
    
    return PlainTextResponse(content="", media_type="text/plain")


@rds_builder_router.get("/outputs/{station}/{slug}/status")
async def get_output_status(
    station: str,
    slug: str,
    current_user: dict = Depends(require_admin)
):
    """Get the current status of a named RDS output."""
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    output_config = await db.rds_outputs.find_one(
        {"station": station, "slug": slug},
        {"_id": 0}
    )
    
    if not output_config:
        raise HTTPException(status_code=404, detail="Output not found")
    
    output_state = await db.rds_output_states.find_one(
        {"output_id": output_config.get("id")},
        {"_id": 0}
    )
    
    return {
        "output_id": output_config.get("id"),
        "name": output_config.get("name"),
        "slug": slug,
        "station": station,
        "enabled": output_config.get("enabled", False),
        "current_text": output_state.get("current_text", "") if output_state else "",
        "current_index": output_state.get("current_index", 0) if output_state else 0,
        "current_item_type": output_state.get("current_item_type", "") if output_state else "",
        "next_change_at": output_state.get("next_change_at", "") if output_state else "",
        "updated_at": output_state.get("updated_at", "") if output_state else ""
    }


# ============== SCHEDULED CUSTOM TEXTS ==============
# Allows scheduling custom texts at specific times with optional recurrence

class ScheduledTextCreate(BaseModel):
    """Create a scheduled custom text."""
    station: Literal["mfy", "grk", "both"]
    text: str
    start_datetime: str  # ISO format datetime
    duration_type: Literal["fixed", "until_next"] = "fixed"
    duration_minutes: Optional[int] = 5  # Only used if duration_type is "fixed"
    recurrence_type: Literal["none", "hourly", "daily", "weekly", "monthly"] = "none"
    recurrence_end_date: Optional[str] = None  # YYYY-MM-DD format
    enabled: bool = True


class ScheduledTextUpdate(BaseModel):
    """Update a scheduled custom text."""
    text: Optional[str] = None
    start_datetime: Optional[str] = None
    station: Optional[Literal["mfy", "grk", "both"]] = None
    duration_type: Optional[Literal["fixed", "until_next"]] = None
    duration_minutes: Optional[int] = None
    recurrence_type: Optional[Literal["none", "hourly", "daily", "weekly", "monthly"]] = None
    recurrence_end_date: Optional[str] = None
    enabled: Optional[bool] = None


class ScheduledTextResponse(BaseModel):
    """Response model for scheduled custom text."""
    id: str
    station: str
    text: str
    start_datetime: str
    duration_type: str
    duration_minutes: Optional[int]
    recurrence_type: str
    recurrence_end_date: Optional[str]
    enabled: bool
    created_at: str
    updated_at: str


@rds_builder_router.get("/scheduled-texts/{station}")
async def get_scheduled_texts(
    station: str,
    current_user: dict = Depends(require_admin)
):
    """Get all scheduled custom texts for a station, with next activation time."""
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    # Get texts for this specific station OR texts set to "both"
    texts = await db.rds_scheduled_texts.find(
        {"$or": [{"station": station}, {"station": "both"}]},
        {"_id": 0}
    ).sort("start_datetime", 1).to_list(1000)
    
    # Add next activation time and active status for each text
    now_utc = datetime.now(timezone.utc)
    
    for text in texts:
        if not text.get("enabled"):
            text["next_activation"] = None
            text["is_active_now"] = False
            continue
            
        try:
            start_dt_str = text["start_datetime"].replace("Z", "+00:00")
            try:
                text_start = datetime.fromisoformat(start_dt_str)
            except ValueError:
                text_start = datetime.fromisoformat(start_dt_str.split("+")[0])
                text_start = text_start.replace(tzinfo=timezone.utc)
            
            if text_start.tzinfo is None:
                text_start = text_start.replace(tzinfo=timezone.utc)
            
            recurrence = text.get("recurrence_type", "none")
            duration_minutes = text.get("duration_minutes", 5) or 5
            
            # Find next occurrence
            if recurrence == "none":
                # One-time event
                end_time = text_start + timedelta(minutes=duration_minutes)
                if text_start <= now_utc <= end_time:
                    text["is_active_now"] = True
                    text["next_activation"] = None
                    text["ends_at"] = end_time.isoformat()
                elif text_start > now_utc:
                    text["is_active_now"] = False
                    text["next_activation"] = text_start.isoformat()
                    text["seconds_until_next"] = (text_start - now_utc).total_seconds()
                else:
                    text["is_active_now"] = False
                    text["next_activation"] = None  # Past event
            else:
                # Recurring event - find next occurrence
                current_occurrence = text_start
                max_iter = 10000
                iter_count = 0
                
                while current_occurrence <= now_utc and iter_count < max_iter:
                    end_time = current_occurrence + timedelta(minutes=duration_minutes)
                    
                    # Check if we're in the active window
                    if current_occurrence <= now_utc <= end_time:
                        text["is_active_now"] = True
                        text["next_activation"] = None
                        text["ends_at"] = end_time.isoformat()
                        break
                    
                    # Move to next occurrence
                    if recurrence == "hourly":
                        current_occurrence = current_occurrence + timedelta(hours=1)
                    elif recurrence == "daily":
                        current_occurrence = current_occurrence + timedelta(days=1)
                    elif recurrence == "weekly":
                        current_occurrence = current_occurrence + timedelta(weeks=1)
                    elif recurrence == "monthly":
                        current_occurrence = current_occurrence + relativedelta(months=1)
                    else:
                        break
                    iter_count += 1
                else:
                    # Not currently active, calculate next activation
                    text["is_active_now"] = False
                    if current_occurrence > now_utc:
                        text["next_activation"] = current_occurrence.isoformat()
                        text["seconds_until_next"] = (current_occurrence - now_utc).total_seconds()
                    else:
                        text["next_activation"] = None
        except Exception as e:
            text["is_active_now"] = False
            text["next_activation"] = None
    
    return texts


@rds_builder_router.get("/scheduled-texts/{station}/calendar")
async def get_scheduled_texts_calendar(
    station: str,
    start_date: str,  # YYYY-MM-DD
    end_date: str,    # YYYY-MM-DD
    current_user: dict = Depends(require_admin)
):
    """Get scheduled texts for calendar view, expanding recurring items."""
    from datetime import timedelta
    from dateutil.relativedelta import relativedelta
    
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    # Parse date range
    try:
        start = datetime.fromisoformat(start_date + "T00:00:00")
        end = datetime.fromisoformat(end_date + "T23:59:59")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Get texts for this specific station OR texts set to "both"
    texts = await db.rds_scheduled_texts.find(
        {"$or": [{"station": station}, {"station": "both"}]},
        {"_id": 0}
    ).to_list(1000)
    
    # Expand recurring items for the calendar view
    calendar_items = []
    
    for text in texts:
        text_start = datetime.fromisoformat(text["start_datetime"].replace("Z", "+00:00"))
        recurrence = text.get("recurrence_type", "none")
        recurrence_end = text.get("recurrence_end_date")
        
        if recurrence_end:
            recurrence_end_dt = datetime.fromisoformat(recurrence_end + "T23:59:59")
        else:
            recurrence_end_dt = end  # Use view range end
        
        if recurrence == "none":
            # One-time event
            if start <= text_start <= end:
                calendar_items.append({
                    **text,
                    "occurrence_date": text_start.strftime("%Y-%m-%d"),
                    "occurrence_time": text_start.strftime("%H:%M"),
                    "is_recurring": False
                })
        else:
            # Recurring event - generate occurrences
            current = text_start
            # Limit hourly recurrence to prevent too many items
            max_iterations = 1000 if recurrence != "hourly" else 100
            iteration = 0
            while current <= min(end, recurrence_end_dt) and iteration < max_iterations:
                if current >= start:
                    calendar_items.append({
                        **text,
                        "occurrence_date": current.strftime("%Y-%m-%d"),
                        "occurrence_time": current.strftime("%H:%M"),
                        "is_recurring": True
                    })
                
                # Move to next occurrence
                if recurrence == "hourly":
                    current += timedelta(hours=1)
                elif recurrence == "daily":
                    current += timedelta(days=1)
                elif recurrence == "weekly":
                    current += timedelta(weeks=1)
                elif recurrence == "monthly":
                    current += relativedelta(months=1)
                else:
                    break
                iteration += 1
    
    # Sort by occurrence date/time
    calendar_items.sort(key=lambda x: f"{x['occurrence_date']}T{x['occurrence_time']}")
    
    return calendar_items


@rds_builder_router.post("/scheduled-texts/{station}")
async def create_scheduled_text(
    station: str,
    data: ScheduledTextCreate,
    current_user: dict = Depends(require_admin)
):
    """Create a new scheduled custom text."""
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    now = datetime.now(timezone.utc).isoformat()
    text_id = str(uuid.uuid4())
    
    text_data = {
        "id": text_id,
        "station": data.station,  # Use station from request body, supports "both"
        "text": data.text,
        "start_datetime": data.start_datetime,
        "duration_type": data.duration_type,
        "duration_minutes": data.duration_minutes if data.duration_type == "fixed" else None,
        "recurrence_type": data.recurrence_type,
        "recurrence_end_date": data.recurrence_end_date,
        "enabled": data.enabled,
        "created_by": current_user.get("id"),
        "created_at": now,
        "updated_at": now
    }
    
    await db.rds_scheduled_texts.insert_one(text_data)
    text_data.pop("_id", None)
    
    return text_data


@rds_builder_router.put("/scheduled-texts/{station}/{text_id}")
async def update_scheduled_text(
    station: str,
    text_id: str,
    data: ScheduledTextUpdate,
    current_user: dict = Depends(require_admin)
):
    """Update a scheduled custom text."""
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    # Find by ID only, since station might be "both" in the actual data
    existing = await db.rds_scheduled_texts.find_one({"id": text_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Scheduled text not found")
    
    now = datetime.now(timezone.utc).isoformat()
    update_data = {"updated_at": now}
    
    if data.text is not None:
        update_data["text"] = data.text
    if data.start_datetime is not None:
        update_data["start_datetime"] = data.start_datetime
    if data.station is not None:
        update_data["station"] = data.station
    if data.duration_type is not None:
        update_data["duration_type"] = data.duration_type
    if data.duration_minutes is not None:
        update_data["duration_minutes"] = data.duration_minutes
    if data.recurrence_type is not None:
        update_data["recurrence_type"] = data.recurrence_type
    if data.recurrence_end_date is not None:
        update_data["recurrence_end_date"] = data.recurrence_end_date
    if data.enabled is not None:
        update_data["enabled"] = data.enabled
    
    await db.rds_scheduled_texts.update_one(
        {"id": text_id},
        {"$set": update_data}
    )
    
    updated = await db.rds_scheduled_texts.find_one({"id": text_id}, {"_id": 0})
    return updated


@rds_builder_router.delete("/scheduled-texts/{station}/{text_id}")
async def delete_scheduled_text(
    station: str,
    text_id: str,
    current_user: dict = Depends(require_admin)
):
    """Delete a scheduled custom text."""
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    # Find by ID only, since station might be "both" in the actual data
    existing = await db.rds_scheduled_texts.find_one({"id": text_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Scheduled text not found")
    
    await db.rds_scheduled_texts.delete_one({"id": text_id})
    
    return {"status": "success", "message": "Scheduled text deleted"}


@rds_builder_router.get("/scheduled-texts/{station}/active")
async def get_active_scheduled_text(station: str):
    """Public endpoint: Get the currently active scheduled text for a station.
    
    Shows have priority over scheduled texts.
    Returns the currently active scheduled text if no show is playing.
    """
    from fastapi.responses import JSONResponse
    from dateutil.relativedelta import relativedelta
    
    if station not in ["mfy", "grk"]:
        return JSONResponse(content={"active": False, "text": None})
    
    now = datetime.now(timezone.utc)
    
    # First check if there's an active show - shows have priority
    active_show = await db.shows.find_one({
        "date": now.strftime("%Y-%m-%d"),
        "start_time": {"$lte": now.strftime("%H:%M")},
        "end_time": {"$gte": now.strftime("%H:%M")},
        "$or": [
            {"rds_station": station},
            {"rds_station": "both"}
        ]
    })
    
    if active_show:
        return JSONResponse(content={
            "active": False,
            "text": None,
            "reason": "show_active",
            "show_title": active_show.get("title")
        })
    
    # Get enabled scheduled texts for this station OR texts set to "both"
    texts = await db.rds_scheduled_texts.find(
        {"$or": [{"station": station}, {"station": "both"}], "enabled": True},
        {"_id": 0}
    ).to_list(1000)
    
    # Find which scheduled text is currently active
    for text in texts:
        # Parse start_datetime and ensure it's timezone-aware
        start_dt_str = text["start_datetime"].replace("Z", "+00:00")
        text_start = datetime.fromisoformat(start_dt_str)
        # If naive datetime, assume UTC
        if text_start.tzinfo is None:
            text_start = text_start.replace(tzinfo=timezone.utc)
        recurrence = text.get("recurrence_type", "none")
        recurrence_end = text.get("recurrence_end_date")
        duration_type = text.get("duration_type", "fixed")
        duration_minutes = text.get("duration_minutes", 5)
        
        # Check recurrence end
        if recurrence_end:
            recurrence_end_dt = datetime.fromisoformat(recurrence_end + "T23:59:59+00:00")
            if now > recurrence_end_dt:
                continue
        
        # Calculate if this text is active now
        if recurrence == "none":
            # One-time event
            if duration_type == "fixed":
                end_time = text_start + timedelta(minutes=duration_minutes)
                if text_start <= now <= end_time:
                    return JSONResponse(content={
                        "active": True,
                        "text": text["text"],
                        "scheduled_text_id": text["id"],
                        "ends_at": end_time.isoformat()
                    })
            else:
                # until_next - active until next scheduled item
                if text_start <= now:
                    return JSONResponse(content={
                        "active": True,
                        "text": text["text"],
                        "scheduled_text_id": text["id"],
                        "ends_at": None
                    })
        else:
            # Recurring event - check if current occurrence is active
            # Find the most recent occurrence that started before now
            current_occurrence = text_start
            max_iterations = 1000
            iteration = 0
            while current_occurrence <= now and iteration < max_iterations:
                next_occurrence = None
                if recurrence == "hourly":
                    next_occurrence = current_occurrence + timedelta(hours=1)
                elif recurrence == "daily":
                    next_occurrence = current_occurrence + timedelta(days=1)
                elif recurrence == "weekly":
                    next_occurrence = current_occurrence + timedelta(weeks=1)
                elif recurrence == "monthly":
                    next_occurrence = current_occurrence + relativedelta(months=1)
                
                if duration_type == "fixed":
                    end_time = current_occurrence + timedelta(minutes=duration_minutes)
                    if current_occurrence <= now <= end_time:
                        return JSONResponse(content={
                            "active": True,
                            "text": text["text"],
                            "scheduled_text_id": text["id"],
                            "ends_at": end_time.isoformat(),
                            "is_recurring": True
                        })
                else:
                    # until_next - active until next occurrence
                    if current_occurrence <= now < (next_occurrence or now + timedelta(days=365)):
                        return JSONResponse(content={
                            "active": True,
                            "text": text["text"],
                            "scheduled_text_id": text["id"],
                            "ends_at": next_occurrence.isoformat() if next_occurrence else None,
                            "is_recurring": True
                        })
                
                if next_occurrence and next_occurrence > now:
                    break
                current_occurrence = next_occurrence or (now + timedelta(days=365))
                iteration += 1
    
    return JSONResponse(content={"active": False, "text": None})

