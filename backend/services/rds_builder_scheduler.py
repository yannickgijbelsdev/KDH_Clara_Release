"""RDS Builder Scheduler - Rotates RDS text based on configured sequences."""
import asyncio
import logging
from datetime import datetime, timezone
import uuid

logger = logging.getLogger(__name__)


async def get_item_text(db, station: str, item: dict) -> str:
    """Get the text for a sequence item."""
    item_type = item.get("type")
    
    if item_type == "custom_text":
        return item.get("content", "") or ""
    
    elif item_type == "show_name":
        # Get current live show title
        # First try to find a show specifically assigned to this station or "both"
        cached = await db.rds_cached_rundowns.find_one(
            {"is_active": True, "rds_station": {"$in": [station, "both"]}},
            {"_id": 0, "show_title": 1}
        )
        if cached and cached.get("show_title"):
            return cached["show_title"]
        
        # Fallback: find any active show (including those with rds_station = "none" or not set)
        cached = await db.rds_cached_rundowns.find_one(
            {"is_active": True},
            {"_id": 0, "show_title": 1}
        )
        if cached and cached.get("show_title"):
            return cached["show_title"]
        return ""
    
    elif item_type == "now_playing":
        # Get cached now playing from shoutcast
        cached = await db.shoutcast_cache.find_one(
            {"station": station},
            {"_id": 0, "song_title": 1}
        )
        if cached and cached.get("song_title"):
            return cached["song_title"]
        return ""
    
    return ""


async def process_rds_sequence(db, station: str):
    """Process the RDS sequence for a station and update the output."""
    now = datetime.now(timezone.utc)
    timestamp = now.isoformat()
    
    # Get sequence configuration
    sequence = await db.rds_sequences.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    if not sequence or not sequence.get("enabled"):
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
    
    if output:
        current_index = output.get("current_index", 0)
        next_change_str = output.get("next_change_at")
        if next_change_str:
            try:
                next_change_at = datetime.fromisoformat(next_change_str.replace('Z', '+00:00'))
            except (ValueError, TypeError):
                next_change_at = None
    
    # Check if it's time to change
    should_change = False
    if next_change_at is None:
        should_change = True
    elif now >= next_change_at:
        should_change = True
    
    if should_change:
        # Move to next item
        if output:
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
        from datetime import timedelta
        next_change_at = now + timedelta(seconds=duration)
        
        # Update output
        output_data = {
            "station": station,
            "current_index": current_index,
            "current_text": current_text,
            "current_item_type": current_item.get("type"),
            "current_item_id": current_item.get("id"),
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
