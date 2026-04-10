"""RDS Builder Scheduler - Rotates RDS text based on configured sequences."""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from dateutil.relativedelta import relativedelta
import uuid

from services.timezone_utils import (
    BRUSSELS_TZ, now_brussels, today_brussels,
    yesterday_brussels, is_time_between
)

logger = logging.getLogger(__name__)

# Track last text per station to detect changes
_last_text_tracker = {}


async def log_text_change(db, station: str, new_text: str, item_type: str, reason: str = None):
    """Log a text change to history if the text actually changed.
    
    Only logs when the text is different from the previous one to avoid spam.
    """
    global _last_text_tracker
    
    last_text = _last_text_tracker.get(station, "")
    
    if new_text != last_text:
        _last_text_tracker[station] = new_text
        
        now_brussels_dt = datetime.now(BRUSSELS_TZ)
        
        # Get presenter info if there's an active show
        presenters = []
        try:
            cached_rundown = await db.rds_cached_rundowns.find_one(
                {"is_active": True, "rds_station": {"$in": [station, "both"]}},
                {"_id": 0, "presenter_names": 1, "show_id": 1}
            )
            if cached_rundown:
                presenters = cached_rundown.get("presenter_names", [])
                if not presenters and cached_rundown.get("show_id"):
                    show = await db.shows.find_one(
                        {"id": cached_rundown["show_id"]},
                        {"_id": 0, "presenter_ids": 1}
                    )
                    if show and show.get("presenter_ids"):
                        presenter_docs = await db.users.find(
                            {"id": {"$in": show["presenter_ids"]}},
                            {"_id": 0, "name": 1}
                        ).to_list(10)
                        presenters = [p.get("name", "") for p in presenter_docs if p.get("name")]
        except Exception as e:
            logger.debug(f"Could not fetch presenter info: {e}")
        
        history_entry = {
            "id": str(uuid.uuid4()),
            "station": station,
            "text": new_text,
            "item_type": item_type,
            "reason": reason,
            "presenters": presenters,
            "timestamp": now_brussels_dt.isoformat(),
            "timestamp_formatted": now_brussels_dt.strftime("%H:%M:%S"),
        }
        
        try:
            await db.rds_output_history.insert_one(history_entry)
            
            # Keep only last 500 entries per station to prevent unbounded growth
            count = await db.rds_output_history.count_documents({"station": station})
            if count > 500:
                # Delete oldest entries
                oldest = await db.rds_output_history.find(
                    {"station": station}
                ).sort("timestamp", 1).limit(count - 500).to_list(count - 500)
                if oldest:
                    oldest_ids = [o["id"] for o in oldest]
                    await db.rds_output_history.delete_many({"id": {"$in": oldest_ids}})
        except Exception as e:
            logger.error(f"Failed to log RDS history: {e}")


async def get_now_playing_station_for(db, station: str) -> str:
    """Determine which station's now playing data to use.
    
    Each station always uses its own shoutcast stream data.
    This ensures that when separate shows run on MFY and GRK simultaneously,
    each station shows its own now playing info.
    """
    return station


async def get_active_audio_trigger_for_station(db, station: str) -> dict | None:
    """Check if there's an active audio trigger for this station.
    
    Audio triggers have the highest priority (except for shows).
    Returns the trigger action if one is active, or None.
    """
    state = await db.audio_trigger_states.find_one(
        {"station": {"$in": [station, "both"]}, "is_active": True},
        {"_id": 0}
    )
    
    if not state:
        return None
    
    action_type = state.get("action_type", "custom_text")
    
    # If action is "now_playing", return None to fall through to normal behavior
    if action_type == "now_playing":
        return None
    
    return {
        "text": state.get("action_text", ""),
        "trigger_id": state.get("trigger_id"),
        "action_type": action_type,
        "is_audio_trigger": True
    }


async def get_active_scheduled_text_for_station(db, station: str) -> dict | None:
    """Check if there's an active scheduled text for this station.
    
    Returns the active scheduled text dict if one is currently active,
    or None if no scheduled text is active.
    
    Priority order (high to low):
    1. Audio triggers (checked in process_rds_sequence, not here)
    2. Scheduled texts (THIS function)
    3. Live shows
    4. Normal sequence
    
    Scheduled texts ALWAYS have priority over live shows.
    
    ALL times are in Brussels timezone (Europe/Brussels).
    """
    # Use Brussels timezone for ALL time operations
    now = now_brussels()
    
    # NOTE: Live show checks removed - scheduled texts now have priority over shows
    # Audio triggers still have highest priority (checked in process_rds_sequence)
    
    # Get enabled scheduled texts for this station OR texts set to "both"
    texts = await db.rds_scheduled_texts.find(
        {"$or": [{"station": station}, {"station": "both"}], "enabled": True},
        {"_id": 0}
    ).to_list(1000)
    
    # Find which scheduled text is currently active
    for text in texts:
        # Parse start_datetime - assume Brussels timezone for stored datetimes
        start_dt_str = text["start_datetime"].replace("Z", "")
        try:
            text_start = datetime.fromisoformat(start_dt_str)
        except ValueError:
            text_start = datetime.fromisoformat(start_dt_str.split("+")[0])
        
        # If naive datetime, assume Brussels time (NOT UTC!)
        if text_start.tzinfo is None:
            text_start = text_start.replace(tzinfo=BRUSSELS_TZ)
        else:
            text_start = text_start.astimezone(BRUSSELS_TZ)
        
        recurrence = text.get("recurrence_type", "none")
        recurrence_end = text.get("recurrence_end_date")
        duration_type = text.get("duration_type", "fixed")
        duration_minutes = text.get("duration_minutes", 5) or 5
        
        # Check recurrence end date (only if explicitly set)
        if recurrence_end:
            try:
                recurrence_end_dt = datetime.strptime(recurrence_end, "%Y-%m-%d").replace(
                    hour=23, minute=59, second=59, tzinfo=BRUSSELS_TZ
                )
                if now > recurrence_end_dt:
                    continue  # This scheduled text has expired
            except ValueError:
                pass  # Invalid date format, ignore end date check
        # If no recurrence_end_date, this is "infinite" - continue forever
        
        # Calculate if this text is active now
        if recurrence == "none":
            # One-time event
            if duration_type == "fixed":
                end_time = text_start + timedelta(minutes=duration_minutes)
                if text_start <= now <= end_time:
                    return {
                        "text": text["text"],
                        "id": text["id"],
                        "ends_at": end_time,
                        "is_recurring": False
                    }
            else:
                # until_next - active from start time indefinitely (for one-time)
                if text_start <= now:
                    return {
                        "text": text["text"],
                        "id": text["id"],
                        "ends_at": None,
                        "is_recurring": False
                    }
        else:
            # Recurring event - check if current occurrence is active
            # Find the most recent occurrence that started before now
            current_occurrence = text_start
            max_iterations = 10000  # Increased for "infinite" schedules
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
                else:
                    break  # Unknown recurrence type
                
                if duration_type == "fixed":
                    end_time = current_occurrence + timedelta(minutes=duration_minutes)
                    if current_occurrence <= now <= end_time:
                        return {
                            "text": text["text"],
                            "id": text["id"],
                            "ends_at": end_time,
                            "is_recurring": True
                        }
                else:
                    # until_next - active until next occurrence
                    if next_occurrence and current_occurrence <= now < next_occurrence:
                        return {
                            "text": text["text"],
                            "id": text["id"],
                            "ends_at": next_occurrence,
                            "is_recurring": True
                        }
                
                if next_occurrence and next_occurrence > now:
                    break
                
                current_occurrence = next_occurrence if next_occurrence else now + timedelta(days=365)
                iteration += 1
    
    return None


async def get_item_text(db, station: str, item: dict) -> str:
    """Get the text for a sequence item."""
    item_type = item.get("type")
    
    if item_type == "custom_text":
        return item.get("content", "") or ""
    
    elif item_type == "show_name":
        # Get current live show title for this station
        # Only shows assigned to this station or "both" are considered
        cached = await db.rds_cached_rundowns.find_one(
            {"is_active": True, "rds_station": {"$in": [station, "both"]}},
            {"_id": 0, "show_title": 1}
        )
        if cached and cached.get("show_title"):
            return cached["show_title"]
        
        # Default fallback when no show for this station
        default_names = {
            "grk": "the feelgood station",
            "mfy": "altijd dichtbij"
        }
        return default_names.get(station, "")
    
    elif item_type == "presenter_name":
        # Get current live show presenters for this station
        cached = await db.rds_cached_rundowns.find_one(
            {"is_active": True, "rds_station": {"$in": [station, "both"]}},
            {"_id": 0, "show_id": 1}
        )
        if cached and cached.get("show_id"):
            # Get the show with presenter info
            show = await db.shows.find_one(
                {"id": cached["show_id"]},
                {"_id": 0, "presenter_ids": 1}
            )
            if show and show.get("presenter_ids"):
                # Fetch presenter names
                presenters = await db.users.find(
                    {"id": {"$in": show["presenter_ids"]}},
                    {"_id": 0, "name": 1}
                ).to_list(10)
                
                if presenters:
                    # Join with " & " for multiple presenters
                    names = [p.get("name", "") for p in presenters if p.get("name")]
                    if names:
                        return " & ".join(names)
        return ""
    
    elif item_type == "now_playing":
        # Determine which station's now playing to use
        # If active show is "both", GRK uses MFY's now playing
        source_station = await get_now_playing_station_for(db, station)
        
        # Get cached now playing from shoutcast
        cached = await db.shoutcast_cache.find_one(
            {"station": source_station},
            {"_id": 0, "song_title": 1, "is_stale": 1, "raw_song_title": 1}
        )
        if cached:
            # If now_playing is stale, return empty string to skip this item
            # This prevents showing duplicate "altijd dichtbij" from both show_name and now_playing
            if cached.get("is_stale"):
                return ""
            
            song_title = cached.get("song_title", "")
            raw_title = cached.get("raw_song_title", "")
            
            # Check if the title appears unformatted (all caps including song part)
            # This can happen when the cache hasn't been updated yet after deployment
            # In this case, show fallback text to give time for proper formatting
            if song_title and raw_title:
                # Import the check function
                from services.shoutcast import is_unformatted_title
                if is_unformatted_title(song_title):
                    logger.debug(f"[{station}] Now playing appears unformatted, showing fallback: {song_title}")
                    return ""  # Return empty to skip and show fallback
            
            if song_title:
                return song_title
        return ""
    
    elif item_type == "audio_trigger":
        # Get active audio trigger text for this station
        # Audio triggers are activated when jingles (news, ads) are detected
        state = await db.audio_trigger_states.find_one(
            {"station": {"$in": [station, "both"]}, "is_active": True},
            {"_id": 0, "action_text": 1, "action_type": 1}
        )
        
        if state:
            action_type = state.get("action_type", "custom_text")
            # Only return text if it's a custom_text action (not "now_playing" action)
            if action_type == "custom_text":
                return state.get("action_text", "")
        return ""
    
    return ""


async def process_rds_sequence(db, station: str):
    """Process the RDS sequence for a station and update the output.
    
    ALL times are in Brussels timezone (Europe/Brussels).
    """
    now = now_brussels()
    timestamp = now.isoformat()
    
    # PRIORITY 0: Check for active audio trigger
    # Audio triggers (sound detection) have highest priority
    active_audio_trigger = await get_active_audio_trigger_for_station(db, station)
    
    if active_audio_trigger:
        # An audio trigger is active - update output with trigger action
        output_data = {
            "station": station,
            "current_index": -2,  # -2 indicates audio trigger
            "current_text": active_audio_trigger["text"],
            "current_item_type": "audio_trigger",
            "current_item_id": active_audio_trigger.get("trigger_id"),
            "audio_trigger_active": True,
            "scheduled_text_active": False,
            "next_change_at": (now + timedelta(seconds=5)).isoformat(),  # Re-check frequently
            "updated_at": timestamp
        }
        
        await db.rds_builder_output.update_one(
            {"station": station},
            {"$set": output_data},
            upsert=True
        )
        
        # Log to history
        await log_text_change(db, station, active_audio_trigger["text"], "audio_trigger", "Audio trigger activated")
        
        logger.debug(f"RDS Builder [{station}]: Audio trigger active: '{active_audio_trigger['text'][:50]}...'")
        return
    
    # PRIORITY 1: Check for active scheduled text
    # Scheduled texts from the RDS Custom Text Scheduler have priority over sequence items
    active_scheduled = await get_active_scheduled_text_for_station(db, station)
    
    if active_scheduled:
        # A scheduled text is active - update output with this text
        output_data = {
            "station": station,
            "current_index": -1,  # -1 indicates scheduled text, not sequence item
            "current_text": active_scheduled["text"],
            "current_item_type": "scheduled_text",
            "current_item_id": active_scheduled["id"],
            "scheduled_text_active": True,
            "audio_trigger_active": False,
            "scheduled_text_ends_at": active_scheduled["ends_at"].isoformat() if active_scheduled.get("ends_at") else None,
            "next_change_at": (active_scheduled["ends_at"].isoformat() if active_scheduled.get("ends_at") 
                             else (now + timedelta(seconds=60)).isoformat()),  # Re-check in 60s for infinite
            "updated_at": timestamp
        }
        
        await db.rds_builder_output.update_one(
            {"station": station},
            {"$set": output_data},
            upsert=True
        )
        
        # Log to history
        await log_text_change(db, station, active_scheduled["text"], "scheduled_text", "Scheduled text activated")
        
        logger.debug(f"RDS Builder [{station}]: Scheduled text active: '{active_scheduled['text'][:50]}...'")
        return
    
    # PRIORITY 2: Process normal sequence if no scheduled text is active
    # Get sequence configuration
    sequence = await db.rds_sequences.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    if not sequence or not sequence.get("enabled"):
        # Sequence disabled: re-evaluate current item to keep output fresh
        # This prevents stale show names from staying in the output after a show ends
        current_output = await db.rds_builder_output.find_one(
            {"station": station},
            {"_id": 0}
        )
        
        default_names = {
            "grk": "the feelgood station",
            "mfy": "altijd dichtbij"
        }
        
        # Always re-evaluate: get fresh text for the current item type
        old_text = current_output.get("current_text", "") if current_output else ""
        old_item_type = current_output.get("current_item_type", "") if current_output else ""
        
        # Re-evaluate text based on current item type
        if old_item_type in ("show_name", "now_playing", "presenter_name"):
            fresh_text = await get_item_text(db, station, {"type": old_item_type})
            if not fresh_text:
                fresh_text = default_names.get(station, "")
            new_item_type = old_item_type
        elif old_item_type in ("scheduled_text", "audio_trigger") or not old_item_type:
            # Scheduled text or audio trigger ended, or no item type set - use default
            fresh_text = default_names.get(station, "")
            new_item_type = "show_name"
        else:
            fresh_text = old_text
            new_item_type = old_item_type
        
        await db.rds_builder_output.update_one(
            {"station": station},
            {"$set": {
                "scheduled_text_active": False, 
                "audio_trigger_active": False,
                "current_text": fresh_text,
                "current_index": 0,
                "current_item_type": new_item_type,
                "scheduled_text_ends_at": None,
                "updated_at": timestamp
            }},
            upsert=True
        )
        
        if fresh_text != old_text:
            await log_text_change(db, station, fresh_text, new_item_type, "Stale content refreshed (sequence disabled)")
            logger.info(f"RDS Builder [{station}]: Updated stale output '{old_text[:40]}' -> '{fresh_text[:40]}' (sequence disabled)")
        
        return
    
    items = sequence.get("items", [])
    if not items:
        return
    
    # Get current output state
    output = await db.rds_builder_output.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    current_index = 0
    next_change_at = None
    was_scheduled_text = False
    was_audio_trigger = False
    
    if output:
        # Check if we were showing a scheduled text or audio trigger before
        was_scheduled_text = output.get("scheduled_text_active", False)
        was_audio_trigger = output.get("audio_trigger_active", False)
        
        # ALSO check if output is stale from an ENDED scheduled text or audio trigger
        # This handles the race condition where the flag is already False but we're still showing old content
        current_item_type = output.get("current_item_type", "")
        stored_index = output.get("current_index", 0)
        if not was_scheduled_text and current_item_type == "scheduled_text" and stored_index == -1:
            # The scheduled text ended but we haven't switched back to normal sequence yet
            was_scheduled_text = True
            logger.debug(f"RDS Builder [{station}]: Detected stale scheduled text state, forcing refresh")
        if not was_audio_trigger and current_item_type == "audio_trigger" and stored_index == -2:
            # The audio trigger ended but we haven't switched back to normal sequence yet
            was_audio_trigger = True
            logger.debug(f"RDS Builder [{station}]: Detected stale audio trigger state, forcing refresh")
        
        if not was_scheduled_text and not was_audio_trigger:
            current_index = stored_index
            # Reset if index was negative (scheduled text or audio trigger marker)
            if current_index < 0:
                current_index = 0
            next_change_str = output.get("next_change_at")
            if next_change_str:
                try:
                    next_change_at = datetime.fromisoformat(next_change_str.replace('Z', '+00:00'))
                except (ValueError, TypeError):
                    next_change_at = None
    
    # Check if it's time to change
    should_change = False
    if was_scheduled_text or was_audio_trigger:
        # Returning from scheduled text or audio trigger, force change
        should_change = True
    elif next_change_at is None:
        should_change = True
    elif now >= next_change_at:
        should_change = True
    
    if should_change:
        # Move to next item
        if output and not was_scheduled_text and not was_audio_trigger:
            current_index = (current_index + 1) % len(items)
            if current_index == 0 and not sequence.get("loop", True):
                # Don't loop, stay at last item
                current_index = len(items) - 1
        
        # Find the next item with actual content
        # Skip items that would result in empty text
        attempts = 0
        max_attempts = len(items)
        current_text = ""
        
        while attempts < max_attempts:
            current_item = items[current_index]
            current_text = await get_item_text(db, station, current_item)
            
            if current_text:  # Found an item with content
                break
                
            # Skip to next item
            current_index = (current_index + 1) % len(items)
            attempts += 1
            
            if current_index == 0 and not sequence.get("loop", True):
                current_index = len(items) - 1
                break
        
        duration = current_item.get("duration", 5)
        
        # Calculate next change time
        next_change_at = now + timedelta(seconds=duration)
        
        # Update output
        output_data = {
            "station": station,
            "current_index": current_index,
            "current_text": current_text,
            "current_item_type": current_item.get("type"),
            "current_item_id": current_item.get("id"),
            "scheduled_text_active": False,
            "audio_trigger_active": False,
            "scheduled_text_ends_at": None,
            "next_change_at": next_change_at.isoformat(),
            "updated_at": timestamp
        }
        
        await db.rds_builder_output.update_one(
            {"station": station},
            {"$set": output_data},
            upsert=True
        )
        
        # Log to history (only logs if text actually changed)
        await log_text_change(db, station, current_text, current_item.get("type"), "Sequence rotation")
        
        logger.debug(f"RDS Builder [{station}]: '{current_text}' (next change in {duration}s)")


async def run_rds_builder_cycle(db):
    """Run one cycle of the RDS builder for all dynamic stations."""
    # Get all station codes from DB
    all_stations = await db.rds_stations.find({}, {"_id": 0, "code": 1}).to_list(100)
    station_codes = [s["code"] for s in all_stations] if all_stations else ["mfy", "grk"]
    
    for station in station_codes:
        try:
            await process_rds_sequence(db, station)
        except Exception as e:
            logger.error(f"RDS Builder error for {station}: {e}")
    
    # Also process named outputs
    await process_named_outputs(db)


async def process_named_outputs(db):
    """Process all named RDS outputs (streaming, dab, fm, etc.)."""
    # Get all enabled outputs
    outputs = await db.rds_outputs.find(
        {"enabled": True},
        {"_id": 0}
    ).to_list(100)
    
    for output_config in outputs:
        try:
            await process_named_output(db, output_config)
        except Exception as e:
            logger.error(f"RDS Output error for {output_config.get('slug')}: {e}")


async def process_named_output(db, output_config: dict):
    """Process a single named RDS output and update its state.
    
    ALL times are in Brussels timezone (Europe/Brussels).
    """
    now = now_brussels()
    timestamp = now.isoformat()
    
    output_id = output_config.get("id")
    station = output_config.get("station")
    items = output_config.get("items", [])
    
    # PRIORITY 1: Check for active scheduled text for this station
    active_scheduled = await get_active_scheduled_text_for_station(db, station)
    
    if active_scheduled:
        # A scheduled text is active - update output state with this text
        state_data = {
            "output_id": output_id,
            "station": station,
            "current_index": -1,  # -1 indicates scheduled text
            "current_text": active_scheduled["text"],
            "current_item_type": "scheduled_text",
            "scheduled_text_active": True,
            "scheduled_text_id": active_scheduled["id"],
            "next_change_at": (active_scheduled["ends_at"].isoformat() if active_scheduled.get("ends_at")
                             else (now + timedelta(seconds=60)).isoformat()),
            "updated_at": timestamp
        }
        
        await db.rds_output_states.update_one(
            {"output_id": output_id},
            {"$set": state_data},
            upsert=True
        )
        
        logger.debug(f"RDS Output [{output_config.get('slug')}]: Scheduled text: '{active_scheduled['text'][:30]}...'")
        return
    
    # PRIORITY 2: Process normal output items
    # Filter to only enabled items
    enabled_items = [item for item in items if item.get("enabled", True)]
    
    if not enabled_items:
        # No enabled items: re-evaluate current output to keep it fresh
        state = await db.rds_output_states.find_one(
            {"output_id": output_id},
            {"_id": 0}
        )
        if state:
            default_names = {"grk": "the feelgood station", "mfy": "altijd dichtbij"}
            old_text = state.get("current_text", "")
            old_item_type = state.get("current_item_type", "")
            
            # Re-evaluate text based on current item type
            if old_item_type in ("show_name", "now_playing", "presenter_name"):
                fresh_text = await get_item_text(db, station, {"type": old_item_type})
                if not fresh_text:
                    fresh_text = default_names.get(station, "")
            else:
                fresh_text = default_names.get(station, "")
            
            if fresh_text != old_text:
                await db.rds_output_states.update_one(
                    {"output_id": output_id},
                    {"$set": {
                        "current_text": fresh_text,
                        "current_index": 0,
                        "current_item_type": "show_name",
                        "scheduled_text_active": False,
                        "scheduled_text_id": None,
                        "updated_at": timestamp
                    }},
                    upsert=True
                )
                logger.info(f"RDS Output [{output_config.get('slug')}]: Refreshed stale output '{old_text[:40]}' -> '{fresh_text[:40]}'")
        return
    
    # Get current output state
    state = await db.rds_output_states.find_one(
        {"output_id": output_id},
        {"_id": 0}
    )
    
    current_index = 0
    next_change_at = None
    was_scheduled_text = False
    
    if state:
        was_scheduled_text = state.get("scheduled_text_active", False)
        
        # ALSO check if output is stale from an ENDED scheduled text
        current_item_type = state.get("current_item_type", "")
        stored_index = state.get("current_index", 0)
        if not was_scheduled_text and current_item_type == "scheduled_text" and stored_index == -1:
            was_scheduled_text = True
            logger.debug(f"RDS Output [{output_config.get('slug')}]: Detected stale scheduled text state, forcing refresh")
        
        if not was_scheduled_text:
            current_index = stored_index
            if current_index < 0:
                current_index = 0
            next_change_str = state.get("next_change_at")
            if next_change_str:
                try:
                    next_change_at = datetime.fromisoformat(next_change_str.replace('Z', '+00:00'))
                except (ValueError, TypeError):
                    next_change_at = None
    
    # Check if it's time to change
    should_change = False
    if was_scheduled_text:
        should_change = True
    elif next_change_at is None:
        should_change = True
    elif now >= next_change_at:
        should_change = True
    
    if should_change:
        # Move to next item
        if state and not was_scheduled_text:
            current_index = (current_index + 1) % len(enabled_items)
            if current_index == 0 and not output_config.get("loop", True):
                current_index = len(enabled_items) - 1
        
        # Find the next item with actual content
        attempts = 0
        max_attempts = len(enabled_items)
        current_text = ""
        
        while attempts < max_attempts:
            # Ensure index is valid
            if current_index >= len(enabled_items):
                current_index = 0
            
            current_item = enabled_items[current_index]
            current_text = await get_item_text(db, station, current_item)
            
            if current_text:
                break
            
            current_index = (current_index + 1) % len(enabled_items)
            attempts += 1
            
            if current_index == 0 and not output_config.get("loop", True):
                current_index = len(enabled_items) - 1
                break
        
        duration = current_item.get("duration", 5)
        
        next_change_at = now + timedelta(seconds=duration)
        
        # Update output state
        state_data = {
            "output_id": output_id,
            "station": station,
            "current_index": current_index,
            "current_text": current_text,
            "current_item_type": current_item.get("type"),
            "scheduled_text_active": False,
            "scheduled_text_id": None,
            "next_change_at": next_change_at.isoformat(),
            "updated_at": timestamp
        }
        
        await db.rds_output_states.update_one(
            {"output_id": output_id},
            {"$set": state_data},
            upsert=True
        )
        
        logger.debug(f"RDS Output [{output_config.get('slug')}]: '{current_text}' (next in {duration}s)")


class RDSBuilderScheduler:
    """Background scheduler for RDS Builder text rotation."""
    
    def __init__(self, db):
        self.db = db
        self.running = False
        self.check_interval = 1  # Check every 1 second for smooth transitions
        self.full_refresh_interval = 180  # Full refresh every 3 minutes
        self.task = None
        self._last_full_refresh = 0
    
    async def start(self):
        """Start the RDS Builder scheduler."""
        if self.running:
            logger.warning("RDS Builder scheduler is already running")
            return
        
        self.running = True
        self.task = asyncio.create_task(self._run_loop())
        logger.info(f"RDS Builder scheduler started ({self.check_interval}s interval)")
    
    async def stop(self):
        """Stop the RDS Builder scheduler."""
        if not self.running:
            return
        
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("RDS Builder scheduler stopped")
    
    async def _run_loop(self):
        """Main loop that processes RDS sequences."""
        import time
        while self.running:
            try:
                await run_rds_builder_cycle(self.db)
                
                # Periodic full refresh: deactivate stale shows and rebuild outputs
                now = time.time()
                if now - self._last_full_refresh >= self.full_refresh_interval:
                    self._last_full_refresh = now
                    await self._background_full_refresh()
                
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"RDS Builder scheduler error: {e}")
                await asyncio.sleep(5)

    async def _background_full_refresh(self):
        """Periodic background refresh: check live shows and clear stale data.
        
        This is the automatic equivalent of the manual Force Refresh button.
        Runs every 3 minutes to keep outputs in sync with the calendar.
        """
        try:
            from services.rds_scheduler import run_scheduled_cache_refresh
            from services.timezone_utils import BRUSSELS_TZ
            
            now_brussels = datetime.now(BRUSSELS_TZ)
            timestamp = now_brussels.isoformat()
            
            default_names = {}
            all_st = await self.db.rds_stations.find({}, {"_id": 0, "code": 1, "default_text": 1}).to_list(100)
            for st in all_st:
                default_names[st["code"]] = st.get("default_text", st["code"])
            station_codes = [s["code"] for s in all_st] if all_st else ["mfy", "grk"]
            
            # 1. Refresh the live show cache (deactivates ended shows)
            await run_scheduled_cache_refresh()
            
            # 2. For each station, check if builder output is stale
            for station in station_codes:
                # Check if there's actually a live show right now
                has_active = await self.db.rds_cached_rundowns.find_one(
                    {"is_active": True, "rds_station": {"$in": [station, "both"]}},
                    {"_id": 0, "show_title": 1}
                )
                
                # Check current builder output
                output = await self.db.rds_builder_output.find_one(
                    {"station": station}, {"_id": 0}
                )
                
                if not output:
                    continue
                
                current_type = output.get("current_item_type", "")
                current_text = output.get("current_text", "")
                
                # If output says show_name but no show is live, it's stale — fix it
                if current_type == "show_name" and not has_active:
                    fresh_text = await get_item_text(self.db, station, {"type": "show_name"})
                    if not fresh_text:
                        fresh_text = default_names.get(station, "")
                    
                    if fresh_text != current_text:
                        await self.db.rds_builder_output.update_one(
                            {"station": station},
                            {"$set": {
                                "current_text": fresh_text,
                                "current_item_type": "show_name",
                                "current_index": 0,
                                "next_change_at": (now_brussels + timedelta(seconds=3)).isoformat(),
                                "updated_at": timestamp
                            }}
                        )
                        await log_text_change(self.db, station, fresh_text, "show_name", "Background refresh: stale show cleared")
                        logger.info(f"RDS Builder [{station}]: Background refresh cleared stale show '{current_text[:30]}' -> '{fresh_text[:30]}'")
            
            logger.info("RDS Builder: Background full refresh completed")
            
        except Exception as e:
            logger.error(f"RDS Builder background refresh error: {e}")



# Global scheduler instance (initialized in server.py)
rds_builder_scheduler = None
