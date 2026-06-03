"""
Brute-force lockout for authentication endpoints (Zero Trust assume-breach).

Tracks failed login attempts per (email, ip) and globally per ip. Locks the
identity for an exponentially-growing window. Persisted in MongoDB so it
survives restarts and works across multiple workers.

Public API:
    - is_locked(identifier) -> (locked: bool, retry_after_seconds: int)
    - record_failure(identifier, ip, reason) -> dict (with current state)
    - record_success(identifier, ip) -> None
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Tuple

from database import db

log = logging.getLogger("security.brute_force")

# Tuning — chosen so a legitimate fat-fingered user is *not* locked out:
#   1–4 failures: no lock
#   5  failures: 1 minute lock
#   6  failures: 5 minutes
#   7  failures: 15 minutes
#   8+ failures: 60 minutes (rolling)
_LOCK_LADDER_SECONDS = [0, 0, 0, 0, 0, 60, 300, 900, 3600]


def _lock_seconds(failure_count: int) -> int:
    if failure_count <= 0:
        return 0
    if failure_count >= len(_LOCK_LADDER_SECONDS):
        return _LOCK_LADDER_SECONDS[-1]
    return _LOCK_LADDER_SECONDS[failure_count]


async def _get_record(identifier: str) -> dict:
    return await db.brute_force_locks.find_one({"identifier": identifier}, {"_id": 0}) or {}


async def is_locked(identifier: str) -> Tuple[bool, int]:
    """Return (locked, retry_after_seconds)."""
    rec = await _get_record(identifier)
    locked_until = rec.get("locked_until")
    if not locked_until:
        return False, 0
    if isinstance(locked_until, str):
        try:
            locked_until = datetime.fromisoformat(locked_until)
        except Exception:
            return False, 0
    now = datetime.now(timezone.utc)
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    if locked_until <= now:
        return False, 0
    return True, int((locked_until - now).total_seconds())


async def record_failure(identifier: str, ip: str | None = None, reason: str = "invalid_credentials") -> dict:
    """Increment failure count and lock when ladder threshold reached."""
    now = datetime.now(timezone.utc)
    rec = await _get_record(identifier)
    failure_count = int(rec.get("failure_count") or 0) + 1
    lock_seconds = _lock_seconds(failure_count)
    locked_until = now + timedelta(seconds=lock_seconds) if lock_seconds else None

    update = {
        "identifier": identifier,
        "failure_count": failure_count,
        "last_failure_at": now.isoformat(),
        "last_failure_ip": ip,
        "last_failure_reason": reason,
        "locked_until": locked_until.isoformat() if locked_until else None,
    }
    await db.brute_force_locks.update_one(
        {"identifier": identifier},
        {"$set": update},
        upsert=True,
    )

    if lock_seconds:
        log.warning("Brute-force lock: identifier=%s ip=%s failures=%d lock=%ds",
                    identifier, ip, failure_count, lock_seconds)
    return {
        "failure_count": failure_count,
        "locked": bool(lock_seconds),
        "retry_after": lock_seconds,
    }


async def record_success(identifier: str, ip: str | None = None) -> None:
    """Clear any failures + lock for this identifier on successful login."""
    await db.brute_force_locks.delete_one({"identifier": identifier})
    if ip:
        # Also clear IP-scoped lock so a roaming user is not penalised
        await db.brute_force_locks.delete_one({"identifier": f"ip:{ip}"})
