"""RDS Builder Scheduler - Rotates RDS text based on configured sequences."""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta
import uuid

logger = logging.getLogger(__name__)


async def get_now_playing_station_for(db, station: str) -> str:
    """Determine which station's now playing data to use.
    
    If the current active show has rds_station="both", GRK uses MFY's now playing.
    Otherwise, use the requested station's own now playing.
    """
    if station == "grk":
        # Check if there's an active show with rds_station="both"
        active_show = await db.rds_cached_rundowns.find_one(
            {"is_active": True, "rds_station": "both"},
            {"_id": 0, "rds_station": 1}
        )
        if active_show:
            # Show is on both stations, GRK uses MFY's now playing
            return "mfy"
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
    
    Scheduled texts have priority over sequence items.
    Shows have priority over scheduled texts.
    """
    now = datetime.now(timezone.utc)
    
    # First check if there's an active show - shows have priority
    # Check both UTC and CET time for show matching
    now_cet = now + timedelta(hours=1)
    
    for check_time in [now_cet, now]:
        active_show = await db.shows.find_one({
            "date": check_time.strftime("%Y-%m-%d"),
            "start_time": {"$lte": check_time.strftime("%H:%M")},
            "end_time": {"$gte": check_time.strftime("%H:%M")},
            "$or": [
                {"rds_station": station},
                {"rds_station": "both"}
            ]
        })
        if active_show:
            return None  # Show is active, no scheduled text should override
    
    # Also check cached rundowns (more reliable than direct show check)
    cached_rundown = await db.rds_cached_rundowns.find_one(
        {"is_active": True, "rds_station": {"$in": [station, "both"]}},
        {"_id": 0, "show_title": 1}
    )
    if cached_rundown and cached_rundown.get("show_title"):
        return None  # Show is active via cache
    
    # Get enabled scheduled texts for this station OR texts set to "both"
    texts = await db.rds_scheduled_texts.find(
        {"$or": [{"station": station}, {"station": "both"}], "enabled": True},
        {"_id": 0}
    ).to_list(1000)
    
    # Find which scheduled text is currently active
    for text in texts:
        # Parse start_datetime and ensure it's timezone-aware
        start_dt_str = text["start_datetime"].replace("Z", "+00:00")
        try:
            text_start = datetime.fromisoformat(start_dt_str)
        except ValueError:
            # Handle datetime without timezone
            text_start = datetime.fromisoformat(start_dt_str.split("+")[0])
            text_start = text_start.replace(tzinfo=timezone.utc)
        
        # If naive datetime, assume UTC
        if text_start.tzinfo is None:
            text_start = text_start.replace(tzinfo=timezone.utc)
        
        recurrence = text.get("recurrence_type", "none")
        recurrence_end = text.get("recurrence_end_date")
        duration_type = text.get("duration_type", "fixed")
        duration_minutes = text.get("duration_minutes", 5) or 5
        
        # Check recurrence end date (only if explicitly set)
        if recurrence_end:
            try:
                recurrence_end_dt = datetime.fromisoformat(recurrence_end + "T23:59:59+00:00")
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
            {"_id": 0, "song_title": 1, "is_stale": 1}
        )
        if cached:
            # If now_playing is stale, return empty string to skip this item
            # This prevents showing duplicate "altijd dichtbij" from both show_name and now_playing
            if cached.get("is_stale"):
                return ""
            if cached.get("song_title"):
                return cached["song_title"]
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
    """Process the RDS sequence for a station and update the output."""
    now = datetime.now(timezone.utc)
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
        
        logger.debug(f"RDS Builder [{station}]: Scheduled text active: '{active_scheduled['text'][:50]}...'")
        return
    
    # PRIORITY 2: Process normal sequence if no scheduled text is active
    # Get sequence configuration
    sequence = await db.rds_sequences.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    if not sequence or not sequence.get("enabled"):
        # Clear flags if sequence is disabled
        await db.rds_builder_output.update_one(
            {"station": station},
            {"$set": {
                "scheduled_text_active": False, 
                "audio_trigger_active": False,
                "updated_at": timestamp
            }},
            upsert=True
        )
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
        
        if not was_scheduled_text and not was_audio_trigger:
            current_index = output.get("current_index", 0)
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
        
        logger.debug(f"RDS Builder [{station}]: '{current_text}' (next change in {duration}s)")


async def run_rds_builder_cycle(db):
    """Run one cycle of the RDS builder for both stations."""
    for station in ["mfy", "grk"]:
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
    """Process a single named RDS output and update its state."""
    now = datetime.now(timezone.utc)
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
        
        if not was_scheduled_text:
            current_index = state.get("current_index", 0)
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
        self.task = None
    
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
        while self.running:
            try:
                await run_rds_builder_cycle(self.db)
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"RDS Builder scheduler error: {e}")
                await asyncio.sleep(5)


# Global scheduler instance (initialized in server.py)
rds_builder_scheduler = None
