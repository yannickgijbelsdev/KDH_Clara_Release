"""ProRadio WordPress schedule sync service.

This service syncs shows from Clara to ProRadio WordPress plugin.
Shows are pushed based on their rds_station setting (mfy, grk, both).

ProRadio Structure:
- 'shows' post type: Individual show definitions
- 'schedule' post type: One post per weekday (maandag, dinsdag, etc.)
  - Each schedule post has a 'shows' meta field with time slots
  - Format: [{"show_id": ["123"], "show_time": "15:00", "show_time_end": "16:00"}, ...]
"""
import httpx
import base64
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any
from zoneinfo import ZoneInfo

from database import db

logger = logging.getLogger(__name__)

BRUSSELS_TZ = ZoneInfo('Europe/Brussels')

# WordPress site URL to station mapping
STATION_CONFIG = {
    'mfy': {
        'wp_name': 'MFY',
        'wp_url': 'https://mfy.be'
    },
    'grk': {
        'wp_name': 'GRK',
        'wp_url': 'https://grk.fm'
    }
}

# Dutch day names for schedule posts
WEEKDAY_NAMES = {
    0: 'maandag',
    1: 'dinsdag',
    2: 'woensdag',
    3: 'donderdag',
    4: 'vrijdag',
    5: 'zaterdag',
    6: 'zondag'
}


async def get_wordpress_credentials(station: str, main_site_id: str) -> Optional[Dict]:
    """Get WordPress credentials for a specific station.
    
    Args:
        station: 'mfy' or 'grk'
        main_site_id: The main site ID for multisite context
        
    Returns:
        Dict with wp_base_url, username, app_password or None if not found
    """
    config = STATION_CONFIG.get(station)
    if not config:
        logger.warning(f"Unknown station: {station}")
        return None
    
    wp_name = config['wp_name']
    
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
    """Get show title document including rds_station setting."""
    query = {"name": show_title}
    if main_site_id:
        query["main_site_id"] = main_site_id
    elif team_id:
        query["team_id"] = team_id
    
    return await db.show_titles.find_one(query, {"_id": 0})


def get_weekday_name(date_str: str) -> str:
    """Get Dutch weekday name from date string.
    
    Args:
        date_str: Date in YYYY-MM-DD format
        
    Returns:
        Dutch weekday name (maandag, dinsdag, etc.)
    """
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    return WEEKDAY_NAMES[dt.weekday()]


def get_auth_headers(credentials: Dict) -> Dict:
    """Create authorization headers for WordPress API."""
    auth_string = f"{credentials['username']}:{credentials['app_password']}"
    auth_bytes = base64.b64encode(auth_string.encode()).decode()
    return {
        "Authorization": f"Basic {auth_bytes}",
        "Content-Type": "application/json"
    }


async def find_or_create_wp_show(
    credentials: Dict,
    show_name: str,
    description: str = ""
) -> Optional[int]:
    """Find existing WordPress show by name or create a new one.
    
    Args:
        credentials: WordPress API credentials
        show_name: Name of the show
        description: Optional show description
        
    Returns:
        WordPress show post ID or None if failed
    """
    wp_url = credentials["wp_base_url"]
    headers = get_auth_headers(credentials)
    
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            # Search for existing show by name
            search_url = f"{wp_url}/wp-json/wp/v2/shows"
            search_params = {"search": show_name, "per_page": 100}
            
            response = await client.get(search_url, headers=headers, params=search_params)
            
            if response.status_code == 200:
                shows = response.json()
                # Find exact match (case-insensitive)
                for show in shows:
                    rendered_title = show.get("title", {}).get("rendered", "")
                    if rendered_title.lower().strip() == show_name.lower().strip():
                        logger.info(f"Found existing WP show: {show_name} (ID: {show['id']})")
                        return show["id"]
            
            # Show doesn't exist, create it
            logger.info(f"Creating new WP show: {show_name}")
            
            show_data = {
                "title": show_name,
                "status": "publish",
                "content": description
            }
            
            response = await client.post(search_url, headers=headers, json=show_data)
            
            if response.status_code in [200, 201]:
                new_show = response.json()
                logger.info(f"Created WP show: {show_name} (ID: {new_show['id']})")
                return new_show["id"]
            else:
                logger.error(f"Failed to create WP show: {response.status_code} - {response.text[:500]}")
                return None
                
    except Exception as e:
        logger.error(f"Error finding/creating WP show: {e}")
        return None


async def get_schedule_post(credentials: Dict, weekday_name: str) -> Optional[Dict]:
    """Get the schedule post for a specific weekday.
    
    Args:
        credentials: WordPress API credentials
        weekday_name: Dutch day name (maandag, dinsdag, etc.)
        
    Returns:
        Schedule post data or None
    """
    wp_url = credentials["wp_base_url"]
    headers = get_auth_headers(credentials)
    
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            # Get all schedule posts
            response = await client.get(
                f"{wp_url}/wp-json/wp/v2/schedule",
                headers=headers,
                params={"per_page": 10}
            )
            
            if response.status_code == 200:
                schedules = response.json()
                for sched in schedules:
                    title = sched.get("title", {}).get("rendered", "").lower()
                    if title == weekday_name.lower():
                        return sched
            
            logger.warning(f"Schedule post not found for {weekday_name}")
            return None
            
    except Exception as e:
        logger.error(f"Error getting schedule post: {e}")
        return None


async def get_schedule_shows_meta(credentials: Dict, schedule_id: int) -> List[Dict]:
    """Get the shows meta field from ProRadio schedule API.
    
    Args:
        credentials: WordPress API credentials
        schedule_id: Schedule post ID
        
    Returns:
        List of show slots
    """
    wp_url = credentials["wp_base_url"]
    
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            # Use ProRadio API to get full schedule data
            response = await client.get(f"{wp_url}/wp-json/proradio/v1/schedule/")
            
            if response.status_code == 200:
                data = response.json()
                for post in data.get("posts", []):
                    if post.get("ID") == schedule_id:
                        return post.get("shows", [])
            
            return []
            
    except Exception as e:
        logger.error(f"Error getting schedule shows meta: {e}")
        return []


async def update_schedule_shows(
    credentials: Dict,
    schedule_id: int,
    show_id: int,
    start_time: str,
    end_time: str,
    weekday_name: str
) -> bool:
    """Update a schedule using the Clara ProRadio Sync plugin.
    
    Args:
        credentials: WordPress API credentials
        schedule_id: Schedule post ID (not used with new plugin, kept for compatibility)
        show_id: WordPress show post ID
        start_time: Start time (HH:MM)
        end_time: End time (HH:MM)
        weekday_name: Dutch day name (maandag, dinsdag, etc.)
        
    Returns:
        True if successful
    """
    wp_url = credentials["wp_base_url"]
    headers = get_auth_headers(credentials)
    
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            # Use the Clara ProRadio Sync plugin endpoint
            update_url = f"{wp_url}/wp-json/clara/v1/schedule/update"
            
            update_data = {
                "day": weekday_name,
                "mode": "add",
                "show_id": show_id,
                "start_time": start_time,
                "end_time": end_time
            }
            
            response = await client.post(update_url, headers=headers, json=update_data)
            
            if response.status_code in [200, 201]:
                result = response.json()
                logger.info(f"Updated schedule via Clara plugin: {result.get('message')}")
                return True
            else:
                logger.error(f"Failed to update schedule: {response.status_code} - {response.text[:500]}")
                return False
                
    except Exception as e:
        logger.error(f"Error updating schedule: {e}")
        return False


async def remove_from_schedule(
    credentials: Dict,
    start_time: str,
    end_time: str,
    weekday_name: str,
    show_id: Optional[int] = None
) -> bool:
    """Remove a show slot from schedule using the Clara ProRadio Sync plugin.
    
    Args:
        credentials: WordPress API credentials
        start_time: Start time (HH:MM)
        end_time: End time (HH:MM)
        weekday_name: Dutch day name
        show_id: Optional WordPress show ID
        
    Returns:
        True if successful
    """
    wp_url = credentials["wp_base_url"]
    headers = get_auth_headers(credentials)
    
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            update_url = f"{wp_url}/wp-json/clara/v1/schedule/update"
            
            update_data = {
                "day": weekday_name,
                "mode": "remove",
                "start_time": start_time,
                "end_time": end_time
            }
            
            if show_id:
                update_data["show_id"] = show_id
            
            response = await client.post(update_url, headers=headers, json=update_data)
            
            if response.status_code in [200, 201]:
                result = response.json()
                logger.info(f"Removed from schedule: {result.get('message')}")
                return True
            else:
                logger.error(f"Failed to remove from schedule: {response.status_code}")
                return False
                
    except Exception as e:
        logger.error(f"Error removing from schedule: {e}")
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
    results = {"mfy": None, "grk": None, "synced": False}
    
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
    
    # Get weekday name for schedule lookup
    weekday_name = get_weekday_name(show_date)
    description = title_info.get("description", "")
    
    # Sync to each station
    for station in stations_to_sync:
        credentials = await get_wordpress_credentials(station, main_site_id)
        
        if not credentials:
            results[station] = {"status": "error", "message": f"No credentials for {station}"}
            continue
        
        try:
            # Step 1: Find or create the show in WordPress
            wp_show_id = await find_or_create_wp_show(credentials, show_title, description)
            
            if not wp_show_id:
                results[station] = {"status": "error", "message": "Failed to find/create show"}
                continue
            
            # Step 2: Get the schedule post for the weekday (for tracking purposes)
            schedule_post = await get_schedule_post(credentials, weekday_name)
            schedule_id = schedule_post["id"] if schedule_post else None
            
            # Step 3: Update the schedule using the Clara plugin
            success = await update_schedule_shows(
                credentials, 
                schedule_id,
                wp_show_id,
                start_time,
                end_time,
                weekday_name
            )
            
            if success:
                # Store sync record for tracking
                await db.proradio_sync.update_one(
                    {"clara_show_id": show_id, "station": station},
                    {
                        "$set": {
                            "wp_show_id": wp_show_id,
                            "schedule_id": schedule_id,
                            "weekday": weekday_name,
                            "start_time": start_time,
                            "end_time": end_time,
                            "synced_at": datetime.now(timezone.utc).isoformat(),
                            "main_site_id": main_site_id
                        }
                    },
                    upsert=True
                )
                
                results[station] = {
                    "status": "success",
                    "wp_show_id": wp_show_id,
                    "schedule_id": schedule_id,
                    "weekday": weekday_name
                }
                results["synced"] = True
            else:
                results[station] = {"status": "error", "message": "Failed to update schedule"}
                
        except Exception as e:
            logger.error(f"Error syncing to {station}: {e}")
            results[station] = {"status": "error", "message": str(e)}
    
    return results


async def delete_show_from_proradio(
    show_id: str,
    show_title: str,
    show_date: str,
    start_time: str,
    end_time: str,
    main_site_id: str,
    team_id: str
) -> Dict[str, Any]:
    """Delete a show's schedule slot from ProRadio.
    
    Args:
        show_id: Clara show ID
        show_title: Show title
        show_date: Show date (YYYY-MM-DD)
        start_time: Start time (HH:MM)
        end_time: End time (HH:MM)
        main_site_id: Main site ID for context
        team_id: Team ID for context
        
    Returns:
        Dict with deletion results per station
    """
    results = {"mfy": None, "grk": None}
    
    # Find sync records for this show
    sync_records = await db.proradio_sync.find({"clara_show_id": show_id}).to_list(10)
    
    weekday_name = get_weekday_name(show_date) if show_date else None
    
    # Get show title info to determine rds_station
    title_info = await get_show_title_info(show_title, main_site_id, team_id)
    rds_station = title_info.get("rds_station", "both") if title_info else "both"
    
    stations_to_delete = []
    if rds_station in ["mfy", "both"]:
        stations_to_delete.append("mfy")
    if rds_station in ["grk", "both"]:
        stations_to_delete.append("grk")
    
    for station in stations_to_delete:
        credentials = await get_wordpress_credentials(station, main_site_id)
        
        if not credentials:
            continue
        
        try:
            # Find the sync record for this station
            sync_record = next(
                (r for r in sync_records if r.get("station") == station),
                None
            )
            
            wp_show_id = sync_record.get("wp_show_id") if sync_record else None
            
            if not weekday_name:
                continue
            
            # Use the Clara plugin to remove from schedule
            success = await remove_from_schedule(
                credentials,
                start_time,
                end_time,
                weekday_name,
                wp_show_id
            )
            
            if success:
                # Remove sync record
                await db.proradio_sync.delete_one({
                    "clara_show_id": show_id,
                    "station": station
                })
                results[station] = {"status": "success"}
            else:
                results[station] = {"status": "error", "message": "Failed to remove from schedule"}
                
        except Exception as e:
            logger.error(f"Error deleting from {station}: {e}")
            results[station] = {"status": "error", "message": str(e)}
    
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
        "date": date_str,
        "weekday": get_weekday_name(date_str),
        "total": len(shows),
        "synced": 0,
        "skipped": 0,
        "errors": 0,
        "details": []
    }
    
    for show in shows:
        sync_result = await sync_show_to_proradio(show, main_site_id, team_id)
        
        if sync_result.get("synced"):
            results["synced"] += 1
        elif all(r is None for r in [sync_result.get("mfy"), sync_result.get("grk")]):
            results["skipped"] += 1
        else:
            has_error = any(
                r and r.get("status") == "error" 
                for r in [sync_result.get("mfy"), sync_result.get("grk")]
            )
            if has_error:
                results["errors"] += 1
            else:
                results["skipped"] += 1
        
        results["details"].append({
            "show_id": show.get("id"),
            "show_title": show.get("title"),
            "time": f"{show.get('start_time')} - {show.get('end_time')}",
            "result": {k: v for k, v in sync_result.items() if k != "synced"}
        })
    
    return results
