"""Shoutcast integration service for fetching now playing data."""
import asyncio
import re
import httpx
import xml.etree.ElementTree as ET
import logging
import uuid
from typing import Optional, Dict, List, Tuple
from datetime import datetime, timedelta

from services.timezone_utils import now_brussels, BRUSSELS_TZ, is_time_between
from database import db

logger = logging.getLogger(__name__)

# Shoutcast server configurations (legacy fallback when no rds_stations row exists)
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


async def _get_station_doc(station_code: str) -> Optional[Dict]:
    """Look up the first rds_stations doc matching this code (across sites)."""
    return await db.rds_stations.find_one({"code": station_code}, {"_id": 0})


def _custom_stream_active(cs: Dict, now_dt: datetime) -> bool:
    """Return True when this custom stream is in its scheduled window NOW."""
    if not cs or not cs.get("enabled") or not cs.get("url"):
        return False
    days = cs.get("days") or []
    if days and now_dt.weekday() not in days:
        return False
    start = cs.get("start_time") or "00:00"
    end = cs.get("end_time") or "00:00"
    # When start == end we treat it as "all day on the selected days"
    if start == end:
        return True
    check_time = now_dt.strftime("%H:%M")
    return is_time_between(start, end, check_time)


async def resolve_active_stream(
    station_code: str,
) -> Tuple[str, str, Optional[Dict]]:
    """Determine which URL to fetch now-playing data from RIGHT NOW.

    Walks the station's `custom_streams` (Brussels TZ, weekday+window match)
    and returns the first active custom stream. Otherwise returns the
    legacy hardcoded URL (preserving working behaviour for mfy/grk), or
    the station's `stream_url` from the rds_stations doc.

    Returns: (url, name, active_custom_dict_or_None)
    """
    station_doc = await _get_station_doc(station_code)
    now_dt = now_brussels()

    if station_doc:
        for cs in station_doc.get("custom_streams") or []:
            if _custom_stream_active(cs, now_dt):
                return cs["url"], station_doc.get("name", station_code.upper()), cs

    # Legacy hardcoded fallback — kept first because db.rds_stations stores
    # the public listener URL, while we need the v1 stats XML endpoint.
    legacy = SHOUTCAST_SERVERS.get(station_code)
    if legacy:
        return legacy["url"], legacy["name"], None

    # Dynamic station fallback (for non-mfy/grk codes added at runtime)
    if station_doc:
        default_url = (station_doc.get("stream_url") or "").strip()
        if default_url:
            return default_url, station_doc.get("name", station_code.upper()), None

    return "", station_code.upper(), None

# Stale now playing settings (defaults — overridden by DB config)
DEFAULT_STALE_TIMEOUT_MINUTES = 15
DEFAULT_STALE_RECOVERY_SECONDS = 30
DEFAULT_STALE_FALLBACK = {
    "mfy": "altijd dichtbij",
    "grk": "the feelgood station"
}


async def get_stale_config():
    """Get stale now playing config from DB, with defaults."""
    config = await db.stale_config.find_one({}, {"_id": 0})
    if not config:
        return {
            "timeout_minutes": DEFAULT_STALE_TIMEOUT_MINUTES,
            "recovery_seconds": DEFAULT_STALE_RECOVERY_SECONDS,
            "fallback_text": DEFAULT_STALE_FALLBACK,
        }
    return {
        "timeout_minutes": config.get("timeout_minutes", DEFAULT_STALE_TIMEOUT_MINUTES),
        "recovery_seconds": config.get("recovery_seconds", DEFAULT_STALE_RECOVERY_SECONDS),
        "fallback_text": config.get("fallback_text", DEFAULT_STALE_FALLBACK),
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


async def _fetch_shoutcast_v1(url: str) -> Optional[Dict]:
    """Fetch and parse a Shoutcast v1/v2 stats XML endpoint.

    Returns the parsed dict on success, None on failure (caller handles
    fallback). Works for both Shoutcast v1 and v2 because both expose the
    same ``<SHOUTCASTSERVER><SONGTITLE>…</SONGTITLE></SHOUTCASTSERVER>``
    structure at ``/stats?sid=N``.

    Hardening:
      • Streams the response so we never download an audio body when the
        caller pointed us at the listener URL by mistake.
      • Reads at most 64 KiB and only as long as the ``content-type``
        looks like text/xml/json.
    """
    try:
        async with httpx.AsyncClient(timeout=3.5, follow_redirects=True) as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                ctype = (response.headers.get("content-type") or "").lower()
                # Audio/video/binary listener stream — definitely not a stats URL.
                if (
                    ctype.startswith("audio/")
                    or ctype.startswith("video/")
                    or ctype.startswith("application/octet-stream")
                ):
                    return None
                # Read at most 64 KiB. Shoutcast stats XML is well under that.
                chunks = []
                read = 0
                async for chunk in response.aiter_bytes(chunk_size=8192):
                    chunks.append(chunk)
                    read += len(chunk)
                    if read >= 65536:
                        break
                body = b"".join(chunks)
            text = body.decode("utf-8", errors="ignore")
            # XML path — Shoutcast v1 and v2.
            if "<SHOUTCASTSERVER" in text:
                root = ET.fromstring(text)
                # In Shoutcast v2 "/statistics" the song title lives inside
                # <STREAM id="N">. Fall back to the deepest match.
                stream = root.find("STREAM") if root.find("SONGTITLE") is None else None
                src = stream if stream is not None else root
                return {
                    "raw_song_title": src.findtext("SONGTITLE", "") or root.findtext("SONGTITLE", ""),
                    "current_listeners": int(src.findtext("CURRENTLISTENERS", "0") or 0),
                    "peak_listeners": int(src.findtext("PEAKLISTENERS", "0") or 0),
                    "stream_status": int(src.findtext("STREAMSTATUS", "1") or 1),
                    "server_title": src.findtext("SERVERTITLE", "") or root.findtext("SERVERTITLE", ""),
                    "bitrate": src.findtext("BITRATE", "") or root.findtext("BITRATE", ""),
                }
            # Legacy `/7.html` fallback — comma-separated values.
            #   `<html><body>currentListeners,streamStatus,peakListeners,maxListeners,uniqueListeners,bitrate,songTitle</body></html>`
            m = re.search(r"<body[^>]*>([^<]+)</body>", text, re.IGNORECASE)
            if m:
                parts = m.group(1).split(",", 6)
                if len(parts) >= 7:
                    return {
                        "raw_song_title": parts[6].strip(),
                        "current_listeners": int(parts[0] or 0),
                        "peak_listeners": int(parts[2] or 0),
                        "stream_status": int(parts[1] or 1),
                        "server_title": "",
                        "bitrate": parts[5].strip(),
                    }
            return None
    except Exception as e:
        logger.warning(f"Shoutcast fetch failed for {url}: {e}")
        return None


_SHOUTCAST_AUTODISCOVERY_PATHS = ("/stats?sid=1", "/stats", "/stats?sid=2", "/7.html")


async def fetch_shoutcast_with_autodiscovery(url: str) -> Optional[Dict]:
    """Fetch now-playing metadata, automatically falling back to common
    Shoutcast stats endpoints if the caller pointed us at the listener URL.

    The user-facing "Test" button and the scheduler both rely on this so a
    typed-in ``https://mfy.level27.be/`` still resolves to the actual song.
    """
    url = (url or "").strip().rstrip("/")
    if not url:
        return None

    parsed = await _fetch_shoutcast_v1(url)
    if parsed and (parsed.get("raw_song_title") or parsed.get("server_title")):
        return parsed

    # Only auto-discover when the input looks like a bare host (no stats
    # path of its own), otherwise we'd thrash on a fully-qualified URL the
    # user explicitly chose.
    if "/stats" not in url and "7.html" not in url and "status" not in url:
        from urllib.parse import urlsplit, urlunsplit
        parts = urlsplit(url)
        for suffix in _SHOUTCAST_AUTODISCOVERY_PATHS:
            if "?" in suffix:
                path, query = suffix.split("?", 1)
            else:
                path, query = suffix, ""
            candidate = urlunsplit((parts.scheme, parts.netloc, path, query, ""))
            parsed = await _fetch_shoutcast_v1(candidate)
            if parsed and (parsed.get("raw_song_title") or parsed.get("server_title")):
                # Stamp the URL we actually used so the caller can show it.
                parsed["_resolved_url"] = candidate
                return parsed
    return parsed


async def get_now_playing(station: str, db=None, apply_filter: bool = True) -> Dict:
    """Fetch the current now playing info for a station.

    Resolves the active stream URL through `resolve_active_stream` which
    honours the per-station custom-stream scheduler (weekday + time window
    in Brussels TZ). If the custom source fails, transparently falls back
    to the station's default stream_url.
    """
    filters = []
    if apply_filter and db is not None:
        filters = await get_filters_from_db(db, station)
    elif apply_filter:
        filters = DEFAULT_FILTERS

    url, station_name, active_custom = await resolve_active_stream(station)
    used_custom = active_custom is not None
    fallback_used = False

    if not url:
        return {
            "status": "error",
            "message": f"No stream URL configured for station: {station}",
            "station": station,
            "station_name": station_name,
            "song_title": "",
            "current_listeners": 0,
            "stream_online": False,
            "active_stream": "none",
        }

    parsed = await fetch_shoutcast_with_autodiscovery(url)

    # On failure with a custom URL, transparently retry default station URL
    if parsed is None and used_custom:
        # Prefer the known-good legacy URL for mfy/grk, falling back to the
        # station doc's stream_url for dynamic stations.
        legacy = SHOUTCAST_SERVERS.get(station)
        if legacy and legacy["url"] != url:
            fallback_url = legacy["url"]
        else:
            station_doc = await _get_station_doc(station)
            fallback_url = (station_doc or {}).get("stream_url")
        if fallback_url and fallback_url != url:
            logger.info(f"[{station}] Custom stream unreachable — falling back to default")
            parsed = await fetch_shoutcast_with_autodiscovery(fallback_url)
            if parsed is not None:
                fallback_used = True
                used_custom = False

    if parsed is None:
        return {
            "status": "error",
            "message": "Connection error",
            "station": station,
            "station_name": station_name,
            "song_title": "",
            "current_listeners": 0,
            "stream_online": False,
            "active_stream": "custom" if used_custom else "default",
        }

    raw_song_title = parsed["raw_song_title"]
    filtered_title = apply_filters(raw_song_title, filters) if apply_filter else raw_song_title
    song_title = format_now_playing(filtered_title) if apply_filter else filtered_title

    return {
        "status": "success",
        "station": station,
        "station_name": station_name,
        "server_title": parsed["server_title"],
        "song_title": song_title,
        "raw_song_title": raw_song_title,
        "current_listeners": parsed["current_listeners"],
        "peak_listeners": parsed["peak_listeners"],
        "stream_online": parsed["stream_status"] == 1,
        "bitrate": parsed["bitrate"],
        "active_stream": "custom" if used_custom else "default",
        "custom_stream_label": (active_custom or {}).get("label") if used_custom else None,
        "fallback_used": fallback_used,
    }


async def cache_now_playing(db, station: str) -> Dict:
    """Fetch and cache now playing data for a station.
    
    Also tracks if the song has been playing too long (stale) and
    replaces it with fallback text if needed.
    
    ALL times are in Brussels timezone (Europe/Brussels).
    """
    global _song_change_tracker
    
    now = now_brussels()
    timestamp = now.isoformat()
    
    # Load configurable stale settings
    stale_cfg = await get_stale_config()
    stale_timeout = stale_cfg["timeout_minutes"]
    recovery_seconds = stale_cfg["recovery_seconds"]
    fallback_text = stale_cfg["fallback_text"]
    
    data = await get_now_playing(station, db, apply_filter=True)
    
    current_song = data.get("song_title", "")
    
    # Initialize tracker for this station if needed
    if station not in _song_change_tracker:
        _song_change_tracker[station] = {
            "last_song": current_song,
            "last_change_time": now,
            "is_stale": False,
            "pending_new_song": None,
            "pending_song_first_seen": None
        }
    
    tracker = _song_change_tracker[station]
    
    # Check if song changed
    if current_song != tracker["last_song"] and current_song:
        # Song is different from what we were tracking
        if tracker["is_stale"]:
            # Currently stale - apply threshold before recovering
            if tracker["pending_new_song"] == current_song:
                # Same new song as before - check if threshold passed
                time_since_first_seen = now - tracker["pending_song_first_seen"]
                if time_since_first_seen >= timedelta(seconds=recovery_seconds):
                    # Threshold passed - actually recover from stale
                    tracker["last_song"] = current_song
                    tracker["last_change_time"] = now
                    tracker["is_stale"] = False
                    tracker["pending_new_song"] = None
                    tracker["pending_song_first_seen"] = None
                    logger.info(f"[{station}] Recovered from stale - new song confirmed: {current_song}")
                    # Auto-push to Radioplayer for GRK
                    if station == "grk":
                        try:
                            from services.radioplayer import auto_push_now_playing_for_grk
                            asyncio.create_task(auto_push_now_playing_for_grk(current_song))
                        except Exception as e:
                            logger.error(f"[{station}] Radioplayer NP push error: {e}")
                # else: still waiting for threshold
            else:
                # New song detected while stale - start tracking it
                tracker["pending_new_song"] = current_song
                tracker["pending_song_first_seen"] = now
                logger.debug(f"[{station}] Potential new song while stale: {current_song} - waiting for threshold")
        else:
            # Not stale - immediate song change
            tracker["last_song"] = current_song
            tracker["last_change_time"] = now
            tracker["is_stale"] = False
            logger.info(f"[{station}] Song changed to: {current_song}")
            # Auto-push to Radioplayer for GRK
            if station == "grk":
                try:
                    from services.radioplayer import auto_push_now_playing_for_grk
                    asyncio.create_task(auto_push_now_playing_for_grk(current_song))
                except Exception as e:
                    logger.error(f"[{station}] Radioplayer NP push error: {e}")
    else:
        # Same song (or empty) - check if stale
        # Also reset pending song if we're back to the old song
        if tracker["pending_new_song"] and current_song == tracker["last_song"]:
            tracker["pending_new_song"] = None
            tracker["pending_song_first_seen"] = None
        
        time_since_change = now - tracker["last_change_time"]
        stale_threshold = timedelta(minutes=stale_timeout)
        
        if time_since_change >= stale_threshold and current_song:
            if not tracker["is_stale"]:
                logger.info(f"[{station}] Now playing stale for {stale_timeout} min, showing fallback")
                tracker["is_stale"] = True
    
    # Determine the effective song title to display
    effective_song_title = current_song
    is_stale = tracker["is_stale"]
    
    if is_stale:
        # Use fallback text instead of stale song
        effective_song_title = fallback_text.get(station, "")
    
    # Save to cache with both original and effective titles
    cache_data = {
        **data,
        "song_title": effective_song_title,  # This is what gets displayed
        "original_song_title": current_song,  # Keep the original for reference
        "is_stale": is_stale,
        "song_started_at": tracker["last_change_time"].isoformat(),
        "stale_at": (tracker["last_change_time"] + timedelta(minutes=stale_timeout)).isoformat(),
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
        "stream_online": data.get("stream_online", False),
        "active_stream": data.get("active_stream", "default"),
        "custom_stream_label": data.get("custom_stream_label"),
        "fallback_used": bool(data.get("fallback_used")),
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
        """Main loop that fetches now playing data for all dynamic stations."""
        while self.running:
            try:
                # Fetch station codes from DB
                all_st = await self.db.rds_stations.find({}, {"_id": 0, "code": 1}).to_list(100)
                station_codes = [s["code"] for s in all_st] if all_st else ["mfy", "grk"]
                
                for station in station_codes:
                    await cache_now_playing(self.db, station)
                
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Shoutcast scheduler error: {e}")
                await asyncio.sleep(5)  # Wait before retrying


# Global scheduler instance (initialized in server.py)
shoutcast_scheduler = None
