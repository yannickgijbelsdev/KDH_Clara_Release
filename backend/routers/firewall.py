"""Firewall Router — Network admin firewall management endpoints."""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from database import db
from services.auth import get_current_user
from services.firewall_service import (
    get_firewall_settings, get_firewall_rules, block_ip, unblock_ip,
    invalidate_cache, get_geo_info, log_security_event,
)
from services.endpoint_protection import (
    get_endpoint_settings, invalidate_endpoint_cache, get_all_endpoint_groups,
    get_public_connection_stats, ENDPOINT_GROUPS,
)
from services.redis_cache import cache_get, cache_set, cache_delete

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


@firewall_router.get("/status/bulk")
async def get_firewall_status_bulk(current_user: dict = Depends(get_current_user)):
    """Get firewall enabled status for all sites with Redis caching."""
    cached = await cache_get("firewall:status:bulk")
    if cached:
        return cached

    all_settings = await db.firewall_settings.find(
        {}, {"_id": 0, "main_site_id": 1, "enabled": 1}
    ).to_list(200)
    
    status_map = {}
    for s in all_settings:
        sid = s.get("main_site_id")
        if sid:
            status_map[sid] = s.get("enabled", False)
    
    pipeline = [
        {"$match": {"active": True}},
        {"$group": {"_id": "$main_site_id", "count": {"$sum": 1}}}
    ]
    rule_counts = await db.firewall_rules.aggregate(pipeline).to_list(200)
    rules_map = {r["_id"]: r["count"] for r in rule_counts}
    
    result = {"status": status_map, "rule_counts": rules_map}
    await cache_set("firewall:status:bulk", result, ttl=15)
    return result


class BulkEnableRequest(BaseModel):
    site_ids: List[str]
    enabled: bool = True


@firewall_router.post("/enable-rack")
async def enable_firewall_for_rack(
    body: BulkEnableRequest,
    current_user: dict = Depends(get_current_user),
):
    """Bulk enable/disable firewall for all sites in a rack."""
    require_network_admin(current_user)
    if not body.site_ids:
        raise HTTPException(status_code=400, detail="No site_ids provided")

    now = datetime.now(timezone.utc).isoformat()
    updated = 0
    for sid in body.site_ids:
        await db.firewall_settings.update_one(
            {"main_site_id": sid},
            {"$set": {
                "main_site_id": sid,
                "enabled": body.enabled,
                "updated_at": now,
            }},
            upsert=True,
        )
        invalidate_cache(sid)
        updated += 1

    await cache_delete("firewall:status:bulk")
    return {"updated": updated, "enabled": body.enabled}


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
    """Get aggregated security statistics for a specific main site."""
    require_network_admin(current_user)
    
    # Strict per-site filtering
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

    # Active blocks count — filtered by main_site_id
    block_query = {"active": True}
    if main_site_id:
        block_query["main_site_id"] = main_site_id
    active_blocks = await db.firewall_blocks.count_documents(block_query)

    # Recent events (last 24h)
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    recent_query = {**query, "timestamp": {"$gte": cutoff}}
    recent_events = await db.security_logs.count_documents(recent_query)

    # Top blocked IPs — filtered by main_site_id
    block_match = {"active": True}
    if main_site_id:
        block_match["main_site_id"] = main_site_id
    block_pipeline = [
        {"$match": block_match},
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


# ============== ACTIVE SESSIONS ==============

@firewall_router.get("/sessions")
async def list_sessions(
    main_site_id: Optional[str] = None,
    active_only: bool = True,
    current_user: dict = Depends(get_current_user),
):
    """List active user sessions. Auto-expires sessions past JWT expiry."""
    require_network_admin(current_user)
    
    # Auto-expire zombie sessions: active=True but JWT has expired
    now_iso = datetime.now(timezone.utc).isoformat()
    # Sessions with expires_at field
    expired_result = await db.sessions.update_many(
        {"active": True, "expires_at": {"$lt": now_iso, "$exists": True}},
        {"$set": {"active": False, "ended_at": now_iso, "end_reason": "token_expired"}}
    )
    # Sessions without expires_at (old records): expire if started > JWT_EXPIRATION_HOURS ago
    from database import JWT_EXPIRATION_HOURS
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=JWT_EXPIRATION_HOURS)).isoformat()
    old_result = await db.sessions.update_many(
        {"active": True, "expires_at": {"$exists": False}, "started_at": {"$lt": cutoff}},
        {"$set": {"active": False, "ended_at": now_iso, "end_reason": "token_expired"}}
    )
    if expired_result.modified_count or old_result.modified_count:
        import logging
        logging.getLogger(__name__).info(
            f"Auto-expired {expired_result.modified_count + old_result.modified_count} zombie sessions"
        )
    
    query = {}
    if active_only:
        query["active"] = True
    if main_site_id:
        # Get user_ids linked to this main site via main_site_users
        site_user_docs = await db.main_site_users.find(
            {"main_site_id": main_site_id}, {"_id": 0, "user_id": 1}
        ).to_list(500)
        user_ids = [d["user_id"] for d in site_user_docs]
        # Also include network admins (they belong to all sites)
        network_admins = await db.users.find(
            {"is_network_admin": True}, {"_id": 0, "id": 1}
        ).to_list(100)
        admin_ids = [a["id"] for a in network_admins]
        all_ids = list(set(user_ids + admin_ids))
        if all_ids:
            query["user_id"] = {"$in": all_ids}
        else:
            return {"sessions": []}

    sessions = await db.sessions.find(query, {"_id": 0}).sort("started_at", -1).to_list(500)

    # Enrich with geo
    for s in sessions:
        geo = await get_geo_info(s.get("ip", ""))
        s["country_name"] = geo.get("country_name", "")
        s["city"] = geo.get("city", "")

    return {"sessions": sessions}


@firewall_router.post("/sessions/{session_id}/terminate")
async def terminate_session(session_id: str, current_user: dict = Depends(get_current_user)):
    """Terminate a specific user session (remote logout)."""
    require_network_admin(current_user)
    result = await db.sessions.update_one(
        {"id": session_id, "active": True},
        {"$set": {"active": False, "ended_at": datetime.now(timezone.utc).isoformat(), "terminated_by": current_user["id"]}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found or already ended")

    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    await log_security_event("session_terminated", session.get("ip", "unknown"), None, {
        "terminated_user": session.get("user_email", ""),
        "terminated_by": current_user.get("email", ""),
    })
    return {"terminated": True, "session_id": session_id}


@firewall_router.post("/sessions/terminate-user/{user_id}")
async def terminate_user_sessions(user_id: str, current_user: dict = Depends(get_current_user)):
    """Terminate all sessions for a specific user."""
    require_network_admin(current_user)
    result = await db.sessions.update_many(
        {"user_id": user_id, "active": True},
        {"$set": {"active": False, "ended_at": datetime.now(timezone.utc).isoformat(), "terminated_by": current_user["id"]}}
    )
    return {"terminated_count": result.modified_count, "user_id": user_id}


# ============== USER BLOCKING ==============

class UserBlockRequest(BaseModel):
    reason: str = "Blocked by administrator"

@firewall_router.post("/users/{user_id}/block")
async def block_user(user_id: str, body: UserBlockRequest, current_user: dict = Depends(get_current_user)):
    """Block a user account."""
    require_network_admin(current_user)
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "name": 1, "is_network_admin": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("is_network_admin"):
        raise HTTPException(status_code=400, detail="Cannot block a network admin")

    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_blocked": True, "blocked_at": datetime.now(timezone.utc).isoformat(), "blocked_reason": body.reason}}
    )
    # Terminate all active sessions
    await db.sessions.update_many(
        {"user_id": user_id, "active": True},
        {"$set": {"active": False, "ended_at": datetime.now(timezone.utc).isoformat(), "terminated_by": current_user["id"]}}
    )
    await log_security_event("user_blocked", "system", None, {
        "user_id": user_id, "user_email": target.get("email", ""), "reason": body.reason
    })
    return {"blocked": True, "user_id": user_id}


@firewall_router.post("/users/{user_id}/unblock")
async def unblock_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Unblock a user account."""
    require_network_admin(current_user)
    result = await db.users.update_one(
        {"id": user_id},
        {"$unset": {"is_blocked": "", "blocked_at": "", "blocked_reason": ""}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await log_security_event("user_unblocked", "system", None, {"user_id": user_id})
    return {"unblocked": True, "user_id": user_id}


# ============== FORCE PASSWORD CHANGE ==============

@firewall_router.post("/users/{user_id}/force-password-change")
async def force_password_change(user_id: str, current_user: dict = Depends(get_current_user)):
    """Force a user to change their password on next login."""
    require_network_admin(current_user)
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"force_password_change": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"forced": True, "user_id": user_id}


@firewall_router.post("/users/{user_id}/cancel-force-password-change")
async def cancel_force_password_change(user_id: str, current_user: dict = Depends(get_current_user)):
    """Cancel forced password change for a user."""
    require_network_admin(current_user)
    await db.users.update_one({"id": user_id}, {"$unset": {"force_password_change": ""}})
    return {"cancelled": True, "user_id": user_id}


# ============== SECURITY AUDIT ==============

@firewall_router.get("/audit/{main_site_id}")
async def security_audit(main_site_id: str, current_user: dict = Depends(get_current_user)):
    """Run a security audit for a main site and return score + recommendations."""
    require_network_admin(current_user)
    
    issues = []
    score = 100
    
    # 1. Check firewall settings
    settings = await get_firewall_settings(main_site_id)
    if not settings.get("enabled"):
        issues.append({"severity": "critical", "category": "firewall", "message": "Firewall is disabled", "action": "Enable firewall in settings"})
        score -= 25

    # 2. Check brute force settings
    bf_max = settings.get("brute_force_max_attempts", 5)
    if bf_max > 10:
        issues.append({"severity": "warning", "category": "brute_force", "message": f"Brute force threshold is too high ({bf_max} attempts)", "action": "Lower to 5-7 attempts"})
        score -= 10

    # 3. Check geo-blocking
    if not settings.get("geo_blocking_enabled"):
        issues.append({"severity": "info", "category": "geo", "message": "Geo-blocking is not enabled", "action": "Consider enabling geo-blocking for high-risk countries"})
        score -= 5

    # 4. Check IP rules
    rules = await get_firewall_rules(main_site_id)
    if not rules:
        issues.append({"severity": "info", "category": "rules", "message": "No IP rules configured", "action": "Consider adding whitelist or blacklist rules"})
        score -= 5

    # 5. Check users - 2FA adoption
    # Users are linked via main_site_users collection, not team_ids
    site_user_docs = await db.main_site_users.find(
        {"main_site_id": main_site_id}, {"_id": 0, "user_id": 1}
    ).to_list(500)
    user_ids = [d["user_id"] for d in site_user_docs]
    
    users = []
    if user_ids:
        users = await db.users.find(
            {"id": {"$in": user_ids}, "is_system_account": {"$ne": True}},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "totp_enabled": 1, "temp_password": 1,
             "force_password_change": 1, "password_changed_at": 1, "created_at": 1, "is_blocked": 1}
        ).to_list(500)

    total_users = len(users)
    users_without_2fa = [u for u in users if not u.get("totp_enabled")]
    users_with_temp_pw = [u for u in users if u.get("temp_password")]
    users_never_changed_pw = [u for u in users if not u.get("password_changed_at")]
    
    if total_users > 0:
        tfa_pct = ((total_users - len(users_without_2fa)) / total_users) * 100
        if tfa_pct < 50:
            issues.append({"severity": "critical", "category": "2fa", "message": f"Only {tfa_pct:.0f}% of users have 2FA enabled ({len(users_without_2fa)}/{total_users} without)", "action": "Enforce 2FA for all users"})
            score -= 20
        elif tfa_pct < 80:
            issues.append({"severity": "warning", "category": "2fa", "message": f"{tfa_pct:.0f}% 2FA adoption ({len(users_without_2fa)} users without)", "action": "Encourage remaining users to enable 2FA"})
            score -= 10

    if users_with_temp_pw:
        issues.append({"severity": "warning", "category": "passwords", "message": f"{len(users_with_temp_pw)} user(s) still using temporary passwords", "action": "Force password change for these users"})
        score -= 10

    if users_never_changed_pw:
        issues.append({"severity": "info", "category": "passwords", "message": f"{len(users_never_changed_pw)} user(s) never changed their password", "action": "Consider requiring password updates"})
        score -= 5

    # 6. Active blocks — filtered by main_site_id
    active_blocks = await db.firewall_blocks.count_documents({"active": True, "main_site_id": main_site_id})

    score = max(0, min(100, score))
    
    if score >= 80:
        grade = "good"
    elif score >= 50:
        grade = "moderate"
    else:
        grade = "poor"

    # Build weak password users list (temp pw + never changed)
    weak_password_users = []
    for u in users_with_temp_pw:
        weak_password_users.append({
            "id": u["id"], "name": u.get("name", ""), "email": u.get("email", ""),
            "reason": "Using temporary password", "force_password_change": u.get("force_password_change", False)
        })
    for u in users_never_changed_pw:
        if u["id"] not in [w["id"] for w in weak_password_users]:
            weak_password_users.append({
                "id": u["id"], "name": u.get("name", ""), "email": u.get("email", ""),
                "reason": "Never changed password", "force_password_change": u.get("force_password_change", False)
            })

    return {
        "score": score,
        "grade": grade,
        "total_users": total_users,
        "users_without_2fa": len(users_without_2fa),
        "users_with_weak_passwords": len(weak_password_users),
        "active_blocks": active_blocks,
        "active_rules": len(rules),
        "issues": sorted(issues, key=lambda x: {"critical": 0, "warning": 1, "info": 2}[x["severity"]]),
        "weak_password_users": weak_password_users,
        "users_without_2fa_list": [
            {"id": u["id"], "name": u.get("name", ""), "email": u.get("email", "")}
            for u in users_without_2fa
        ],
    }



# ============== ENDPOINT PROTECTION ==============

class EndpointSettingsUpdate(BaseModel):
    public_groups: List[str]


@firewall_router.get("/endpoints/{main_site_id}")
async def get_endpoint_protection(main_site_id: str, current_user: dict = Depends(get_current_user)):
    """Get endpoint protection settings for a main site."""
    require_network_admin(current_user)
    settings = await get_endpoint_settings(main_site_id)
    settings.pop("_cached_at", None)
    groups = get_all_endpoint_groups()
    public_groups = settings.get("public_groups", [])

    for g in groups:
        g["is_public"] = g["id"] in public_groups

    return {
        "groups": groups,
        "public_groups": public_groups,
    }


@firewall_router.put("/endpoints/{main_site_id}")
async def update_endpoint_protection(
    main_site_id: str,
    body: EndpointSettingsUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update which endpoint groups are public for a main site."""
    require_network_admin(current_user)
    # Validate group IDs
    valid_ids = set(ENDPOINT_GROUPS.keys())
    for gid in body.public_groups:
        if gid not in valid_ids:
            raise HTTPException(status_code=400, detail=f"Unknown group: {gid}")

    await db.endpoint_settings.update_one(
        {"main_site_id": main_site_id},
        {"$set": {
            "main_site_id": main_site_id,
            "public_groups": body.public_groups,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    invalidate_endpoint_cache(main_site_id)
    return {"public_groups": body.public_groups}


@firewall_router.get("/endpoints/{main_site_id}/connections")
async def get_endpoint_connections(main_site_id: str, current_user: dict = Depends(get_current_user)):
    """Get live connection stats for public endpoints of a main site."""
    require_network_admin(current_user)
    stats = get_public_connection_stats(main_site_id)

    # Enrich with geo info
    for stat in stats:
        for conn in stat.get("connections", []):
            geo = await get_geo_info(conn["ip"])
            conn["country_name"] = geo.get("country_name", "")
            conn["city"] = geo.get("city", "")

    return {"connections": stats}


# ============== RACK-LEVEL FIREWALL MANAGEMENT ==============

EUROPEAN_COUNTRIES = [
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
    "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
    "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "NO", "CH",
    "IS", "LI", "AD", "MC", "SM", "VA", "ME", "RS", "AL", "MK",
    "BA", "MD", "UA", "BY", "XK",
]

ALL_COUNTRIES = {
    "AF": "Afghanistan", "AL": "Albania", "DZ": "Algeria", "AD": "Andorra", "AO": "Angola",
    "AR": "Argentina", "AM": "Armenia", "AU": "Australia", "AT": "Austria", "AZ": "Azerbaijan",
    "BS": "Bahamas", "BH": "Bahrain", "BD": "Bangladesh", "BY": "Belarus", "BE": "Belgium",
    "BZ": "Belize", "BJ": "Benin", "BT": "Bhutan", "BO": "Bolivia", "BA": "Bosnia and Herzegovina",
    "BW": "Botswana", "BR": "Brazil", "BN": "Brunei", "BG": "Bulgaria", "BF": "Burkina Faso",
    "BI": "Burundi", "KH": "Cambodia", "CM": "Cameroon", "CA": "Canada", "CF": "Central African Republic",
    "TD": "Chad", "CL": "Chile", "CN": "China", "CO": "Colombia", "CD": "Congo (DRC)",
    "CR": "Costa Rica", "HR": "Croatia", "CU": "Cuba", "CY": "Cyprus", "CZ": "Czech Republic",
    "DK": "Denmark", "DJ": "Djibouti", "DO": "Dominican Republic", "EC": "Ecuador", "EG": "Egypt",
    "SV": "El Salvador", "EE": "Estonia", "ET": "Ethiopia", "FI": "Finland", "FR": "France",
    "GA": "Gabon", "GE": "Georgia", "DE": "Germany", "GH": "Ghana", "GR": "Greece",
    "GT": "Guatemala", "GN": "Guinea", "HT": "Haiti", "HN": "Honduras", "HU": "Hungary",
    "IS": "Iceland", "IN": "India", "ID": "Indonesia", "IR": "Iran", "IQ": "Iraq",
    "IE": "Ireland", "IL": "Israel", "IT": "Italy", "JM": "Jamaica", "JP": "Japan",
    "JO": "Jordan", "KZ": "Kazakhstan", "KE": "Kenya", "KW": "Kuwait", "KG": "Kyrgyzstan",
    "LA": "Laos", "LV": "Latvia", "LB": "Lebanon", "LI": "Liechtenstein", "LT": "Lithuania",
    "LU": "Luxembourg", "MK": "North Macedonia", "MG": "Madagascar", "MY": "Malaysia",
    "ML": "Mali", "MT": "Malta", "MX": "Mexico", "MD": "Moldova", "MC": "Monaco",
    "MN": "Mongolia", "ME": "Montenegro", "MA": "Morocco", "MZ": "Mozambique", "MM": "Myanmar",
    "NP": "Nepal", "NL": "Netherlands", "NZ": "New Zealand", "NI": "Nicaragua", "NE": "Niger",
    "NG": "Nigeria", "NO": "Norway", "OM": "Oman", "PK": "Pakistan", "PA": "Panama",
    "PY": "Paraguay", "PE": "Peru", "PH": "Philippines", "PL": "Poland", "PT": "Portugal",
    "QA": "Qatar", "RO": "Romania", "RU": "Russia", "RW": "Rwanda", "SA": "Saudi Arabia",
    "SN": "Senegal", "RS": "Serbia", "SG": "Singapore", "SK": "Slovakia", "SI": "Slovenia",
    "SO": "Somalia", "ZA": "South Africa", "KR": "South Korea", "ES": "Spain", "LK": "Sri Lanka",
    "SD": "Sudan", "SE": "Sweden", "CH": "Switzerland", "SY": "Syria", "TW": "Taiwan",
    "TJ": "Tajikistan", "TZ": "Tanzania", "TH": "Thailand", "TN": "Tunisia", "TR": "Turkey",
    "TM": "Turkmenistan", "UG": "Uganda", "UA": "Ukraine", "AE": "UAE", "GB": "United Kingdom",
    "US": "United States", "UY": "Uruguay", "UZ": "Uzbekistan", "VE": "Venezuela", "VN": "Vietnam",
    "YE": "Yemen", "ZM": "Zambia", "ZW": "Zimbabwe", "XK": "Kosovo", "SM": "San Marino", "VA": "Vatican City",
}


class GeoRulesUpdate(BaseModel):
    allowed_countries: List[str]


class UnblockIPRequest(BaseModel):
    ip: str
    rack_id: str


# --- Geo-blocking rules per rack ---

@firewall_router.get("/rack/{rack_id}/geo-rules")
async def get_rack_geo_rules(rack_id: str, current_user: dict = Depends(get_current_user)):
    """Get geo-blocking rules for a rack. Returns allowed countries."""
    require_network_admin(current_user)
    doc = await db.firewall_geo_rules.find_one({"rack_id": rack_id}, {"_id": 0})
    if not doc:
        return {"rack_id": rack_id, "allowed_countries": EUROPEAN_COUNTRIES, "is_default": True}
    return doc


@firewall_router.put("/rack/{rack_id}/geo-rules")
async def update_rack_geo_rules(rack_id: str, body: GeoRulesUpdate, current_user: dict = Depends(get_current_user)):
    """Update allowed countries for a rack."""
    require_network_admin(current_user)
    now = datetime.now(timezone.utc).isoformat()
    await db.firewall_geo_rules.update_one(
        {"rack_id": rack_id},
        {"$set": {"rack_id": rack_id, "allowed_countries": body.allowed_countries, "is_default": False, "updated_at": now, "updated_by": current_user.get("email", "")}},
        upsert=True,
    )
    return {"rack_id": rack_id, "allowed_countries": body.allowed_countries}


@firewall_router.post("/rack/{rack_id}/geo-rules/add-country")
async def add_country_to_rack(rack_id: str, country_code: str = Query(...), current_user: dict = Depends(get_current_user)):
    """Add a country to the allowed list."""
    require_network_admin(current_user)
    doc = await db.firewall_geo_rules.find_one({"rack_id": rack_id}, {"_id": 0})
    allowed = doc["allowed_countries"] if doc else list(EUROPEAN_COUNTRIES)
    if country_code.upper() not in allowed:
        allowed.append(country_code.upper())
    now = datetime.now(timezone.utc).isoformat()
    await db.firewall_geo_rules.update_one(
        {"rack_id": rack_id},
        {"$set": {"rack_id": rack_id, "allowed_countries": allowed, "is_default": False, "updated_at": now}},
        upsert=True,
    )
    return {"allowed_countries": allowed}


@firewall_router.post("/rack/{rack_id}/geo-rules/remove-country")
async def remove_country_from_rack(rack_id: str, country_code: str = Query(...), current_user: dict = Depends(get_current_user)):
    """Remove a country from the allowed list (block it)."""
    require_network_admin(current_user)
    doc = await db.firewall_geo_rules.find_one({"rack_id": rack_id}, {"_id": 0})
    allowed = doc["allowed_countries"] if doc else list(EUROPEAN_COUNTRIES)
    allowed = [c for c in allowed if c != country_code.upper()]
    now = datetime.now(timezone.utc).isoformat()
    await db.firewall_geo_rules.update_one(
        {"rack_id": rack_id},
        {"$set": {"rack_id": rack_id, "allowed_countries": allowed, "is_default": False, "updated_at": now}},
        upsert=True,
    )
    return {"allowed_countries": allowed}


# --- Brute-force logs and blocked IPs ---

@firewall_router.get("/rack/{rack_id}/logs")
async def get_rack_firewall_logs(rack_id: str, limit: int = Query(50, le=200), current_user: dict = Depends(get_current_user)):
    """Get firewall security logs for all sites in a rack."""
    require_network_admin(current_user)
    # Find sites in this rack
    rack = await db.server_racks.find_one({"id": rack_id}, {"_id": 0, "site_ids": 1})
    site_ids = rack.get("site_ids", []) if rack else []
    logs = await db.firewall_logs.find(
        {"$or": [{"site_id": {"$in": site_ids}}, {"rack_id": rack_id}]}, {"_id": 0}
    ).sort("timestamp", -1).to_list(limit)
    return {"logs": logs, "total": len(logs)}


@firewall_router.get("/rack/{rack_id}/blocked-ips")
async def get_rack_blocked_ips(rack_id: str, current_user: dict = Depends(get_current_user)):
    """Get all blocked IPs for sites in a rack."""
    require_network_admin(current_user)
    blocked = await db.firewall_blocked_ips.find(
        {"rack_id": rack_id}, {"_id": 0}
    ).sort("blocked_at", -1).to_list(500)
    return {"blocked_ips": blocked}


@firewall_router.post("/rack/{rack_id}/unblock-ip")
async def unblock_rack_ip(rack_id: str, body: UnblockIPRequest, current_user: dict = Depends(get_current_user)):
    """Unblock an IP address for a rack."""
    require_network_admin(current_user)
    result = await db.firewall_blocked_ips.delete_one({"rack_id": rack_id, "ip": body.ip})
    # Log the unblock
    await db.firewall_logs.insert_one({
        "id": str(uuid.uuid4()),
        "site_id": "",
        "rack_id": rack_id,
        "event": "ip_unblocked",
        "ip": body.ip,
        "details": f"Manually unblocked by {current_user.get('email', '')}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "severity": "info",
    })
    return {"unblocked": result.deleted_count > 0, "ip": body.ip}


@firewall_router.post("/rack/{rack_id}/block-ip")
async def block_rack_ip(rack_id: str, ip: str = Query(...), reason: str = Query("manual"), current_user: dict = Depends(get_current_user)):
    """Manually block an IP address for a rack."""
    require_network_admin(current_user)
    now = datetime.now(timezone.utc).isoformat()
    await db.firewall_blocked_ips.update_one(
        {"rack_id": rack_id, "ip": ip},
        {"$set": {"rack_id": rack_id, "ip": ip, "reason": reason, "blocked_at": now, "blocked_by": current_user.get("email", "")}},
        upsert=True,
    )
    await db.firewall_logs.insert_one({
        "id": str(uuid.uuid4()),
        "site_id": "",
        "rack_id": rack_id,
        "event": "ip_blocked",
        "ip": ip,
        "details": f"Manually blocked by {current_user.get('email', '')} — {reason}",
        "timestamp": now,
        "severity": "warning",
    })
    return {"blocked": True, "ip": ip}


@firewall_router.get("/countries")
async def list_countries(current_user: dict = Depends(get_current_user)):
    """Return all countries with codes and European flag."""
    require_network_admin(current_user)
    countries = []
    for code, name in sorted(ALL_COUNTRIES.items(), key=lambda x: x[1]):
        countries.append({"code": code, "name": name, "is_european": code in EUROPEAN_COUNTRIES})
    return {"countries": countries}
