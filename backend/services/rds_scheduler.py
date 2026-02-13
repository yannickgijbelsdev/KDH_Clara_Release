"""RDS Cache Scheduler - Refreshes live show cache every 5 minutes."""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
import uuid

from database import db

logger = logging.getLogger(__name__)


async def refresh_live_show_cache(team_id: str = None) -> dict:
    """Refresh the cached rundown for the current live show.
    
    Args:
        team_id: Optional team_id to refresh cache for specific team.
                If None, refreshes for all teams with active live shows.
    
    Returns:
        Dict with refresh status and details.
    """
    now_utc = datetime.now(timezone.utc)
    # Also calculate CET/CEST time (UTC+1 in winter, UTC+2 in summer)
    # Belgium/Netherlands use CET, so add 1 hour (or 2 for summer time)
    # For simplicity, try both UTC and CET (UTC+1)
    now_cet = now_utc + timedelta(hours=1)
    
    timestamp = now_utc.isoformat()
    
    # Try to find live shows using both UTC and local (CET) time
    # This handles cases where shows are stored in local time
    queries_to_try = [
        # Try CET time first (most likely for European users)
        {
            "date": now_cet.strftime('%Y-%m-%d'),
            "time": now_cet.strftime('%H:%M')
        },
        # Also try UTC
        {
            "date": now_utc.strftime('%Y-%m-%d'),
            "time": now_utc.strftime('%H:%M')
        }
    ]
    
    live_shows = []
    
    for q in queries_to_try:
        current_time = q["time"]
        current_date = q["date"]
        
        if team_id:
            base_query = {"status": "scheduled", "date": current_date, "team_id": team_id}
        else:
            base_query = {"status": "scheduled", "date": current_date}
        
        # Get all shows for today
        all_shows_today = await db.shows.find(base_query, {"_id": 0}).to_list(100)
        
        # Filter to find which shows are currently live
        for show in all_shows_today:
            start = show.get("start_time", "00:00")
            end = show.get("end_time", "23:59")
            
            is_live = False
            
            if start <= end:
                # Normal show (doesn't cross midnight)
                is_live = start <= current_time <= end
            else:
                # Show crosses midnight (e.g., 22:00 - 00:00)
                # Live if: current >= start (show started today, hasn't ended yet)
                is_live = current_time >= start
            
            if is_live:
                live_shows.append(show)
        
        if live_shows:
            logger.info(f"Found {len(live_shows)} live shows using time {current_time} on {current_date}")
            break
    
    results = []
    
    if not live_shows:
        # No live shows - mark any active caches as inactive
        await db.rds_cached_rundowns.update_many(
            {"is_active": True},
            {"$set": {"is_active": False, "updated_at": timestamp}}
        )
        
        # Log for each team that has RDS settings
        if team_id:
            log_entry = {
                "id": str(uuid.uuid4()),
                "team_id": team_id,
                "timestamp": timestamp,
                "status": "no_show",
                "show_id": None,
                "show_title": None,
                "message": "Geen live show gevonden voor de huidige tijd",
                "cached_data": None
            }
            await db.rds_cache_logs.insert_one(log_entry)
            log_entry.pop("_id", None)  # Remove MongoDB ObjectId before returning
            results.append(log_entry)
        
        return {
            "status": "no_show",
            "message": "Geen live show gevonden",
            "shows_cached": 0,
            "logs": results
        }
    
    # Process each live show
    for show in live_shows:
        show_team_id = show.get("team_id")
        show_id = show.get("id")
        show_title = show.get("title")
        
        try:
            # Fetch the show title template to get the rds_station setting
            show_title_doc = await db.show_titles.find_one(
                {"name": show_title, "team_id": show_team_id},
                {"_id": 0, "rds_station": 1}
            )
            rds_station = show_title_doc.get("rds_station", "none") if show_title_doc else "none"
            
            # Fetch rundown items for this show
            rundown_items = await db.rundown_items.find(
                {"show_id": show_id},
                {"_id": 0}
            ).sort("order", 1).to_list(100)
            
            # Build cached data
            cached_data = {
                "show_id": show_id,
                "show_title": show_title,
                "show_date": show.get("date"),
                "show_start_time": show.get("start_time"),
                "show_end_time": show.get("end_time"),
                "rds_station": rds_station,
                "items": rundown_items,
                "cached_at": timestamp,
                "team_id": show_team_id,
                "is_active": True,
                "updated_at": timestamp
            }
            
            # Upsert cached rundown
            await db.rds_cached_rundowns.update_one(
                {"team_id": show_team_id},
                {"$set": cached_data},
                upsert=True
            )
            
            # Update RDS settings with last refresh time
            await db.rds_settings.update_one(
                {"team_id": show_team_id},
                {"$set": {"last_cache_refresh": timestamp}}
            )
            
            # Log success
            log_entry = {
                "id": str(uuid.uuid4()),
                "team_id": show_team_id,
                "timestamp": timestamp,
                "status": "success",
                "show_id": show_id,
                "show_title": show_title,
                "message": f"Cache vernieuwd voor '{show_title}' ({len(rundown_items)} items) - RDS: {rds_station}",
                "cached_data": {
                    "item_count": len(rundown_items),
                    "show_date": show.get("date"),
                    "show_time": f"{show.get('start_time')} - {show.get('end_time')}"
                }
            }
            await db.rds_cache_logs.insert_one(log_entry)
            log_entry.pop("_id", None)  # Remove MongoDB ObjectId before returning
            results.append(log_entry)
            
            logger.info(f"RDS cache refreshed for show '{show_title}' (team: {show_team_id})")
            
        except Exception as e:
            # Log failure
            log_entry = {
                "id": str(uuid.uuid4()),
                "team_id": show_team_id,
                "timestamp": timestamp,
                "status": "failed",
                "show_id": show_id,
                "show_title": show_title,
                "message": f"Cache refresh mislukt: {str(e)}",
                "cached_data": None
            }
            await db.rds_cache_logs.insert_one(log_entry)
            log_entry.pop("_id", None)  # Remove MongoDB ObjectId before returning
            results.append(log_entry)
            
            logger.error(f"RDS cache refresh failed for show '{show_title}': {e}")
    
    return {
        "status": "success",
        "message": f"Cache vernieuwd voor {len(live_shows)} show(s)",
        "shows_cached": len(live_shows),
        "logs": results
    }


async def run_scheduled_cache_refresh():
    """Scheduled job that refreshes cache for all teams."""
    logger.info("Running scheduled RDS cache refresh...")
    
    # Get all teams with RDS settings
    settings_list = await db.rds_settings.find({}, {"_id": 0, "team_id": 1}).to_list(100)
    
    if not settings_list:
        # No teams have RDS settings - still refresh for any live shows
        await refresh_live_show_cache()
    else:
        # Refresh for each team
        for settings in settings_list:
            team_id = settings.get("team_id")
            await refresh_live_show_cache(team_id)


class RDSScheduler:
    """Background scheduler for RDS cache refresh jobs."""
    
    def __init__(self):
        self.running = False
        self.check_interval = 300  # 5 minutes in seconds
        self.task = None
    
    async def start(self):
        """Start the RDS cache scheduler."""
        if self.running:
            logger.warning("RDS scheduler is already running")
            return
        
        self.running = True
        self.task = asyncio.create_task(self._run_loop())
        logger.info("RDS cache scheduler started (5 min interval)")
    
    async def stop(self):
        """Stop the RDS cache scheduler."""
        if not self.running:
            return
        
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("RDS cache scheduler stopped")
    
    async def _run_loop(self):
        """Main loop that runs the scheduler."""
        # Run initial refresh
        await run_scheduled_cache_refresh()
        
        while self.running:
            try:
                await asyncio.sleep(self.check_interval)
                if self.running:
                    await run_scheduled_cache_refresh()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"RDS scheduler error: {e}")
                await asyncio.sleep(60)  # Wait a minute before retrying


# Global scheduler instance
rds_scheduler = RDSScheduler()
