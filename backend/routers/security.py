"""
Zero Trust admin routes.

Read-only views over the security telemetry collected by the firewall,
device-trust, brute-force and anomaly services. System admins and
network admins can review activity, acknowledge anomalies, and revoke
trusted devices.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timezone
from typing import Optional

from database import db
from services.auth import require_network_admin
from services.audit import log_action

security_router = APIRouter(prefix="/security", tags=["Security (Zero Trust)"])


@security_router.get("/anomalies")
async def list_anomalies(
    severity: Optional[str] = Query(None),
    kind: Optional[str] = Query(None),
    acknowledged: Optional[bool] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(require_network_admin),
):
    """List recent security anomalies. Default: most recent first."""
    q: dict = {}
    if severity:
        q["severity"] = severity
    if kind:
        q["kind"] = kind
    if acknowledged is not None:
        q["acknowledged"] = acknowledged
    items = await (
        db.security_anomalies.find(q, {"_id": 0})
        .sort("created_at", -1)
        .limit(limit)
        .to_list(limit)
    )
    return {"items": items, "count": len(items)}


@security_router.post("/anomalies/{anomaly_id}/acknowledge")
async def acknowledge_anomaly(anomaly_id: str, current_user: dict = Depends(require_network_admin)):
    res = await db.security_anomalies.update_one(
        {"id": anomaly_id},
        {"$set": {
            "acknowledged": True,
            "acknowledged_by": current_user["id"],
            "acknowledged_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Anomaly not found")
    await log_action(
        action="Acknowledged security anomaly",
        category="firewall",
        user_id=current_user["id"],
        user_email=current_user.get("email"),
        target_type="anomaly",
        target_id=anomaly_id,
    )
    return {"ok": True}


@security_router.get("/devices")
async def list_my_devices(current_user: dict = Depends(require_network_admin), user_id: Optional[str] = None):
    """List known devices for current user — or any user when admin specifies user_id."""
    target_user = user_id or current_user["id"]
    devices = await (
        db.user_devices.find({"user_id": target_user}, {"_id": 0})
        .sort("last_seen_at", -1)
        .to_list(100)
    )
    return {"items": devices, "count": len(devices)}


@security_router.post("/devices/{fingerprint}/revoke")
async def revoke_device(fingerprint: str, current_user: dict = Depends(require_network_admin)):
    """Remove a trusted device. Future logins from it will trigger a new-device alert again."""
    res = await db.user_devices.delete_one({"fingerprint": fingerprint, "user_id": current_user["id"]})
    if res.deleted_count == 0:
        # Admins can revoke devices belonging to other users by fingerprint
        res = await db.user_devices.delete_one({"fingerprint": fingerprint})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    await log_action(
        action="Revoked trusted device",
        category="auth",
        user_id=current_user["id"],
        user_email=current_user.get("email"),
        target_type="device",
        target_id=fingerprint,
    )
    return {"ok": True}


@security_router.get("/lockouts")
async def list_lockouts(current_user: dict = Depends(require_network_admin)):
    """List currently-locked or recently-failed identities."""
    items = await (
        db.brute_force_locks.find({}, {"_id": 0})
        .sort("last_failure_at", -1)
        .limit(200)
        .to_list(200)
    )
    return {"items": items, "count": len(items)}


@security_router.post("/lockouts/{identifier:path}/clear")
async def clear_lockout(identifier: str, current_user: dict = Depends(require_network_admin)):
    res = await db.brute_force_locks.delete_one({"identifier": identifier})
    await log_action(
        action="Cleared brute-force lockout",
        category="firewall",
        user_id=current_user["id"],
        user_email=current_user.get("email"),
        target_type="lockout",
        target_name=identifier,
    )
    return {"ok": True, "cleared": res.deleted_count > 0}


@security_router.get("/overview")
async def security_overview(current_user: dict = Depends(require_network_admin)):
    """High-level Zero Trust posture summary for dashboard widget."""
    open_anomalies = await db.security_anomalies.count_documents({"acknowledged": False})
    high_severity = await db.security_anomalies.count_documents({
        "acknowledged": False, "severity": "high"
    })
    active_locks = await db.brute_force_locks.count_documents({
        "locked_until": {"$ne": None}
    })
    known_devices = await db.user_devices.count_documents({})
    from services.security.encryption import is_available as enc_available
    return {
        "encryption_enabled": enc_available(),
        "open_anomalies": open_anomalies,
        "high_severity_anomalies": high_severity,
        "active_lockouts": active_locks,
        "known_devices": known_devices,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Maintenance: clean stale RDS source values on content items ──

@security_router.post("/maintenance/clean-content-sources")
async def clean_content_sources(current_user: dict = Depends(require_network_admin)):
    """Drop `source` fields from content items that don't match the main site's
    configured RDS stations. Lets admins re-tag content via the new dynamic
    Source filter (driven by `/api/rds-stations/by-slug/{slug}`).

    Idempotent — running it twice is safe.
    """
    # Build per-site allow-list (codes + names, lowercased)
    allowed_per_site: dict[str, set[str]] = {}
    async for st in db.rds_stations.find({}, {"_id": 0, "main_site_id": 1, "code": 1, "name": 1}):
        msid = st.get("main_site_id")
        if not msid:
            continue
        bucket = allowed_per_site.setdefault(msid, set())
        if st.get("code"):
            bucket.add(st["code"].lower())
        if st.get("name"):
            bucket.add(st["name"].lower())

    kept = 0
    cleared = 0
    examples = []
    async for doc in db.content_items.find(
        {"source": {"$nin": [None, ""], "$exists": True}},
        {"_id": 1, "main_site_id": 1, "source": 1, "title": 1},
    ):
        src = (doc.get("source") or "").strip()
        if not src:
            continue
        allowed = allowed_per_site.get(doc.get("main_site_id"), set())
        if src.lower() in allowed:
            kept += 1
            continue
        await db.content_items.update_one({"_id": doc["_id"]}, {"$unset": {"source": ""}})
        cleared += 1
        if len(examples) < 5:
            examples.append({"title": doc.get("title"), "old_source": src})

    await log_action(
        action="Cleaned stale content sources",
        category="settings",
        user_id=current_user["id"],
        user_email=current_user.get("email"),
        target_type="maintenance",
        details={"kept": kept, "cleared": cleared},
    )
    return {"kept": kept, "cleared": cleared, "examples": examples}



@security_router.post("/maintenance/enable-clara-publish-everywhere")
async def enable_clara_publish_everywhere(current_user: dict = Depends(require_network_admin)):
    """Add the `clara_publish` feature flag to every main_site that doesn't
    have it yet. One-time migration to retroactively unlock the News API for
    sites created before this feature became the default.

    Idempotent — running it twice is safe.
    """
    sites = await db.main_sites.find(
        {}, {"_id": 0, "id": 1, "name": 1, "enabled_features": 1}
    ).to_list(500)

    updated = 0
    updated_sites = []
    for s in sites:
        feats = s.get("enabled_features") or []
        if "clara_publish" in feats:
            continue
        await db.main_sites.update_one(
            {"id": s["id"]},
            {"$set": {"enabled_features": feats + ["clara_publish"]}},
        )
        updated += 1
        updated_sites.append(s.get("name"))

    await log_action(
        action="Enabled clara_publish on all main sites",
        category="settings",
        user_id=current_user["id"],
        user_email=current_user.get("email"),
        target_type="maintenance",
        details={"sites_updated": updated, "names": updated_sites},
    )
    return {"updated": updated, "sites": updated_sites}
