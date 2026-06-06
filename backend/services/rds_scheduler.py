"""RDS Cache Scheduler - Refreshes live show cache every minute."""
import asyncio
import logging
from datetime import datetime, timezone
import uuid

from database import db
from services.timezone_utils import (
    BRUSSELS_TZ, now_brussels as get_now_brussels, today_brussels,
    current_time_brussels, yesterday_brussels
)

logger = logging.getLogger(__name__)


async def refresh_live_show_cache(team_id: str = None) -> dict:
    """Refresh the cached rundown for the current live show.
    
    Args:
        team_id: Optional identifier (team_id or main_site_id) to refresh cache for.
                If None, refreshes for all teams with active live shows.
    
    Returns:
        Dict with refresh status and details.
        
    ALL times are in Brussels timezone (Europe/Brussels).
    """
    # Use ONLY Brussels timezone - no UTC fallback needed
    now_brussels_dt = get_now_brussels()
    current_date = today_brussels()
    current_time = current_time_brussels()
    yesterday_date = yesterday_brussels()
    
    timestamp = now_brussels_dt.isoformat()
    
    # Resolve all team_ids: if identifier is a main_site_id, get all child site team_ids
    team_ids_to_search = set()
    if team_id:
        team_ids_to_search.add(team_id)
        # Check if this is a main_site_id and get child site team_ids
        child_sites = await db.sites.find(
            {"main_site_id": team_id},
            {"_id": 0, "team_id": 1}
        ).to_list(50)
        for site in child_sites:
            if site.get("team_id"):
                team_ids_to_search.add(site["team_id"])
    
    team_ids_list = list(team_ids_to_search)
    logger.info(f"RDS refresh for identifier={team_id}, resolved team_ids={team_ids_list}, brussels={now_brussels_dt.strftime('%Y-%m-%d %H:%M')}")
    
    live_shows = []
    
    # Query for shows today AND yesterday (for midnight-crossing shows)
    if team_ids_list:
        base_query = {
            "status": "scheduled",
            "date": {"$in": [current_date, yesterday_date]},
            "$or": [
                {"team_id": {"$in": team_ids_list}},
                {"main_site_id": {"$in": team_ids_list}}
            ]
        }
    else:
        base_query = {
            "status": "scheduled",
            "date": {"$in": [current_date, yesterday_date]}
        }
    
    # Get all shows for today and yesterday
    all_shows = await db.shows.find(base_query, {"_id": 0}).to_list(200)
    
    # Filter to find which shows are currently live
    for show in all_shows:
        start = show.get("start_time", "00:00")
        end = show.get("end_time", "23:59")
        show_date = show.get("date", "")
        
        is_live = False
        
        # Check if show crosses midnight (start > end, e.g., 22:00 - 01:00)
        crosses_midnight = start > end
        
        if show_date == current_date:
            # Show is scheduled for today
            if crosses_midnight:
                # Show crosses midnight, live if we're past start time
                is_live = current_time >= start
            else:
                # Normal show, live if between start and end (exclusive end)
                is_live = start <= current_time < end
        elif show_date == yesterday_date and crosses_midnight:
            # Show from yesterday that crosses midnight
            # Live if current time is BEFORE the end time (exclusive, use < not <=)
            is_live = current_time < end
        
        if is_live:
            live_shows.append(show)
    
    if live_shows:
        logger.info(f"Found {len(live_shows)} live shows using time {current_time} on {current_date}")
    
    results = []
    
    if not live_shows:
        # No live shows - mark caches for this team as inactive
        deactivate_query = {"is_active": True}
        if team_ids_list:
            deactivate_query["team_id"] = {"$in": team_ids_list}
        await db.rds_cached_rundowns.update_many(
            deactivate_query,
            {"$set": {"is_active": False, "updated_at": timestamp}}
        )
        
        # Always update last_cache_refresh so frontend sees activity
        if team_id:
            await db.rds_settings.update_many(
                {"$or": [{"team_id": team_id}, {"main_site_id": team_id}]},
                {"$set": {"last_cache_refresh": timestamp}}
            )
        else:
            await db.rds_settings.update_many(
                {},
                {"$set": {"last_cache_refresh": timestamp}}
            )
        
        # Always log - even when no shows found
        brussels_time = now_brussels_dt.strftime('%H:%M')
        log_entry = {
            "id": str(uuid.uuid4()),
            "team_id": team_id,
            "timestamp": timestamp,
            "status": "no_show",
            "show_id": None,
            "show_title": None,
            "message": f"Geen live show gevonden voor {brussels_time} (Brussels) | IDs doorzocht: {len(team_ids_list)}",
            "cached_data": None
        }
        await db.rds_cache_logs.insert_one(log_entry)
        log_entry.pop("_id", None)
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
                {"name": show_title, "$or": [{"team_id": show_team_id}, {"main_site_id": show_team_id}]},
                {"_id": 0, "rds_station": 1}
            )
            if not show_title_doc:
                # Fallback: search without team filter
                show_title_doc = await db.show_titles.find_one(
                    {"name": show_title},
                    {"_id": 0, "rds_station": 1}
                )
            rds_station = show_title_doc.get("rds_station", "none") if show_title_doc else "none"
            
            # Skip shows not assigned to any station
            if rds_station == "none":
                logger.info(f"Skipping show '{show_title}' - rds_station is 'none'")
                continue
            
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
            
            # Determine which station slots to fill
            if rds_station == "both":
                # Show is for all stations: create/update entries for each
                all_st = await db.rds_stations.find({}, {"_id": 0, "code": 1}).to_list(100)
                target_stations = [s["code"] for s in all_st] if all_st else ["mfy", "grk"]
                for st in target_stations:
                    station_data = {**cached_data, "rds_station": st}
                    await db.rds_cached_rundowns.update_one(
                        {"team_id": show_team_id, "rds_station": st},
                        {"$set": station_data},
                        upsert=True
                    )
            else:
                # Show is for a specific station (mfy or grk)
                await db.rds_cached_rundowns.update_one(
                    {"team_id": show_team_id, "rds_station": rds_station},
                    {"$set": cached_data},
                    upsert=True
                )
            
            # Update RDS settings with last refresh time (use original identifier)
            await db.rds_settings.update_one(
                {"$or": [{"team_id": team_id}, {"main_site_id": team_id}, {"team_id": show_team_id}, {"main_site_id": show_team_id}]},
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
    
    # Get all teams/sites with RDS settings
    settings_list = await db.rds_settings.find({}, {"_id": 0, "team_id": 1, "main_site_id": 1}).to_list(100)
    
    if not settings_list:
        # No teams have RDS settings - still refresh for any live shows
        await refresh_live_show_cache()
    else:
        # Refresh for each team/main_site
        for settings in settings_list:
            identifier = settings.get("main_site_id") or settings.get("team_id")
            if identifier:
                await refresh_live_show_cache(identifier)


async def run_hourly_hard_refresh():
    """Hard refresh — wipes EVERY active RDS cache row and rebuilds it
    from scratch.

    Why this exists: the per-minute refresh updates documents in place
    (`upsert=True` on `{team_id, rds_station}`). Over time, stuck/stale
    rows or partial writes from a transient DB hiccup can leave a cached
    rundown that nobody overwrites — the RDS API then keeps serving
    yesterday's show. Once per hour we throw the whole cache away and
    let the normal scheduler repopulate only the truly-live shows.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    logger.info("RDS hourly HARD refresh starting — wiping all active cached rundowns")
    try:
        # Deactivate every cached row first. The minute-scheduler that runs
        # immediately after will set is_active=True on the actually-live
        # shows only. Anything that was stuck stays deactivated.
        result = await db.rds_cached_rundowns.update_many(
            {"is_active": True},
            {"$set": {"is_active": False, "hard_refresh_at": now_iso, "updated_at": now_iso}},
        )
        logger.info(f"Hard refresh deactivated {result.modified_count} rows")
    except Exception as e:
        logger.error(f"Hard refresh deactivate step failed: {e}")
        return

    # Now run the normal refresh to repopulate the truly-live shows.
    try:
        await run_scheduled_cache_refresh()
    except Exception as e:
        logger.error(f"Hard refresh repopulate step failed: {e}")

    # Audit log — admins can see exactly when each hard refresh ran
    try:
        await db.rds_cache_logs.insert_one({
            "id": str(uuid.uuid4()),
            "team_id": None,
            "timestamp": now_iso,
            "status": "hard_refresh",
            "show_id": None,
            "show_title": None,
            "message": f"Hourly hard refresh — wiped {result.modified_count} stale cache row(s) and rebuilt",
            "cached_data": {"wiped": result.modified_count},
        })
    except Exception:
        pass
    logger.info("RDS hourly HARD refresh complete")


class RDSScheduler:
    """Background scheduler for RDS cache refresh jobs."""

    def __init__(self):
        self.running = False
        self.check_interval = 60  # 1 minute in seconds
        self.task = None
        # Tracks when the last hourly hard refresh fired (wall-clock hour).
        self._last_hard_refresh_hour = None

    async def start(self):
        """Start the RDS cache scheduler."""
        if self.running:
            logger.warning("RDS scheduler is already running")
            return

        self.running = True

        # Force all existing RDS settings to 1 minute interval
        try:
            await db.rds_settings.update_many(
                {"cache_refresh_interval": {"$ne": 1}},
                {"$set": {"cache_refresh_interval": 1}}
            )
        except Exception as e:
            logger.warning(f"Could not update RDS intervals: {e}")

        self.task = asyncio.create_task(self._run_loop())
        logger.info("RDS cache scheduler started (1 min interval, hourly hard refresh)")

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

    async def _maybe_hourly_hard_refresh(self):
        """Fire the hourly hard refresh once per wall-clock hour, on the :00
        tick (or the first tick after :00). Skips on the very first loop so
        startup isn't slowed down by a redundant wipe."""
        # Brussels time keeps the radio team's mental model intact (FM logs
        # are in local time too).
        now_local = datetime.now(BRUSSELS_TZ)
        current_hour = now_local.replace(minute=0, second=0, microsecond=0)
        if self._last_hard_refresh_hour is None:
            # First tick after start — mark as done but don't run yet to
            # avoid wiping the cache we just built.
            self._last_hard_refresh_hour = current_hour
            return
        if current_hour != self._last_hard_refresh_hour:
            self._last_hard_refresh_hour = current_hour
            try:
                await run_hourly_hard_refresh()
            except Exception as e:
                logger.error(f"Hourly hard refresh failed: {e}")

    async def _run_loop(self):
        """Main loop that runs the scheduler."""
        # Run initial refresh
        await run_scheduled_cache_refresh()

        while self.running:
            try:
                await asyncio.sleep(self.check_interval)
                if not self.running:
                    break
                await self._maybe_hourly_hard_refresh()
                await run_scheduled_cache_refresh()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"RDS scheduler error: {e}")
                await asyncio.sleep(60)  # Wait a minute before retrying


# Global scheduler instance
rds_scheduler = RDSScheduler()
