"""ZeroTier network monitoring integration."""
import uuid
import httpx
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from database import db
from services.auth import get_current_user

zerotier_router = APIRouter(prefix="/zerotier", tags=["zerotier"])

ZT_API_BASE = "https://api.zerotier.com/api/v1"


# ============== Models ==============

class ZeroTierConfigUpdate(BaseModel):
    api_token: Optional[str] = None
    network_id: Optional[str] = None


# ============== Helpers ==============

async def get_zt_config(main_site_id: str) -> dict:
    """Get ZeroTier config for a main site."""
    config = await db.zerotier_config.find_one(
        {"main_site_id": main_site_id}, {"_id": 0}
    )
    if not config:
        return {"main_site_id": main_site_id, "api_token": "", "network_id": ""}
    return config


async def zt_request(method: str, path: str, api_token: str, json_data=None):
    """Make an authenticated request to ZeroTier Central API."""
    headers = {"Authorization": f"token {api_token}"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.request(method, f"{ZT_API_BASE}{path}", headers=headers, json=json_data)
    if resp.status_code == 401:
        raise HTTPException(401, "Invalid ZeroTier API token")
    if resp.status_code == 404:
        raise HTTPException(404, "ZeroTier network or member not found")
    if resp.status_code == 429:
        raise HTTPException(429, "ZeroTier rate limit exceeded")
    if resp.status_code >= 400:
        raise HTTPException(resp.status_code, f"ZeroTier API error: {resp.text}")
    return resp.json()


async def require_site_access(main_site_id: str, current_user: dict):
    """Check user has access to this technical main site."""
    if current_user.get("is_network_admin"):
        return
    site_user = await db.main_site_users.find_one({
        "main_site_id": main_site_id, "user_id": current_user["id"]
    })
    if not site_user:
        raise HTTPException(403, "No access to this site")


# ============== Config Endpoints ==============

@zerotier_router.get("/{main_site_id}/config")
async def get_config(main_site_id: str, current_user: dict = Depends(get_current_user)):
    """Get ZeroTier configuration for a main site."""
    await require_site_access(main_site_id, current_user)
    config = await get_zt_config(main_site_id)
    # Mask the token for security
    safe = {**config}
    if safe.get("api_token"):
        token = safe["api_token"]
        safe["api_token_masked"] = f"{token[:4]}...{token[-4:]}" if len(token) > 8 else "****"
    else:
        safe["api_token_masked"] = ""
    safe.pop("api_token", None)
    return safe


@zerotier_router.put("/{main_site_id}/config")
async def update_config(
    main_site_id: str,
    config_data: ZeroTierConfigUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update ZeroTier configuration (API token and/or network ID)."""
    await require_site_access(main_site_id, current_user)

    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if config_data.api_token is not None:
        update["api_token"] = config_data.api_token
    if config_data.network_id is not None:
        update["network_id"] = config_data.network_id

    await db.zerotier_config.update_one(
        {"main_site_id": main_site_id},
        {"$set": update, "$setOnInsert": {"main_site_id": main_site_id, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"status": "ok", "message": "Configuration updated"}


# ============== Network Endpoints ==============

@zerotier_router.get("/{main_site_id}/network")
async def get_network_info(main_site_id: str, current_user: dict = Depends(get_current_user)):
    """Get ZeroTier network details."""
    await require_site_access(main_site_id, current_user)
    config = await get_zt_config(main_site_id)
    if not config.get("api_token") or not config.get("network_id"):
        raise HTTPException(400, "ZeroTier not configured. Set API token and Network ID first.")

    data = await zt_request("GET", f"/network/{config['network_id']}", config["api_token"])
    return {
        "id": data.get("id"),
        "name": data.get("config", {}).get("name", ""),
        "description": data.get("description", ""),
        "private": data.get("config", {}).get("private", True),
        "member_count": data.get("totalMemberCount", 0),
        "online_count": data.get("onlineMemberCount", 0),
        "created_at": data.get("config", {}).get("creationTime"),
        "routes": data.get("config", {}).get("routes", []),
        "ip_assignment_pools": data.get("config", {}).get("ipAssignmentPools", []),
    }


# ============== Members Endpoints ==============

@zerotier_router.get("/{main_site_id}/members")
async def list_members(main_site_id: str, current_user: dict = Depends(get_current_user)):
    """List all ZeroTier network members with status."""
    await require_site_access(main_site_id, current_user)
    config = await get_zt_config(main_site_id)
    if not config.get("api_token") or not config.get("network_id"):
        raise HTTPException(400, "ZeroTier not configured. Set API token and Network ID first.")

    members_raw = await zt_request("GET", f"/network/{config['network_id']}/member", config["api_token"])

    now_ts = datetime.now(timezone.utc).timestamp() * 1000  # ZT uses milliseconds

    members = []
    for m in members_raw:
        last_seen = m.get("lastSeen", 0) or 0
        # Online if seen in last 5 minutes
        is_online = (now_ts - last_seen) < 300_000 if last_seen > 0 else False

        member_config = m.get("config", {})
        members.append({
            "id": m.get("nodeId") or m.get("id", ""),
            "name": m.get("name") or m.get("description") or "",
            "description": m.get("description", ""),
            "online": is_online,
            "last_seen": last_seen,
            "ip_assignments": member_config.get("ipAssignments", []),
            "physical_address": m.get("physicalAddress", ""),
            "client_version": m.get("clientVersion", ""),
            "authorized": member_config.get("authorized", False),
            "active_bridge": member_config.get("activeBridge", False),
            "hidden": m.get("hidden", False),
        })

    # Sort: online first, then by name
    members.sort(key=lambda x: (not x["online"], x["name"].lower()))

    online_count = sum(1 for m in members if m["online"])
    return {
        "members": members,
        "total": len(members),
        "online": online_count,
        "offline": len(members) - online_count,
    }


@zerotier_router.get("/{main_site_id}/member/{member_id}")
async def get_member(main_site_id: str, member_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed info for a specific member."""
    await require_site_access(main_site_id, current_user)
    config = await get_zt_config(main_site_id)
    if not config.get("api_token") or not config.get("network_id"):
        raise HTTPException(400, "ZeroTier not configured.")

    data = await zt_request("GET", f"/network/{config['network_id']}/member/{member_id}", config["api_token"])
    member_config = data.get("config", {})

    now_ts = datetime.now(timezone.utc).timestamp() * 1000
    last_seen = data.get("lastSeen", 0) or 0
    is_online = (now_ts - last_seen) < 300_000 if last_seen > 0 else False

    return {
        "id": data.get("nodeId") or data.get("id", ""),
        "name": data.get("name", ""),
        "description": data.get("description", ""),
        "online": is_online,
        "last_seen": last_seen,
        "ip_assignments": member_config.get("ipAssignments", []),
        "physical_address": data.get("physicalAddress", ""),
        "client_version": data.get("clientVersion", ""),
        "authorized": member_config.get("authorized", False),
        "active_bridge": member_config.get("activeBridge", False),
        "hidden": data.get("hidden", False),
        "protocol_version": data.get("protocolVersion"),
        "supports_rules_engine": data.get("supportsRulesEngine", False),
    }


@zerotier_router.post("/{main_site_id}/member/{member_id}/authorize")
async def authorize_member(main_site_id: str, member_id: str, current_user: dict = Depends(get_current_user)):
    """Authorize a member on the network."""
    await require_site_access(main_site_id, current_user)
    config = await get_zt_config(main_site_id)
    if not config.get("api_token") or not config.get("network_id"):
        raise HTTPException(400, "ZeroTier not configured.")

    await zt_request(
        "POST",
        f"/network/{config['network_id']}/member/{member_id}",
        config["api_token"],
        json_data={"config": {"authorized": True}},
    )
    return {"status": "ok", "message": f"Member {member_id} authorized"}


@zerotier_router.post("/{main_site_id}/member/{member_id}/deauthorize")
async def deauthorize_member(main_site_id: str, member_id: str, current_user: dict = Depends(get_current_user)):
    """Deauthorize a member from the network."""
    await require_site_access(main_site_id, current_user)
    config = await get_zt_config(main_site_id)
    if not config.get("api_token") or not config.get("network_id"):
        raise HTTPException(400, "ZeroTier not configured.")

    await zt_request(
        "POST",
        f"/network/{config['network_id']}/member/{member_id}",
        config["api_token"],
        json_data={"config": {"authorized": False}},
    )
    return {"status": "ok", "message": f"Member {member_id} deauthorized"}
