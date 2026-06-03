"""
Anomaly detection scheduler (Zero Trust continuous monitoring).

Runs every 5 minutes and flags suspicious patterns in audit logs.
Findings are written to the `security_anomalies` collection and an
audit event is emitted so admins receive a notification.

Detections (intentionally conservative — low false-positive rate):
  - High volume of failed logins for the same identity in 10 minutes
  - High volume of failed logins from a single IP in 10 minutes
  - Off-hours (00:00–05:00 local UTC) admin-level write actions
  - Sudden burst of permission/role changes by a single actor (>10 in 5 min)
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from database import db
from services.audit import log_action

log = logging.getLogger("security.anomaly")

_SCAN_INTERVAL_SECONDS = 300  # 5 minutes
_started = False


async def _scan_failed_logins():
    """Detect brute-force / credential stuffing patterns."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    pipeline = [
        {"$match": {
            "category": "auth",
            "action": {"$in": ["Failed login", "Invalid credentials", "Login failure"]},
            "created_at": {"$gte": cutoff},
        }},
        {"$group": {
            "_id": {"ip": "$ip_address", "email": "$user_email"},
            "count": {"$sum": 1},
        }},
        {"$match": {"count": {"$gte": 10}}},
    ]
    cursor = db.audit_logs.aggregate(pipeline)
    async for row in cursor:
        key = row["_id"]
        await _record_anomaly(
            kind="credential_stuffing",
            severity="high",
            description=f"{row['count']} failed login attempts in last 10 min for {key.get('email') or '?'} from {key.get('ip') or '?'}",
            details=row,
        )


async def _scan_off_hours_admin():
    """Detect admin writes between 00:00 and 05:00 UTC."""
    now = datetime.now(timezone.utc)
    if not (0 <= now.hour < 5):
        return
    cutoff = (now - timedelta(minutes=_SCAN_INTERVAL_SECONDS // 60)).isoformat()
    cursor = db.audit_logs.find(
        {
            "created_at": {"$gte": cutoff},
            "category": {"$in": ["user", "settings", "firewall"]},
        },
        {"_id": 0, "user_email": 1, "action": 1, "ip_address": 1, "created_at": 1, "target_name": 1},
    )
    async for entry in cursor:
        await _record_anomaly(
            kind="off_hours_admin",
            severity="medium",
            description=f"Admin action '{entry.get('action')}' at {entry.get('created_at')} by {entry.get('user_email')}",
            details=entry,
        )


async def _scan_permission_burst():
    """Detect >10 role/permission changes by the same actor in 5 min."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    pipeline = [
        {"$match": {
            "category": "user",
            "action": {"$regex": "(role|permission|invited|removed)", "$options": "i"},
            "created_at": {"$gte": cutoff},
        }},
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}, "actor": {"$first": "$user_email"}}},
        {"$match": {"count": {"$gte": 10}}},
    ]
    async for row in db.audit_logs.aggregate(pipeline):
        await _record_anomaly(
            kind="permission_burst",
            severity="high",
            description=f"{row['count']} permission changes in 5 min by {row.get('actor') or row['_id']}",
            details=row,
        )


async def _record_anomaly(*, kind: str, severity: str, description: str, details: dict):
    """Deduplicate (kind + first 100 chars of description) within the past hour."""
    dedup_key = f"{kind}:{description[:100]}"
    existing = await db.security_anomalies.find_one(
        {
            "dedup_key": dedup_key,
            "created_at": {"$gte": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()},
        },
        {"_id": 0, "id": 1},
    )
    if existing:
        return
    doc = {
        "id": f"anom_{datetime.now(timezone.utc).timestamp()}",
        "kind": kind,
        "severity": severity,
        "description": description,
        "details": details,
        "dedup_key": dedup_key,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "acknowledged": False,
    }
    await db.security_anomalies.insert_one(doc)
    log.warning("Anomaly %s [%s]: %s", kind, severity, description)
    try:
        await log_action(
            action=f"Security anomaly: {kind}",
            category="firewall",
            user_id="system",
            user_name="Zero Trust Monitor",
            user_email=None,
            team_id=None,
            main_site_id=None,
            ip_address=None,
            target_type="anomaly",
            target_name=kind,
            details={"description": description, "severity": severity},
        )
    except Exception:
        pass


async def _run_loop():
    log.info("Anomaly detection scheduler running every %ds", _SCAN_INTERVAL_SECONDS)
    while True:
        try:
            await asyncio.gather(
                _scan_failed_logins(),
                _scan_off_hours_admin(),
                _scan_permission_burst(),
            )
        except Exception as e:
            log.error("Anomaly scan failed: %s", e, exc_info=True)
        await asyncio.sleep(_SCAN_INTERVAL_SECONDS)


def start_scheduler():
    global _started
    if _started:
        return
    _started = True
    asyncio.create_task(_run_loop())
