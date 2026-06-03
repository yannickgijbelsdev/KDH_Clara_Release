"""
Device & location trust tracking (Zero Trust).

When a user logs in we hash (user_agent + accept-language + IP-prefix) into a
device fingerprint. If we have not seen this fingerprint for the user before,
we record it and emit a "new location" audit event so the user / admin is
alerted (via the existing audit→notification bridge).

Also records the city/country if Cloudflare provides it via CF-IPCountry, so
admins can review last-seen geos in the user profile.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone

from database import db
from services.audit import log_action

log = logging.getLogger("security.device_trust")


def _ip_prefix(ip: str | None) -> str:
    if not ip:
        return ""
    # /24 for IPv4, /48 for IPv6 — accepts roaming on same network
    if ":" in ip:
        return ":".join(ip.split(":")[:3]) + "::/48"
    return ".".join(ip.split(".")[:3]) + ".0/24"


def fingerprint(user_agent: str | None, accept_lang: str | None, ip: str | None) -> str:
    raw = "|".join([user_agent or "", accept_lang or "", _ip_prefix(ip)])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


async def record_login_device(
    *,
    user: dict,
    ip: str | None,
    user_agent: str | None,
    accept_lang: str | None,
    country: str | None = None,
    city: str | None = None,
) -> dict:
    """Record device fingerprint. Returns dict with 'is_new' flag."""
    fp = fingerprint(user_agent, accept_lang, ip)
    now = datetime.now(timezone.utc).isoformat()

    existing = await db.user_devices.find_one(
        {"user_id": user["id"], "fingerprint": fp},
        {"_id": 0},
    )

    if existing:
        await db.user_devices.update_one(
            {"user_id": user["id"], "fingerprint": fp},
            {"$set": {
                "last_seen_at": now,
                "last_ip": ip,
                "last_country": country,
                "last_city": city,
            }, "$inc": {"login_count": 1}},
        )
        return {"is_new": False, "fingerprint": fp}

    # New device
    await db.user_devices.insert_one({
        "user_id": user["id"],
        "fingerprint": fp,
        "user_agent": (user_agent or "")[:300],
        "accept_lang": (accept_lang or "")[:50],
        "first_ip": ip,
        "last_ip": ip,
        "first_country": country,
        "first_city": city,
        "last_country": country,
        "last_city": city,
        "first_seen_at": now,
        "last_seen_at": now,
        "login_count": 1,
        "trusted": False,
    })

    # Emit audit event — the existing audit→notification bridge will alert
    try:
        await log_action(
            action="New device login",
            category="auth",
            user_id=user["id"],
            user_name=user.get("name"),
            user_email=user.get("email"),
            team_id=user.get("team_id"),
            main_site_id=None,
            ip_address=ip,
            target_type="device",
            target_id=fp,
            target_name=(user_agent or "Unknown device")[:80],
            details={
                "description": f"First login from new device/location ({country or 'unknown country'}, IP {ip})",
                "country": country,
                "city": city,
                "fingerprint": fp,
            },
        )
    except Exception as e:
        log.warning("Failed to log new-device audit event: %s", e)

    return {"is_new": True, "fingerprint": fp}
