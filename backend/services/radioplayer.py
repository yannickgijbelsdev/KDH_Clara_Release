"""Radioplayer.org Ingest API integration for pushing now playing and schedule data."""
import logging
import httpx
from datetime import datetime, timezone, timedelta
from xml.etree.ElementTree import Element, SubElement, tostring
from database import db

logger = logging.getLogger(__name__)

# Default ingest base URL (configurable per site)
DEFAULT_INGEST_BASE = "https://core-ingest.radioplayer.cloud"


async def get_radioplayer_config():
    """Get Radioplayer configuration from DB."""
    config = await db.radioplayer_config.find_one({}, {"_id": 0})
    return config or {}


async def _get_auth():
    """Get BasicAuth tuple from config."""
    config = await get_radioplayer_config()
    username = config.get("username", "")
    password = config.get("password", "")
    if not username or not password:
        return None
    return (username, password)


def _get_ingest_url(config: dict, endpoint: str, rpid: str) -> str:
    """Build the ingest URL for a given endpoint type."""
    base = config.get("ingest_base_url", DEFAULT_INGEST_BASE).rstrip("/")
    country_code = config.get("country_code", "056")
    return f"{base}/latest/{country_code}/v1/{endpoint}/{rpid}"


async def _log_push(push_type: str, status: str, detail: str, response_code: int = 0, response_body: str = ""):
    """Log a Radioplayer push attempt."""
    await db.radioplayer_push_log.insert_one({
        "type": push_type,
        "status": status,
        "detail": detail,
        "response_code": response_code,
        "response_body": response_body[:500],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


# ============== Now Playing Push ==============

async def push_now_playing(artist: str, title: str, start_time: str = None, duration: int = 300):
    """Push now playing metadata to Radioplayer.

    Args:
        artist: Artist name
        title: Track title
        start_time: ISO8601 UTC start time (defaults to now)
        duration: Duration in seconds (default 5 minutes)
    """
    config = await get_radioplayer_config()
    if not config.get("enabled"):
        return

    auth = await _get_auth()
    if not auth:
        logger.warning("Radioplayer: No credentials configured, skipping NP push")
        return

    rpid = config.get("rpid", "")
    if not rpid:
        logger.warning("Radioplayer: No RPID configured, skipping NP push")
        return

    if not start_time:
        start_time = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Build SPI XML for now playing (Programme Event)
    stop_time = (datetime.fromisoformat(start_time.replace("Z", "+00:00")) + timedelta(seconds=duration)).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Create minimal SPI XML for PE (Programme Event)
    epg = Element("epg")
    epg.set("xmlns", "http://www.worlddab.org/schemas/spi/31")
    schedule = SubElement(epg, "schedule")
    scope = SubElement(schedule, "scope")
    scope.set("startTime", start_time)
    scope.set("stopTime", stop_time)

    programme = SubElement(schedule, "programme")
    programme.set("shortId", "1")
    programme.set("id", f"crid://radioplayer.org/{rpid}/np")

    medium_name = SubElement(programme, "mediumName")
    display_text = f"{artist} - {title}" if artist and title else (title or artist or "")
    medium_name.text = display_text[:128]

    long_name = SubElement(programme, "longName")
    long_name.text = display_text[:256]

    location = SubElement(programme, "location")
    time_el = SubElement(location, "time")
    time_el.set("time", start_time)
    time_el.set("duration", f"PT{duration}S")

    xml_data = '<?xml version="1.0" encoding="UTF-8"?>\n' + tostring(epg, encoding="unicode")

    url = _get_ingest_url(config, "pe", rpid)
    detail = f"{artist} - {title}" if artist else title

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                url,
                content=xml_data,
                auth=auth,
                headers={"Content-Type": "text/xml;charset=UTF-8"},
            )

        status = "success" if response.status_code in (200, 201, 202, 204) else "error"
        await _log_push("now_playing", status, detail, response.status_code, response.text)

        if status == "success":
            logger.info(f"Radioplayer NP push OK: {detail}")
        else:
            logger.warning(f"Radioplayer NP push failed ({response.status_code}): {response.text[:200]}")
            logger.warning(f"Radioplayer NP URL was: {url}")

    except Exception as e:
        logger.error(f"Radioplayer NP push exception: {e}")
        await _log_push("now_playing", "error", detail, 0, str(e))


# ============== Schedule Push ==============

async def push_schedule(shows: list, config: dict = None):
    """Push programme schedule to Radioplayer as SPI XML.

    Args:
        shows: List of show dicts with title, date, start_time, end_time, presenter_ids, image
        config: Optional pre-fetched config
    """
    if not config:
        config = await get_radioplayer_config()
    if not config.get("enabled"):
        return

    auth = await _get_auth()
    if not auth:
        logger.warning("Radioplayer: No credentials configured, skipping schedule push")
        return

    rpid = config.get("rpid", "")
    if not rpid:
        logger.warning("Radioplayer: No RPID configured, skipping schedule push")
        return

    if not shows:
        logger.info("Radioplayer: No shows to push")
        return

    # Build SPI XML for Programme Info (PI)
    epg = Element("epg")
    epg.set("xmlns", "http://www.worlddab.org/schemas/spi/31")

    schedule = SubElement(epg, "schedule")
    scope = SubElement(schedule, "scope")

    # Find the date range
    dates = sorted([s["date"] for s in shows if s.get("date")])
    if dates:
        scope.set("startTime", f"{dates[0]}T00:00:00Z")
        scope.set("stopTime", f"{dates[-1]}T23:59:59Z")

    # Fetch presenter names for all presenter_ids
    all_presenter_ids = set()
    for s in shows:
        for pid in (s.get("presenter_ids") or []):
            all_presenter_ids.add(pid)

    presenter_map = {}
    if all_presenter_ids:
        presenters = await db.presenters.find(
            {"id": {"$in": list(all_presenter_ids)}},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(100)
        presenter_map = {p["id"]: p.get("name", "") for p in presenters}

    for i, show in enumerate(shows):
        programme = SubElement(schedule, "programme")
        programme.set("shortId", str(i + 1))
        show_id = show.get("id", str(i))
        programme.set("id", f"crid://radioplayer.org/{rpid}/{show_id}")

        medium_name = SubElement(programme, "mediumName")
        medium_name.text = (show.get("title") or "")[:128]

        long_name = SubElement(programme, "longName")
        long_name.text = (show.get("title") or "")[:256]

        # Add presenter info
        presenter_names = [presenter_map.get(pid, "") for pid in (show.get("presenter_ids") or []) if presenter_map.get(pid)]
        if presenter_names:
            desc = SubElement(programme, "shortDescription")
            desc.text = f"Presented by {', '.join(presenter_names)}"

        location = SubElement(programme, "location")
        time_el = SubElement(location, "time")
        start_dt = f"{show['date']}T{show['start_time']}:00"
        end_dt = f"{show['date']}T{show['end_time']}:00"
        time_el.set("time", start_dt)

        # Calculate duration
        try:
            start = datetime.fromisoformat(start_dt)
            end = datetime.fromisoformat(end_dt)
            if end < start:
                end += timedelta(days=1)
            dur_secs = int((end - start).total_seconds())
            hours = dur_secs // 3600
            mins = (dur_secs % 3600) // 60
            time_el.set("duration", f"PT{hours}H{mins}M")
        except Exception:
            time_el.set("duration", "PT1H")

        # Add show image if available
        image = show.get("image")
        if image and image.get("url"):
            media = SubElement(programme, "mediaDescription")
            multimedia = SubElement(media, "multimedia")
            multimedia.set("url", image["url"])
            multimedia.set("type", "logo_colour_rectangle")

    xml_data = '<?xml version="1.0" encoding="UTF-8"?>\n' + tostring(epg, encoding="unicode")
    url = _get_ingest_url(config, "pi", rpid)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                url,
                content=xml_data,
                auth=auth,
                headers={"Content-Type": "text/xml;charset=UTF-8"},
            )

        status = "success" if response.status_code in (200, 201, 202, 204) else "error"
        await _log_push("schedule", status, f"{len(shows)} shows pushed", response.status_code, response.text)

        if status == "success":
            logger.info(f"Radioplayer schedule push OK: {len(shows)} shows")
        else:
            logger.warning(f"Radioplayer schedule push failed ({response.status_code}): {response.text[:200]}")

    except Exception as e:
        logger.error(f"Radioplayer schedule push exception: {e}")
        await _log_push("schedule", "error", f"{len(shows)} shows - {e}", 0, str(e))


# ============== Auto-push Helpers ==============

async def auto_push_now_playing_for_grk(song_title: str):
    """Called from shoutcast scheduler when GRK song changes.
    Parses artist/title from the song string and pushes to Radioplayer.
    """
    config = await get_radioplayer_config()
    if not config.get("enabled") or not config.get("auto_np"):
        return

    if not song_title or song_title.strip() == "":
        return

    # Parse "Artist - Title" format
    artist = ""
    title = song_title
    if " - " in song_title:
        parts = song_title.split(" - ", 1)
        artist = parts[0].strip()
        title = parts[1].strip()

    await push_now_playing(artist, title)


async def auto_push_schedule_for_grk():
    """Push upcoming GRK schedule to Radioplayer.
    Called when shows are created/updated.
    """
    config = await get_radioplayer_config()
    if not config.get("enabled") or not config.get("auto_schedule"):
        return

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    end_date = (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%Y-%m-%d")

    # Get shows for the next 7 days that are linked to GRK
    # First get show titles that are for GRK
    grk_titles = await db.show_titles.find(
        {"rds_station": {"$in": ["grk", "both"]}},
        {"_id": 0, "name": 1}
    ).to_list(100)
    grk_title_names = [t["name"] for t in grk_titles]

    if not grk_title_names:
        # If no RDS station configured, push all shows
        shows = await db.shows.find(
            {"date": {"$gte": today, "$lte": end_date}},
            {"_id": 0}
        ).to_list(500)
    else:
        shows = await db.shows.find(
            {"date": {"$gte": today, "$lte": end_date}, "title": {"$in": grk_title_names}},
            {"_id": 0}
        ).to_list(500)

    if shows:
        await push_schedule(shows, config)
