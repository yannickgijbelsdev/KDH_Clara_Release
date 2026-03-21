"""ZeroTier Network Guard - Ensures network admins are connected to a specific ZeroTier network before login."""

import logging
import httpx
from database import db

logger = logging.getLogger(__name__)

ZT_API_BASE = "https://api.zerotier.com/api/v1"


async def get_zt_guard_config() -> dict:
    """Get the ZeroTier admin access guard configuration."""
    config = await db.zt_admin_access.find_one({}, {"_id": 0})
    if not config:
        return {"enabled": False, "api_token": "", "network_id": "", "network_name": ""}
    return config


async def save_zt_guard_config(api_token: str, network_id: str, enabled: bool) -> dict:
    """Save the ZeroTier admin access guard configuration."""
    network_name = ""
    if api_token and network_id and enabled:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{ZT_API_BASE}/network/{network_id}",
                    headers={"Authorization": f"token {api_token}"}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    network_name = data.get("config", {}).get("name", "")
        except Exception as e:
            logger.warning(f"ZT Guard: Could not fetch network name: {e}")

    doc = {
        "enabled": enabled,
        "api_token": api_token,
        "network_id": network_id,
        "network_name": network_name,
    }
    await db.zt_admin_access.update_one({}, {"$set": doc}, upsert=True)
    return doc


async def verify_zt_access(client_ip: str) -> dict:
    """Verify if the client IP belongs to an online, authorized ZeroTier member.
    
    Returns: {"allowed": bool, "reason": str, "member_name": str|None}
    """
    config = await get_zt_guard_config()

    if not config.get("enabled"):
        return {"allowed": True, "reason": "ZeroTier guard disabled"}

    api_token = config.get("api_token", "")
    network_id = config.get("network_id", "")

    if not api_token or not network_id:
        # Strict mode: if configured but incomplete, block
        return {"allowed": False, "reason": "ZeroTier guard is enabled but not properly configured. Contact your administrator."}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{ZT_API_BASE}/network/{network_id}/member",
                headers={"Authorization": f"token {api_token}"}
            )
            if resp.status_code != 200:
                return {"allowed": False, "reason": "ZeroTier network verification failed. Service unavailable."}

            members = resp.json()

    except Exception as e:
        logger.error(f"ZT Guard: API request failed: {e}")
        return {"allowed": False, "reason": "ZeroTier network verification failed. Cannot reach ZeroTier API."}

    # Normalize the client IP (strip port if present)
    clean_ip = client_ip.split(":")[0] if "." in client_ip else client_ip

    import time
    now_ms = time.time() * 1000

    for member in members:
        member_config = member.get("config", {})
        authorized = member_config.get("authorized", False)
        if not authorized:
            continue

        last_seen = member.get("lastSeen", 0) or 0
        is_online = (now_ms - last_seen) < 300_000  # 5 minutes

        if not is_online:
            continue

        # Check 1: Physical address (public IP the member connects from)
        phys_addr = member.get("physicalAddress", "")
        if phys_addr:
            # physicalAddress can be "1.2.3.4/port" format
            phys_ip = phys_addr.split("/")[0]
            if phys_ip == clean_ip:
                member_name = member.get("name") or member.get("description") or member.get("nodeId", "")
                return {"allowed": True, "reason": "Verified via ZeroTier physical address", "member_name": member_name}

        # Check 2: IP assignments (ZeroTier virtual IPs - for when Clara is on the ZT network)
        ip_assignments = member_config.get("ipAssignments", [])
        if clean_ip in ip_assignments:
            member_name = member.get("name") or member.get("description") or member.get("nodeId", "")
            return {"allowed": True, "reason": "Verified via ZeroTier IP assignment", "member_name": member_name}

    return {
        "allowed": False,
        "reason": "Access denied. Your device is not connected to the required ZeroTier network. Connect to the network and try again."
    }
