"""Shoutcast integration service for fetching now playing data."""
import httpx
import xml.etree.ElementTree as ET
import logging
from typing import Optional, Dict

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


async def get_now_playing(station: str) -> Dict:
    """Fetch the current now playing info from a Shoutcast server.
    
    Args:
        station: Either "mfy" or "grk"
        
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
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(server["url"])
            response.raise_for_status()
            
            # Parse XML response
            root = ET.fromstring(response.text)
            
            song_title = root.findtext("SONGTITLE", "")
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
