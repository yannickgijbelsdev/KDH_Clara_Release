"""Shoutcast integration service for fetching now playing data."""
import asyncio
import httpx
import xml.etree.ElementTree as ET
import logging
import uuid
from typing import Optional, Dict, List
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

# Shoutcast server configurations
SHOUTCAST_SERVERS = {
    "mfy": {
        "name": "Radio MFY",
        "url": "http://stream-shout.koodh.be:9010/stats?sid=1",
    },
    "grk": {
        "name": "Radio GRK", 
        "url": "http://stream-shout.koodh.be:9010/stats?sid=2",
    }
}

# Stale now playing settings
STALE_TIMEOUT_MINUTES = 15  # Show fallback after this many minutes of same song
STALE_FALLBACK_TEXT = {
    "mfy": "altijd dichtbij",
    "grk": "the feelgood station"
}

# Track when song titles last changed (in-memory state)
_song_change_tracker: Dict[str, Dict] = {}

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


def is_unformatted_title(song_title: str) -> bool:
    """Check if a song title appears to be unformatted.
    
    A properly formatted title has:
    - Artist in UPPERCASE (e.g., "THE CRANBERRIES")
    - Song title in Title Case (e.g., "Zombie")
    
    Returns True (unformatted) if:
    - Both parts are fully uppercase: "THE CRANBERRIES - ZOMBIE"
    - Artist is not uppercase: "The Cranberries - Zombie" or "the cranberries - zombie"
    """
    if not song_title:
        return False
    
    # Check for separator
    separators = [" - ", " – ", " — "]
    for sep in separators:
        if sep in song_title:
            parts = song_title.split(sep, 1)
            if len(parts) == 2:
                artist_part = parts[0].strip()
                title_part = parts[1].strip()
                
                # Check if artist has any letters
                if not any(c.isalpha() for c in artist_part):
                    return False
                
                # If the title part is all uppercase (and has letters), it's unformatted
                if title_part and any(c.isalpha() for c in title_part) and title_part.isupper():
                    return True
                
                # If the artist is NOT all uppercase, it's unformatted
                # (e.g., "The Cranberries" or "the cranberries" instead of "THE CRANBERRIES")
                if artist_part and not artist_part.isupper():
                    return True
                
                return False
    
    # No separator - can't determine, assume formatted
    return False


def smart_title_case(text: str) -> str:
    """Convert text to Title Case while handling apostrophes correctly.
    
    Python's str.title() treats apostrophes as word boundaries, causing
    issues like "it's" → "It'S". This function fixes that.
    
    Examples:
    - "it's a wonderful life" → "It's A Wonderful Life"
    - "don't stop believin'" → "Don't Stop Believin'"
    - "rock 'n' roll" → "Rock 'N' Roll"
    """
    if not text:
        return text
    
    # First apply standard title case
    result = text.title()
    
    # Fix apostrophe issues: find patterns like "'X" where X is uppercase
    # and convert X to lowercase (unless it's at the start of a word)
    import re
    
    # Pattern matches: apostrophe followed by a single uppercase letter
    # that is NOT at the start of a word (has a letter before the apostrophe)
    def fix_apostrophe(match):
        before = match.group(1)  # Character before apostrophe
        apostrophe = match.group(2)  # The apostrophe
        after = match.group(3)  # Character after apostrophe
        return before + apostrophe + after.lower()
    
    # Match: letter + apostrophe + uppercase letter
    result = re.sub(r"([a-zA-Z])([''ʼ])([A-Z])", fix_apostrophe, result)
    
    return result


def format_now_playing(song_title: str) -> str:
    """Format now playing text: ARTIST in UPPERCASE, Title in Title Case.
    
    Examples:
    - "phil collins - in the air tonight" → "PHIL COLLINS - In The Air Tonight"
    - "ABBA - Dancing Queen" → "ABBA - Dancing Queen"
    - "Some Artist" (no separator) → "SOME ARTIST"
    - "taylor swift - it's nice to have a friend" → "TAYLOR SWIFT - It's Nice To Have A Friend"
    """
    if not song_title:
        return song_title
    
    # Clean up any trailing separators from filtered content
    song_title = song_title.strip()
    for sep in [" - ", " – ", " — ", "-", "–", "—"]:
        if song_title.endswith(sep.strip()):
            song_title = song_title.rstrip(sep.strip()).strip()
    
    if not song_title:
        return song_title
    
    # Common separators between artist and title
    separators = [" - ", " – ", " — "]
    
    for sep in separators:
        if sep in song_title:
            parts = song_title.split(sep, 1)  # Split only on first occurrence
            if len(parts) == 2:
                artist = parts[0].strip().upper()  # UPPERCASE for artist
                title = parts[1].strip()
                
                # If title is empty after filter, just return artist
                if not title:
                    return artist
                
                title = smart_title_case(title)  # Smart Title Case for song title
                return f"{artist} - {title}"
    
    # No separator found - treat entire string as artist name
    return song_title.upper()


def apply_filters(song_title: str, filters: List[Dict]) -> str:
    """Apply filters to song title.
    
    Each filter can have:
    - match: text to find
    - replace: text to replace with
    - case_insensitive: bool (default True)
    - whole_word: bool (default False) - only match whole words to avoid "Swift" → "Swi&"
    """
    import re
    
    if not song_title:
        return song_title
    
    result = song_title
    for f in filters:
        match_text = f.get("match", "")
        replace_text = f.get("replace", "")
        case_insensitive = f.get("case_insensitive", True)
        whole_word = f.get("whole_word", False)
        
        if not match_text:
            continue
        
        flags = re.IGNORECASE if case_insensitive else 0
        
        if whole_word:
            # Use word boundaries to only match whole words
            # \b matches word boundaries (start/end of word)
            pattern = r'\b' + re.escape(match_text) + r'\b'
        else:
            pattern = re.escape(match_text)
        
        result = re.sub(pattern, replace_text, result, flags=flags)
    
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
            filtered_title = apply_filters(raw_song_title, filters) if apply_filter else raw_song_title
            # Apply formatting: ARTIST - Title Case
            song_title = format_now_playing(filtered_title) if apply_filter else filtered_title
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
    """Fetch and cache now playing data for a station.
    
    Also tracks if the song has been playing too long (stale) and
    replaces it with fallback text if needed.
    """
    global _song_change_tracker
    
    timestamp = datetime.now(timezone.utc).isoformat()
    now = datetime.now(timezone.utc)
    
    data = await get_now_playing(station, db, apply_filter=True)
    
    current_song = data.get("song_title", "")
    
    # Initialize tracker for this station if needed
    if station not in _song_change_tracker:
        _song_change_tracker[station] = {
            "last_song": current_song,
            "last_change_time": now,
            "is_stale": False
        }
    
    tracker = _song_change_tracker[station]
    
    # Check if song changed
    if current_song != tracker["last_song"] and current_song:
        # Song changed - reset tracker
        tracker["last_song"] = current_song
        tracker["last_change_time"] = now
        tracker["is_stale"] = False
        logger.info(f"[{station}] Song changed to: {current_song}")
    else:
        # Same song - check if stale
        time_since_change = now - tracker["last_change_time"]
        stale_threshold = timedelta(minutes=STALE_TIMEOUT_MINUTES)
        
        if time_since_change >= stale_threshold and current_song:
            if not tracker["is_stale"]:
                logger.info(f"[{station}] Now playing stale for {STALE_TIMEOUT_MINUTES} min, showing fallback")
                tracker["is_stale"] = True
    
    # Determine the effective song title to display
    effective_song_title = current_song
    is_stale = tracker["is_stale"]
    
    if is_stale:
        # Use fallback text instead of stale song
        effective_song_title = STALE_FALLBACK_TEXT.get(station, "")
    
    # Save to cache with both original and effective titles
    cache_data = {
        **data,
        "song_title": effective_song_title,  # This is what gets displayed
        "original_song_title": current_song,  # Keep the original for reference
        "is_stale": is_stale,
        "stale_since": tracker["last_change_time"].isoformat() if is_stale else None,
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
        "song_title": effective_song_title,
        "original_song_title": current_song,
        "raw_song_title": data.get("raw_song_title", ""),
        "is_stale": is_stale,
        "current_listeners": data.get("current_listeners", 0),
        "stream_online": data.get("stream_online", False)
    }
    await db.shoutcast_logs.insert_one(log_entry)
    
    return {**data, "song_title": effective_song_title, "is_stale": is_stale}


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
