"""Firewall Service — IP blocking, geo-blocking, brute force protection, rate limiting."""
import ipaddress
import time
import logging
from datetime import datetime, timezone
from typing import Optional
from collections import defaultdict

import httpx
from database import db

logger = logging.getLogger("firewall")

# In-memory caches for performance (avoid DB queries on every request)
_ip_block_cache = {}  # ip -> expires_at timestamp
_geo_cache = {}  # ip -> {country_code, country_name, city, cached_at}
_rate_limit_tracker = defaultdict(list)  # ip -> [timestamp, ...]
_login_attempt_tracker = defaultdict(list)  # ip -> [timestamp, ...]
_rules_cache = {}  # main_site_id -> {rules, cached_at}
_settings_cache = {}  # main_site_id -> {settings, cached_at}

CACHE_TTL = 60  # seconds for rules/settings cache
GEO_CACHE_TTL = 3600  # 1 hour for geo lookups


def _now_ts():
    return time.time()


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def ip_in_range(ip_str: str, cidr: str) -> bool:
    """Check if an IP address is within a CIDR range."""
    try:
        return ipaddress.ip_address(ip_str) in ipaddress.ip_network(cidr, strict=False)
    except ValueError:
        return False


def ip_matches(ip_str: str, pattern: str) -> bool:
    """Check if IP matches a single IP or CIDR range."""
    try:
        if "/" in pattern:
            return ip_in_range(ip_str, pattern)
        return ip_str == pattern
    except ValueError:
        return False


async def get_geo_info(ip: str) -> dict:
    """Get geolocation info for an IP using ip-api.com (free, 45 req/min)."""
    if ip in ("unknown", "127.0.0.1", "localhost"):
        return {"country_code": "XX", "country_name": "Unknown", "city": "Unknown"}

    cached = _geo_cache.get(ip)
    if cached and (_now_ts() - cached.get("cached_at", 0)) < GEO_CACHE_TTL:
        return cached

    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"http://ip-api.com/json/{ip}?fields=status,country,countryCode,city,regionName")
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "success":
                    result = {
                        "country_code": data.get("countryCode", "XX"),
                        "country_name": data.get("country", "Unknown"),
                        "city": data.get("city", "Unknown"),
                        "region": data.get("regionName", ""),
                        "cached_at": _now_ts(),
                    }
                    _geo_cache[ip] = result
                    return result
    except Exception as e:
        logger.debug(f"Geo lookup failed for {ip}: {e}")

    fallback = {"country_code": "XX", "country_name": "Unknown", "city": "Unknown", "cached_at": _now_ts()}
    _geo_cache[ip] = fallback
    return fallback


async def get_firewall_settings(main_site_id: str) -> dict:
    """Get firewall settings for a main site (cached)."""
    cached = _settings_cache.get(main_site_id)
    if cached and (_now_ts() - cached.get("_cached_at", 0)) < CACHE_TTL:
        return cached

    settings = await db.firewall_settings.find_one(
        {"main_site_id": main_site_id}, {"_id": 0}
    )
    if not settings:
        settings = {
            "main_site_id": main_site_id,
            "enabled": True,
            "brute_force_max_attempts": 5,
            "brute_force_window_minutes": 15,
            "brute_force_ban_minutes": 30,
            "rate_limit_requests": 200,
            "rate_limit_window_seconds": 60,
            "geo_blocking_enabled": False,
            "blocked_countries": [],
        }
    settings["_cached_at"] = _now_ts()
    _settings_cache[main_site_id] = settings
    return settings


async def get_firewall_rules(main_site_id: str) -> list:
    """Get firewall rules for a main site (cached)."""
    cached = _rules_cache.get(main_site_id)
    if cached and (_now_ts() - cached.get("_cached_at", 0)) < CACHE_TTL:
        return cached.get("rules", [])

    rules = await db.firewall_rules.find(
        {"main_site_id": main_site_id, "active": True}, {"_id": 0}
    ).to_list(500)

    _rules_cache[main_site_id] = {"rules": rules, "_cached_at": _now_ts()}
    return rules


def invalidate_cache(main_site_id: str = None):
    """Invalidate firewall caches."""
    if main_site_id:
        _rules_cache.pop(main_site_id, None)
        _settings_cache.pop(main_site_id, None)
    else:
        _rules_cache.clear()
        _settings_cache.clear()


async def check_ip_blocked(ip: str) -> Optional[dict]:
    """Check if IP is currently blocked (in-memory + DB)."""
    # Check in-memory first
    cached = _ip_block_cache.get(ip)
    if cached:
        if cached["expires_at"] and _now_ts() > cached["expires_at"]:
            _ip_block_cache.pop(ip, None)
        else:
            return cached

    # Check DB
    block = await db.firewall_blocks.find_one(
        {"ip": ip, "active": True}, {"_id": 0}
    )
    if block:
        expires = block.get("expires_at")
        if expires:
            try:
                exp_ts = datetime.fromisoformat(expires).timestamp()
                if _now_ts() > exp_ts:
                    await db.firewall_blocks.update_one(
                        {"ip": ip, "active": True},
                        {"$set": {"active": False, "unblocked_at": _now_iso(), "unblock_reason": "expired"}}
                    )
                    return None
                _ip_block_cache[ip] = {**block, "expires_at": exp_ts}
            except Exception:
                _ip_block_cache[ip] = {**block, "expires_at": None}
        else:
            _ip_block_cache[ip] = {**block, "expires_at": None}
        return block

    return None


async def block_ip(ip: str, reason: str, duration_minutes: Optional[int] = None,
                   main_site_id: str = None, auto: bool = True) -> dict:
    """Block an IP address."""
    import uuid
    now = _now_iso()
    expires_at = None
    if duration_minutes:
        from datetime import timedelta
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=duration_minutes)).isoformat()

    block = {
        "id": str(uuid.uuid4()),
        "ip": ip,
        "reason": reason,
        "main_site_id": main_site_id,
        "auto_blocked": auto,
        "active": True,
        "blocked_at": now,
        "expires_at": expires_at,
    }
    await db.firewall_blocks.insert_one({**block})

    # Update in-memory cache
    exp_ts = None
    if expires_at:
        try:
            exp_ts = datetime.fromisoformat(expires_at).timestamp()
        except Exception:
            pass
    _ip_block_cache[ip] = {**block, "expires_at": exp_ts}

    # Log
    await log_security_event("ip_blocked", ip, main_site_id, {
        "reason": reason, "auto": auto, "duration_minutes": duration_minutes
    })

    return block


async def unblock_ip(ip: str, reason: str = "manual") -> bool:
    """Unblock an IP address."""
    result = await db.firewall_blocks.update_many(
        {"ip": ip, "active": True},
        {"$set": {"active": False, "unblocked_at": _now_iso(), "unblock_reason": reason}}
    )
    _ip_block_cache.pop(ip, None)

    if result.modified_count > 0:
        await log_security_event("ip_unblocked", ip, None, {"reason": reason})
        return True
    return False


def check_rate_limit(ip: str, max_requests: int, window_seconds: int) -> bool:
    """Check if IP exceeds rate limit. Returns True if blocked."""
    now = _now_ts()
    cutoff = now - window_seconds
    _rate_limit_tracker[ip] = [t for t in _rate_limit_tracker[ip] if t > cutoff]
    _rate_limit_tracker[ip].append(now)
    return len(_rate_limit_tracker[ip]) > max_requests


def record_login_attempt(ip: str) -> int:
    """Record a failed login attempt. Returns current attempt count in window."""
    now = _now_ts()
    # Clean old entries (15 min window default, but we keep a wide window)
    cutoff = now - 1800  # 30 min
    _login_attempt_tracker[ip] = [t for t in _login_attempt_tracker[ip] if t > cutoff]
    _login_attempt_tracker[ip].append(now)
    return len(_login_attempt_tracker[ip])


def get_login_attempts(ip: str, window_minutes: int) -> int:
    """Get login attempt count for an IP within a time window."""
    now = _now_ts()
    cutoff = now - (window_minutes * 60)
    return sum(1 for t in _login_attempt_tracker.get(ip, []) if t > cutoff)


def clear_login_attempts(ip: str):
    """Clear login attempts after successful login."""
    _login_attempt_tracker.pop(ip, None)


async def log_security_event(event_type: str, ip: str, main_site_id: str = None,
                              details: dict = None, user_id: str = None, user_email: str = None):
    """Log a security event and trigger notifications."""
    import uuid
    import asyncio
    geo = await get_geo_info(ip) if ip not in ("unknown", "127.0.0.1") else {}

    entry = {
        "id": str(uuid.uuid4()),
        "timestamp": _now_iso(),
        "event_type": event_type,
        "ip": ip,
        "country_code": geo.get("country_code", ""),
        "country_name": geo.get("country_name", ""),
        "city": geo.get("city", ""),
        "main_site_id": main_site_id,
        "user_id": user_id,
        "user_email": user_email,
        "details": details or {},
    }
    await db.security_logs.insert_one({**entry})

    # Trigger notification for security/firewall events (skip noisy ones)
    SKIP_NOTIFICATION_EVENTS = {"api_access", "successful_login"}
    if event_type not in SKIP_NOTIFICATION_EVENTS:
        try:
            from routers.notifications import trigger_notification
            category = "firewall" if "block" in event_type or "geo" in event_type or "rate" in event_type else "security"
            location = f" from {geo.get('city', '')}, {geo.get('country_name', '')}" if geo.get("city") else ""
            details_str = f"IP: {ip}{location}. {details.get('reason', '') if details else ''}"
            asyncio.create_task(trigger_notification(
                category=category,
                event_type=event_type,
                details=details_str,
                main_site_id=main_site_id or "",
                actor_email=user_email or "",
            ))
        except Exception:
            pass

    return entry


async def evaluate_request(ip: str, main_site_id: str = None, is_network_admin: bool = False,
                            path: str = "", method: str = "GET") -> dict:
    """Evaluate an incoming request against firewall rules.
    
    Returns: {"allowed": bool, "reason": str, "status_code": int}
    """
    # 1. Check if IP is blocked (applies to everyone, including network admins for brute force)
    block = await check_ip_blocked(ip)
    if block:
        return {"allowed": False, "reason": f"IP blocked: {block.get('reason', 'blocked')}", "status_code": 403}

    # If no main_site_id, skip site-specific rules
    if not main_site_id:
        return {"allowed": True, "reason": "no_site_context", "status_code": 200}

    settings = await get_firewall_settings(main_site_id)
    if not settings.get("enabled", True):
        return {"allowed": True, "reason": "firewall_disabled", "status_code": 200}

    # 2. Rate limiting (applies to everyone)
    max_req = settings.get("rate_limit_requests", 200)
    window = settings.get("rate_limit_window_seconds", 60)
    if check_rate_limit(ip, max_req, window):
        await log_security_event("rate_limit_exceeded", ip, main_site_id, {
            "path": path, "method": method
        })
        # Auto-block if rate limit severely exceeded (3x)
        if check_rate_limit(ip, max_req * 3, window):
            ban_min = settings.get("brute_force_ban_minutes", 30)
            await block_ip(ip, "Rate limit severely exceeded (auto)", ban_min, main_site_id, True)
        return {"allowed": False, "reason": "Rate limit exceeded", "status_code": 429}

    # Network admins bypass IP rules and geo rules (NOT brute force or rate limiting)
    if is_network_admin:
        return {"allowed": True, "reason": "network_admin_bypass", "status_code": 200}

    # 3. IP whitelist/blacklist rules
    rules = await get_firewall_rules(main_site_id)
    whitelist_rules = [r for r in rules if r.get("type") == "whitelist"]
    blacklist_rules = [r for r in rules if r.get("type") == "blacklist"]

    # If there are whitelist rules, IP must match at least one
    if whitelist_rules:
        whitelisted = False
        for rule in whitelist_rules:
            for pattern in rule.get("ip_patterns", []):
                if ip_matches(ip, pattern):
                    whitelisted = True
                    break
            if whitelisted:
                break
        if not whitelisted:
            await log_security_event("ip_not_whitelisted", ip, main_site_id, {"path": path})
            return {"allowed": False, "reason": "IP not in whitelist", "status_code": 403}

    # Check blacklist
    for rule in blacklist_rules:
        for pattern in rule.get("ip_patterns", []):
            if ip_matches(ip, pattern):
                await log_security_event("ip_blacklisted", ip, main_site_id, {
                    "rule_name": rule.get("name", ""), "pattern": pattern, "path": path
                })
                return {"allowed": False, "reason": f"IP blacklisted: {rule.get('name', '')}", "status_code": 403}

    # 4. Geo-blocking
    if settings.get("geo_blocking_enabled") and settings.get("blocked_countries"):
        geo = await get_geo_info(ip)
        country = geo.get("country_code", "XX")
        if country in settings["blocked_countries"]:
            await log_security_event("geo_blocked", ip, main_site_id, {
                "country": country, "country_name": geo.get("country_name", ""), "path": path
            })
            return {"allowed": False, "reason": f"Country blocked: {geo.get('country_name', country)}", "status_code": 403}

    return {"allowed": True, "reason": "passed", "status_code": 200}


async def handle_failed_login(ip: str, email: str, main_site_id: str = None):
    """Handle a failed login attempt — check for brute force."""
    record_login_attempt(ip)

    # Get settings (use global default if no site)
    settings = {}
    if main_site_id:
        settings = await get_firewall_settings(main_site_id)

    max_attempts = settings.get("brute_force_max_attempts", 5)
    window = settings.get("brute_force_window_minutes", 15)
    ban_duration = settings.get("brute_force_ban_minutes", 30)

    attempts_in_window = get_login_attempts(ip, window)

    await log_security_event("failed_login", ip, main_site_id, {
        "email": email, "attempts_in_window": attempts_in_window, "max_allowed": max_attempts
    })

    if attempts_in_window >= max_attempts:
        await block_ip(
            ip,
            f"Brute force: {attempts_in_window} failed logins in {window}min (email: {email})",
            ban_duration,
            main_site_id,
            True
        )
        logger.warning(f"FIREWALL: Auto-blocked {ip} for brute force ({attempts_in_window} attempts)")


async def handle_successful_login(ip: str, user_id: str, user_email: str, main_site_id: str = None):
    """Handle a successful login."""
    clear_login_attempts(ip)
    await log_security_event("successful_login", ip, main_site_id, user_id=user_id, user_email=user_email)
