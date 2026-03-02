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


# ============== ACTIVE SESSIONS ==============

@firewall_router.get("/sessions")
async def list_sessions(
    main_site_id: Optional[str] = None,
    active_only: bool = True,
    current_user: dict = Depends(get_current_user),
):
    """List active user sessions."""
    require_network_admin(current_user)
    query = {}
    if active_only:
        query["active"] = True
    if main_site_id:
        # Get user_ids linked to this main site via main_site_users
        site_user_docs = await db.main_site_users.find(
            {"main_site_id": main_site_id}, {"_id": 0, "user_id": 1}
        ).to_list(500)
        user_ids = [d["user_id"] for d in site_user_docs]
        if user_ids:
            query["user_id"] = {"$in": user_ids}

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

    # 6. Active blocks
    active_blocks = await db.firewall_blocks.count_documents({"active": True})

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
