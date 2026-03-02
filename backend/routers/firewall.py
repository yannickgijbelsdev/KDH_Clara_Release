"""Firewall Router — Network admin firewall management endpoints."""
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
from database import db
from services.auth import get_current_user
from services.firewall_service import (
    get_firewall_settings, get_firewall_rules, block_ip, unblock_ip,
    invalidate_cache, get_geo_info, log_security_event,
)

firewall_router = APIRouter(prefix="/firewall", tags=["firewall"])


def require_network_admin(user: dict):
    if not user.get("is_network_admin"):
        raise HTTPException(status_code=403, detail="Network admin only")


# ============== MODELS ==============

class FirewallRuleCreate(BaseModel):
    name: str
    type: str  # "whitelist" or "blacklist"
    ip_patterns: List[str]  # IP addresses or CIDR ranges
    description: str = ""

class FirewallRuleUpdate(BaseModel):
    name: Optional[str] = None
    ip_patterns: Optional[List[str]] = None
    description: Optional[str] = None
    active: Optional[bool] = None

class FirewallSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    brute_force_max_attempts: Optional[int] = None
    brute_force_window_minutes: Optional[int] = None
    brute_force_ban_minutes: Optional[int] = None
    rate_limit_requests: Optional[int] = None
    rate_limit_window_seconds: Optional[int] = None
    geo_blocking_enabled: Optional[bool] = None
    blocked_countries: Optional[List[str]] = None

class ManualBlockRequest(BaseModel):
    ip: str
    reason: str = "Manual block"
    duration_minutes: Optional[int] = None  # None = permanent


# ============== SETTINGS ==============

@firewall_router.get("/settings/{main_site_id}")
async def get_settings(main_site_id: str, current_user: dict = Depends(get_current_user)):
    require_network_admin(current_user)
    settings = await get_firewall_settings(main_site_id)
    settings.pop("_cached_at", None)
    return settings


@firewall_router.put("/settings/{main_site_id}")
async def update_settings(
    main_site_id: str,
    body: FirewallSettingsUpdate,
    current_user: dict = Depends(get_current_user),
):
    require_network_admin(current_user)
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    updates["main_site_id"] = main_site_id
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.firewall_settings.update_one(
        {"main_site_id": main_site_id},
        {"$set": updates},
        upsert=True,
    )
    invalidate_cache(main_site_id)
    return await get_firewall_settings(main_site_id)


# ============== RULES (IP whitelist/blacklist) ==============

@firewall_router.get("/rules/{main_site_id}")
async def list_rules(main_site_id: str, current_user: dict = Depends(get_current_user)):
    require_network_admin(current_user)
    rules = await db.firewall_rules.find(
        {"main_site_id": main_site_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return {"rules": rules}


@firewall_router.post("/rules/{main_site_id}")
async def create_rule(
    main_site_id: str,
    body: FirewallRuleCreate,
    current_user: dict = Depends(get_current_user),
):
    require_network_admin(current_user)
    if body.type not in ("whitelist", "blacklist"):
        raise HTTPException(status_code=400, detail="Type must be 'whitelist' or 'blacklist'")

    rule = {
        "id": str(uuid.uuid4()),
        "main_site_id": main_site_id,
        "name": body.name,
        "type": body.type,
        "ip_patterns": body.ip_patterns,
        "description": body.description,
        "active": True,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.firewall_rules.insert_one({**rule})
    invalidate_cache(main_site_id)
    return rule


@firewall_router.put("/rules/{main_site_id}/{rule_id}")
async def update_rule(
    main_site_id: str,
    rule_id: str,
    body: FirewallRuleUpdate,
    current_user: dict = Depends(get_current_user),
):
    require_network_admin(current_user)
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.firewall_rules.update_one(
        {"id": rule_id, "main_site_id": main_site_id},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")

    invalidate_cache(main_site_id)
    rule = await db.firewall_rules.find_one({"id": rule_id}, {"_id": 0})
    return rule


@firewall_router.delete("/rules/{main_site_id}/{rule_id}")
async def delete_rule(
    main_site_id: str,
    rule_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_network_admin(current_user)
    result = await db.firewall_rules.delete_one({"id": rule_id, "main_site_id": main_site_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    invalidate_cache(main_site_id)
    return {"deleted": True}


# ============== BLOCKED IPS ==============

@firewall_router.get("/blocks")
async def list_blocks(
    main_site_id: Optional[str] = None,
    active_only: bool = True,
    current_user: dict = Depends(get_current_user),
):
    require_network_admin(current_user)
    query = {}
    if main_site_id:
        query["main_site_id"] = main_site_id
    if active_only:
        query["active"] = True

    blocks = await db.firewall_blocks.find(query, {"_id": 0}).sort("blocked_at", -1).to_list(500)

    # Enrich with geo info
    for block in blocks:
        geo = await get_geo_info(block.get("ip", ""))
        block["country_code"] = geo.get("country_code", "")
        block["country_name"] = geo.get("country_name", "")
        block["city"] = geo.get("city", "")

    return {"blocks": blocks}


@firewall_router.post("/blocks")
async def manual_block(
    body: ManualBlockRequest,
    current_user: dict = Depends(get_current_user),
):
    require_network_admin(current_user)
    result = await block_ip(body.ip, body.reason, body.duration_minutes, None, False)
    return result


@firewall_router.delete("/blocks/{ip}")
async def manual_unblock(
    ip: str,
    current_user: dict = Depends(get_current_user),
):
    require_network_admin(current_user)
    success = await unblock_ip(ip, "Manual unblock by admin")
    if not success:
        raise HTTPException(status_code=404, detail="No active block found for this IP")
    return {"unblocked": True, "ip": ip}


# ============== SECURITY LOGS ==============

@firewall_router.get("/logs")
async def get_security_logs(
    main_site_id: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    require_network_admin(current_user)
    query = {}
    if main_site_id:
        query["main_site_id"] = main_site_id
    if event_type:
        query["event_type"] = event_type

    total = await db.security_logs.count_documents(query)
    logs = await db.security_logs.find(query, {"_id": 0}).sort(
        "timestamp", -1
    ).skip(offset).limit(limit).to_list(limit)

    return {"logs": logs, "total": total}


@firewall_router.get("/logs/stats")
async def get_security_stats(
    main_site_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get aggregated security statistics."""
    require_network_admin(current_user)
    
    query = {}
    if main_site_id:
        query["main_site_id"] = main_site_id

    # Count by event type
    pipeline = [
        {"$match": query} if query else {"$match": {}},
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
    ]
    event_counts = {}
    async for doc in db.security_logs.aggregate(pipeline):
        event_counts[doc["_id"] or "unknown"] = doc["count"]

    # Active blocks count
    block_query = {"active": True}
    if main_site_id:
        block_query["main_site_id"] = main_site_id
    active_blocks = await db.firewall_blocks.count_documents(block_query)

    # Recent events (last 24h)
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    recent_query = {**query, "timestamp": {"$gte": cutoff}}
    recent_events = await db.security_logs.count_documents(recent_query)

    # Top blocked IPs
    block_pipeline = [
        {"$match": {"active": True}},
        {"$group": {"_id": "$ip", "count": {"$sum": 1}, "last_reason": {"$last": "$reason"}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    top_blocked = []
    async for doc in db.firewall_blocks.aggregate(block_pipeline):
        top_blocked.append({"ip": doc["_id"], "count": doc["count"], "reason": doc.get("last_reason", "")})

    return {
        "event_counts": event_counts,
        "active_blocks": active_blocks,
        "recent_events_24h": recent_events,
        "top_blocked_ips": top_blocked,
    }


# ============== GEO LOOKUP ==============

@firewall_router.get("/geo/{ip}")
async def lookup_geo(ip: str, current_user: dict = Depends(get_current_user)):
    require_network_admin(current_user)
    geo = await get_geo_info(ip)
    geo.pop("cached_at", None)
    return {"ip": ip, **geo}
