"""Shoutcast integration service for fetching now playing data."""
import asyncio
import httpx
import xml.etree.ElementTree as ET
import logging
import uuid
from typing import Optional, Dict, List
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Shoutcast server configurations
SHOUTCAST_SERVERS = {
    "mfy": {
        "name": "Radio MFY",
        "url": "http://mfy.level27.be/stats?sid=1",
    },
    "grk": {
        "name": "Radio GRK", 
        "url": "http://grk.level27.be/stats?sid=1",
    }
}

# Default filters (can be overridden by database settings)
DEFAULT_FILTERS = [
    {"match": "the feelgood station", "replace": "", "case_insensitive": True},
    {"match": "de stadsradio van genk", "replace": "", "case_insensitive": True},
]


async def get_filters_from_db(db, station: str) -> List[Dict]:
    """Get now playing filters from database."""
    try:
        settings = await db.shoutcast_settings.find_one(
            {"station": station},
            {"_id": 0, "filters": 1}
        )
        if settings and settings.get("filters"):
            return settings["filters"]
    except Exception as e:
        logger.error(f"Error fetching filters from db: {e}")
    return DEFAULT_FILTERS


def apply_filters(song_title: str, filters: List[Dict]) -> str:
    """Apply filters to song title."""
    if not song_title:
        return song_title
    
    result = song_title
    for f in filters:
        match_text = f.get("match", "")
        replace_text = f.get("replace", "")
        case_insensitive = f.get("case_insensitive", True)
        
        if case_insensitive:
            # Case insensitive replace
            import re
            result = re.sub(re.escape(match_text), replace_text, result, flags=re.IGNORECASE)
        else:
            result = result.replace(match_text, replace_text)
    
    # Clean up result (remove extra spaces, trim)
    result = " ".join(result.split()).strip()
    return result


async def get_now_playing(station: str, db=None, apply_filter: bool = True) -> Dict:
    """Fetch the current now playing info from a Shoutcast server.
    
    Args:
        station: Either "mfy" or "grk"
        db: Database connection for fetching filters
        apply_filter: Whether to apply filters to song title
        
    Returns:
        Dict with now playing info including song title, listeners, etc.
    """
    if station not in SHOUTCAST_SERVERS:
        return {
            "status": "error",
            "message": f"Unknown station: {station}",
            "station": station,
            "song_title": "",
            "listeners": 0
        }
    
    server = SHOUTCAST_SERVERS[station]
    filters = []
    
    if apply_filter and db is not None:
        filters = await get_filters_from_db(db, station)
    elif apply_filter:
        filters = DEFAULT_FILTERS
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(server["url"])
            response.raise_for_status()
            
            # Parse XML response
            root = ET.fromstring(response.text)
            
            raw_song_title = root.findtext("SONGTITLE", "")
            song_title = apply_filters(raw_song_title, filters) if apply_filter else raw_song_title
            current_listeners = int(root.findtext("CURRENTLISTENERS", "0"))
            peak_listeners = int(root.findtext("PEAKLISTENERS", "0"))
            stream_status = int(root.findtext("STREAMSTATUS", "0"))
            server_title = root.findtext("SERVERTITLE", "")
            bitrate = root.findtext("BITRATE", "")
            
            return {
                "status": "success",
                "station": station,
                "station_name": server["name"],
                "server_title": server_title,
                "song_title": song_title,
                "raw_song_title": raw_song_title,
                "current_listeners": current_listeners,
                "peak_listeners": peak_listeners,
                "stream_online": stream_status == 1,
                "bitrate": bitrate
            }
            
    except httpx.TimeoutException:
        logger.warning(f"Timeout fetching now playing from {station}")
        return {
            "status": "error",
            "message": "Connection timeout",
            "station": station,
            "station_name": server["name"],
            "song_title": "",
            "current_listeners": 0,
            "stream_online": False
        }
    except Exception as e:
        logger.error(f"Error fetching now playing from {station}: {e}")
        return {
            "status": "error",
            "message": str(e),
            "station": station,
            "station_name": server["name"],
            "song_title": "",
            "current_listeners": 0,
            "stream_online": False
        }


async def cache_now_playing(db, station: str) -> Dict:
    """Fetch and cache now playing data for a station."""
    timestamp = datetime.now(timezone.utc).isoformat()
    
    data = await get_now_playing(station, db, apply_filter=True)
    
    # Save to cache
    cache_data = {
        **data,
        "cached_at": timestamp,
        "updated_at": timestamp
    }
    
    await db.shoutcast_cache.update_one(
        {"station": station},
        {"$set": cache_data},
        upsert=True
    )
    
    # Log the result
    log_entry = {
        "id": str(uuid.uuid4()),
        "station": station,
        "timestamp": timestamp,
        "status": data.get("status"),
        "song_title": data.get("song_title", ""),
        "raw_song_title": data.get("raw_song_title", ""),
        "current_listeners": data.get("current_listeners", 0),
        "stream_online": data.get("stream_online", False)
    }
    await db.shoutcast_logs.insert_one(log_entry)
    
    return data


async def get_cached_now_playing(db, station: str) -> Dict:
    """Get cached now playing data for a station."""
    cached = await db.shoutcast_cache.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    if cached:
        return cached
    
    # No cache, fetch live
    return await get_now_playing(station, db, apply_filter=True)


class ShoutcastScheduler:
    """Background scheduler for Shoutcast now playing updates (every 10 seconds)."""
    
    def __init__(self, db):
        self.db = db
        self.running = False
        self.check_interval = 10  # 10 seconds
        self.task = None
    
    async def start(self):
        """Start the Shoutcast scheduler."""
        if self.running:
            logger.warning("Shoutcast scheduler is already running")
            return
        
        self.running = True
        self.task = asyncio.create_task(self._run_loop())
        logger.info(f"Shoutcast scheduler started ({self.check_interval}s interval)")
    
    async def stop(self):
        """Stop the Shoutcast scheduler."""
        if not self.running:
            return
        
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("Shoutcast scheduler stopped")
    
    async def _run_loop(self):
        """Main loop that fetches now playing data."""
        while self.running:
            try:
                # Fetch now playing for both stations
                for station in ["mfy", "grk"]:
                    await cache_now_playing(self.db, station)
                
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Shoutcast scheduler error: {e}")
                await asyncio.sleep(5)  # Wait before retrying


# Global scheduler instance (initialized in server.py)
shoutcast_scheduler = None
