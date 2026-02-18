"""ProRadio WordPress schedule sync service.

This service syncs shows from Clara to ProRadio WordPress plugin.
Shows are pushed based on their rds_station setting (mfy, grk, both).
"""
import httpx
import base64
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List, Any
from zoneinfo import ZoneInfo

from database import db

logger = logging.getLogger(__name__)

BRUSSELS_TZ = ZoneInfo('Europe/Brussels')

# WordPress site URL to station mapping
STATION_TO_WP_NAME = {
    'mfy': 'MFY',
    'grk': 'GRK'
}


async def get_wordpress_credentials(station: str, main_site_id: str) -> Optional[Dict]:
    """Get WordPress credentials for a specific station.
    
    Args:
        station: 'mfy' or 'grk'
        main_site_id: The main site ID for multisite context
        
    Returns:
        Dict with wp_base_url, username, app_password or None if not found
    """
    wp_name = STATION_TO_WP_NAME.get(station)
    if not wp_name:
        logger.warning(f"Unknown station: {station}")
        return None
    
    # Find WordPress site by name and main_site_id
    wp_site = await db.wordpress_sites.find_one({
        "name": wp_name,
        "main_site_id": main_site_id,
        "is_active": True
    })
    
    if not wp_site:
        # Fallback: try without main_site_id filter
        wp_site = await db.wordpress_sites.find_one({
            "name": wp_name,
            "is_active": True
        })
    
    if not wp_site:
        logger.warning(f"No active WordPress site found for station {station} ({wp_name})")
        return None
    
    return {
        "wp_base_url": wp_site.get("wp_base_url"),
        "username": wp_site.get("username"),
        "app_password": wp_site.get("app_password")
    }


async def get_show_title_info(show_title: str, main_site_id: str, team_id: str) -> Optional[Dict]:
    """Get show title document including rds_station setting.
    
    Args:
        show_title: The title/name of the show
        main_site_id: Main site ID for context
        team_id: Team ID for context
        
    Returns:
        Show title document or None
    """
    query = {"name": show_title}
    if main_site_id:
        query["main_site_id"] = main_site_id
    elif team_id:
        query["team_id"] = team_id
    
    return await db.show_titles.find_one(query, {"_id": 0})


def format_datetime_for_proradio(date_str: str, time_str: str) -> str:
    """Convert date and time strings to ProRadio datetime format.
    
    Args:
        date_str: Date in YYYY-MM-DD format
        time_str: Time in HH:MM format
        
    Returns:
        ISO 8601 datetime string with Brussels timezone (e.g., 2026-02-18T15:00:00+01:00)
    """
    try:
        dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
        dt_brussels = dt.replace(tzinfo=BRUSSELS_TZ)
        return dt_brussels.isoformat()
    except Exception as e:
        logger.error(f"Error formatting datetime: {e}")
        return f"{date_str}T{time_str}:00+01:00"


async def find_or_create_proradio_show(
    credentials: Dict,
    show_name: str,
    thumbnail_url: Optional[str] = None
) -> Optional[int]:
    """Find existing ProRadio show by name or create a new one.
    
    Args:
        credentials: WordPress API credentials
        show_name: Name of the show
        thumbnail_url: Optional thumbnail image URL
        
    Returns:
        ProRadio show post ID or None if failed
    """
    wp_url = credentials["wp_base_url"]
    auth_string = f"{credentials['username']}:{credentials['app_password']}"
    auth_bytes = base64.b64encode(auth_string.encode()).decode()
    
    headers = {
        "Authorization": f"Basic {auth_bytes}",
        "Content-Type": "application/json"
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            # First, search for existing show by name
            search_url = f"{wp_url}/wp-json/wp/v2/proradio-show"
            search_params = {"search": show_name, "per_page": 100}
            
            response = await client.get(search_url, headers=headers, params=search_params)
            
            if response.status_code == 200:
                shows = response.json()
                # Find exact match (case-insensitive)
                for show in shows:
                    if show.get("title", {}).get("rendered", "").lower() == show_name.lower():
                        logger.info(f"Found existing ProRadio show: {show_name} (ID: {show['id']})")
                        return show["id"]
            
            # Show doesn't exist, create it
            logger.info(f"Creating new ProRadio show: {show_name}")
            create_url = f"{wp_url}/wp-json/wp/v2/proradio-show"
            
            show_data = {
                "title": show_name,
                "status": "publish"
            }
            
            response = await client.post(create_url, headers=headers, json=show_data)
            
            if response.status_code in [200, 201]:
                new_show = response.json()
                logger.info(f"Created ProRadio show: {show_name} (ID: {new_show['id']})")
                return new_show["id"]
            else:
                logger.error(f"Failed to create ProRadio show: {response.status_code} - {response.text}")
                return None
                
    except Exception as e:
        logger.error(f"Error finding/creating ProRadio show: {e}")
        return None


async def create_proradio_schedule(
    credentials: Dict,
    show_id: int,
    broadcast_start: str,
    broadcast_end: str,
    clara_show_id: str
) -> Optional[int]:
    """Create a schedule entry in ProRadio.
    
    Args:
        credentials: WordPress API credentials
        show_id: ProRadio show post ID
        broadcast_start: ISO 8601 datetime string
        broadcast_end: ISO 8601 datetime string
        clara_show_id: Clara show ID for reference
        
    Returns:
        ProRadio schedule post ID or None if failed
    """
    wp_url = credentials["wp_base_url"]
    auth_string = f"{credentials['username']}:{credentials['app_password']}"
    auth_bytes = base64.b64encode(auth_string.encode()).decode()
    
    headers = {
        "Authorization": f"Basic {auth_bytes}",
        "Content-Type": "application/json"
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            # Check if schedule already exists for this Clara show
            existing = await db.proradio_sync.find_one({
                "clara_show_id": clara_show_id,
                "wp_url": wp_url
            })
            
            if existing and existing.get("proradio_schedule_id"):
                # Update existing schedule
                schedule_id = existing["proradio_schedule_id"]
                update_url = f"{wp_url}/wp-json/wp/v2/proradio-schedule/{schedule_id}"
                
                schedule_data = {
                    "meta": {
                        "_proradio_show": str(show_id),
                        "_proradio_broadcaststart": broadcast_start,
                        "_proradio_broadcastend": broadcast_end
                    }
                }
                
                response = await client.post(update_url, headers=headers, json=schedule_data)
                
                if response.status_code in [200, 201]:
                    logger.info(f"Updated ProRadio schedule {schedule_id}")
                    return schedule_id
                else:
                    logger.warning(f"Failed to update schedule, creating new: {response.status_code}")
            
            # Create new schedule
            create_url = f"{wp_url}/wp-json/wp/v2/proradio-schedule"
            
            schedule_data = {
                "title": f"Schedule - {clara_show_id[:8]}",
                "status": "publish",
                "meta": {
                    "_proradio_show": str(show_id),
                    "_proradio_broadcaststart": broadcast_start,
                    "_proradio_broadcastend": broadcast_end
                }
            }
            
            response = await client.post(create_url, headers=headers, json=schedule_data)
            
            if response.status_code in [200, 201]:
                schedule = response.json()
                schedule_id = schedule["id"]
                
                # Store sync record
                await db.proradio_sync.update_one(
                    {"clara_show_id": clara_show_id, "wp_url": wp_url},
                    {
                        "$set": {
                            "proradio_schedule_id": schedule_id,
                            "proradio_show_id": show_id,
                            "synced_at": datetime.now(timezone.utc).isoformat()
                        }
                    },
                    upsert=True
                )
                
                logger.info(f"Created ProRadio schedule {schedule_id}")
                return schedule_id
            else:
                logger.error(f"Failed to create schedule: {response.status_code} - {response.text}")
                return None
                
    except Exception as e:
        logger.error(f"Error creating ProRadio schedule: {e}")
        return None


async def delete_proradio_schedule(
    credentials: Dict,
    clara_show_id: str
) -> bool:
    """Delete a schedule entry from ProRadio.
    
    Args:
        credentials: WordPress API credentials
        clara_show_id: Clara show ID
        
    Returns:
        True if deleted successfully
    """
    wp_url = credentials["wp_base_url"]
    
    # Find sync record
    sync_record = await db.proradio_sync.find_one({
        "clara_show_id": clara_show_id,
        "wp_url": wp_url
    })
    
    if not sync_record or not sync_record.get("proradio_schedule_id"):
        logger.info(f"No ProRadio schedule found for Clara show {clara_show_id}")
        return True
    
    schedule_id = sync_record["proradio_schedule_id"]
    
    auth_string = f"{credentials['username']}:{credentials['app_password']}"
    auth_bytes = base64.b64encode(auth_string.encode()).decode()
    
    headers = {
        "Authorization": f"Basic {auth_bytes}"
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            delete_url = f"{wp_url}/wp-json/wp/v2/proradio-schedule/{schedule_id}?force=true"
            
            response = await client.delete(delete_url, headers=headers)
            
            if response.status_code in [200, 204]:
                # Remove sync record
                await db.proradio_sync.delete_one({
                    "clara_show_id": clara_show_id,
                    "wp_url": wp_url
                })
                logger.info(f"Deleted ProRadio schedule {schedule_id}")
                return True
            else:
                logger.error(f"Failed to delete schedule: {response.status_code}")
                return False
                
    except Exception as e:
        logger.error(f"Error deleting ProRadio schedule: {e}")
        return False


async def sync_show_to_proradio(
    show: Dict,
    main_site_id: str,
    team_id: str
) -> Dict[str, Any]:
    """Sync a single show to ProRadio WordPress.
    
    Args:
        show: Show document from database
        main_site_id: Main site ID for context
        team_id: Team ID for context
        
    Returns:
        Dict with sync results per station
    """
    results = {"mfy": None, "grk": None}
    
    show_title = show.get("title", "")
    show_id = show.get("id", "")
    show_date = show.get("date", "")
    start_time = show.get("start_time", "")
    end_time = show.get("end_time", "")
    
    if not all([show_title, show_id, show_date, start_time, end_time]):
        logger.warning(f"Show missing required fields: {show_id}")
        return results
    
    # Get show title info to determine rds_station
    title_info = await get_show_title_info(show_title, main_site_id, team_id)
    
    if not title_info:
        logger.info(f"No show title found for '{show_title}', skipping ProRadio sync")
        return results
    
    rds_station = title_info.get("rds_station", "none")
    
    if rds_station == "none":
        logger.info(f"Show '{show_title}' has rds_station=none, skipping ProRadio sync")
        return results
    
    # Determine which stations to sync to
    stations_to_sync = []
    if rds_station == "mfy":
        stations_to_sync = ["mfy"]
    elif rds_station == "grk":
        stations_to_sync = ["grk"]
    elif rds_station == "both":
        stations_to_sync = ["mfy", "grk"]
    
    # Format broadcast times
    broadcast_start = format_datetime_for_proradio(show_date, start_time)
    broadcast_end = format_datetime_for_proradio(show_date, end_time)
    
    # Get thumbnail URL if available
    thumbnail_url = None
    if title_info.get("image") and title_info["image"].get("s3_url"):
        thumbnail_url = title_info["image"]["s3_url"]
    
    # Sync to each station
    for station in stations_to_sync:
        credentials = await get_wordpress_credentials(station, main_site_id)
        
        if not credentials:
            results[station] = {"status": "error", "message": f"No credentials for {station}"}
            continue
        
        try:
            # Find or create ProRadio show
            proradio_show_id = await find_or_create_proradio_show(
                credentials, show_title, thumbnail_url
            )
            
            if not proradio_show_id:
                results[station] = {"status": "error", "message": "Failed to find/create show"}
                continue
            
            # Create/update schedule
            schedule_id = await create_proradio_schedule(
                credentials,
                proradio_show_id,
                broadcast_start,
                broadcast_end,
                show_id
            )
            
            if schedule_id:
                results[station] = {
                    "status": "success",
                    "proradio_show_id": proradio_show_id,
                    "proradio_schedule_id": schedule_id
                }
            else:
                results[station] = {"status": "error", "message": "Failed to create schedule"}
                
        except Exception as e:
            logger.error(f"Error syncing to {station}: {e}")
            results[station] = {"status": "error", "message": str(e)}
    
    return results


async def delete_show_from_proradio(
    show_id: str,
    show_title: str,
    main_site_id: str,
    team_id: str
) -> Dict[str, Any]:
    """Delete a show's schedule from ProRadio.
    
    Args:
        show_id: Clara show ID
        show_title: Show title to determine stations
        main_site_id: Main site ID for context
        team_id: Team ID for context
        
    Returns:
        Dict with deletion results per station
    """
    results = {"mfy": None, "grk": None}
    
    # Get show title info to determine rds_station
    title_info = await get_show_title_info(show_title, main_site_id, team_id)
    
    rds_station = title_info.get("rds_station", "none") if title_info else "both"
    
    # If we can't determine the station, try both
    stations_to_delete = []
    if rds_station in ["mfy", "both"]:
        stations_to_delete.append("mfy")
    if rds_station in ["grk", "both"]:
        stations_to_delete.append("grk")
    
    # Also check if there are any sync records for this show
    sync_records = await db.proradio_sync.find({"clara_show_id": show_id}).to_list(10)
    
    for station in stations_to_delete:
        credentials = await get_wordpress_credentials(station, main_site_id)
        
        if not credentials:
            continue
        
        success = await delete_proradio_schedule(credentials, show_id)
        results[station] = {"status": "success" if success else "error"}
    
    return results


async def sync_shows_for_date(
    date_str: str,
    main_site_id: str,
    team_id: str
) -> Dict[str, Any]:
    """Sync all shows for a specific date to ProRadio.
    
    Args:
        date_str: Date in YYYY-MM-DD format
        main_site_id: Main site ID for context
        team_id: Team ID for context
        
    Returns:
        Summary of sync results
    """
    # Build query
    query = {"date": date_str}
    if main_site_id:
        query["main_site_id"] = main_site_id
    elif team_id:
        query["team_id"] = team_id
    
    shows = await db.shows.find(query, {"_id": 0}).to_list(100)
    
    results = {
        "total": len(shows),
        "synced": 0,
        "skipped": 0,
        "errors": 0,
        "details": []
    }
    
    for show in shows:
        sync_result = await sync_show_to_proradio(show, main_site_id, team_id)
        
        if any(r and r.get("status") == "success" for r in sync_result.values()):
            results["synced"] += 1
        elif all(r is None for r in sync_result.values()):
            results["skipped"] += 1
        else:
            results["errors"] += 1
        
        results["details"].append({
            "show_id": show.get("id"),
            "show_title": show.get("title"),
            "result": sync_result
        })
    
    return results
