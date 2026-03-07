"""Notification configuration and management endpoints."""
from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from datetime import datetime, timezone
from services.auth import get_current_user
from services.email_service import (
    SMTP_PROVIDERS, NOTIFICATION_CATEGORIES,
    test_smtp_config, send_email_with_config, build_notification_html
)
from database import db

notifications_router = APIRouter(prefix="/notifications", tags=["notifications"])


def require_network_admin(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_network_admin"):
        raise HTTPException(403, "Network admin access required")
    return current_user


# ── SMTP PROVIDERS ──────────────────────────────────────────────
@notifications_router.get("/smtp-providers")
async def get_smtp_providers():
    """Get available SMTP provider templates."""
    return [{"id": k, **v} for k, v in SMTP_PROVIDERS.items()]


# ── NOTIFICATION CATEGORIES ─────────────────────────────────────
@notifications_router.get("/categories")
async def get_notification_categories():
    """Get all notification categories."""
    return [{"id": k, **{kk: vv for kk, vv in v.items() if kk != "events"}} for k, v in NOTIFICATION_CATEGORIES.items()]


# ── SMTP CONFIG (stored per-network, one config) ───────────────
@notifications_router.get("/smtp-config")
async def get_smtp_config(current_user: dict = Depends(require_network_admin)):
    """Get the current SMTP configuration (password masked)."""
    config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not config:
        return {"configured": False}
    config["configured"] = True
    if config.get("password"):
        config["password"] = "••••••••"
    return config


@notifications_router.put("/smtp-config")
async def save_smtp_config(data: dict, current_user: dict = Depends(require_network_admin)):
    """Save SMTP configuration."""
    provider_id = data.get("provider", "custom")
    provider = SMTP_PROVIDERS.get(provider_id, SMTP_PROVIDERS["custom"])

    host = data.get("host") or provider.get("host", "")
    port = data.get("port") or provider.get("port", 587)

    if not host or not data.get("username"):
        raise HTTPException(400, "Host en gebruikersnaam zijn verplicht")

    doc = {
        "type": "smtp",
        "provider": provider_id,
        "host": host,
        "port": int(port),
        "use_tls": data.get("use_tls", provider.get("use_tls", True)),
        "username": data["username"],
        "from_email": data.get("from_email") or data["username"],
        "from_name": data.get("from_name", "Clara Radio Dashboard"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user["id"],
    }

    # Only update password if a new one is provided (not the masked version)
    if data.get("password") and data["password"] != "••••••••":
        doc["password"] = data["password"]
    else:
        existing = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0, "password": 1})
        if existing and existing.get("password"):
            doc["password"] = existing["password"]

    await db.notification_config.update_one(
        {"type": "smtp"}, {"$set": doc}, upsert=True
    )
    doc.pop("_id", None)
    doc["password"] = "••••••••" if doc.get("password") else ""
    doc["configured"] = True
    return doc


@notifications_router.post("/smtp-test")
async def test_smtp(data: dict, current_user: dict = Depends(require_network_admin)):
    """Test SMTP connection with provided or stored credentials."""
    config = dict(data)

    # If password is masked, fetch the real one
    if config.get("password") == "••••••••" or not config.get("password"):
        existing = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0, "password": 1})
        if existing and existing.get("password"):
            config["password"] = existing["password"]
        else:
            return {"success": False, "message": "Geen wachtwoord opgegeven"}

    if not config.get("host") or not config.get("username"):
        return {"success": False, "message": "Host en gebruikersnaam zijn verplicht"}

    result = await test_smtp_config(config)
    return result


@notifications_router.post("/smtp-test-email")
async def send_test_email(
    data: dict,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_network_admin),
):
    """Send a test email to the specified address."""
    to_email = data.get("to_email", current_user.get("email"))
    if not to_email:
        raise HTTPException(400, "E-mailadres verplicht")

    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp_config or not smtp_config.get("password"):
        raise HTTPException(400, "SMTP niet geconfigureerd")

    html = build_notification_html(
        "Test Melding",
        "system",
        "Dit is een test e-mail van Clara Radio Dashboard. Als je dit ontvangt werkt de SMTP configuratie correct!",
        user_name=current_user.get("name", ""),
    )

    success = await send_email_with_config(smtp_config, to_email, "Clara Test Melding", html)
    if success:
        return {"message": f"Test e-mail verstuurd naar {to_email}"}
    raise HTTPException(500, "E-mail versturen mislukt. Controleer de SMTP instellingen.")


# ── ROLE NOTIFICATION SETTINGS ──────────────────────────────────
@notifications_router.get("/role-settings")
async def get_role_notification_settings(current_user: dict = Depends(require_network_admin)):
    """Get notification settings per role across all main sites."""
    settings = await db.notification_config.find_one({"type": "role_notifications"}, {"_id": 0})
    return settings.get("roles", {}) if settings else {}


@notifications_router.put("/role-settings")
async def save_role_notification_settings(data: dict, current_user: dict = Depends(require_network_admin)):
    """Save notification settings per role.
    
    Format: { "roles": { "admin": { "categories": ["security","firewall",...], "mode": "realtime"|"daily"|"both" }, ... } }
    """
    roles = data.get("roles", {})
    await db.notification_config.update_one(
        {"type": "role_notifications"},
        {"$set": {
            "type": "role_notifications",
            "roles": roles,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user["id"],
        }},
        upsert=True,
    )
    return {"message": "Instellingen opgeslagen", "roles": roles}


# ── NOTIFICATION LOG (for daily summaries) ──────────────────────
@notifications_router.get("/log")
async def get_notification_log(
    limit: int = 50,
    current_user: dict = Depends(require_network_admin),
):
    """Get recent notification log entries."""
    logs = await db.notification_log.find(
        {}, {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    return logs


# ── TRIGGER NOTIFICATION (internal helper, called from other routers) ──
async def trigger_notification(
    category: str,
    event_type: str,
    details: str,
    main_site_id: str = "",
    site_name: str = "",
    actor_name: str = "",
    actor_email: str = "",
):
    """Trigger a notification: log it and send real-time emails if configured."""
    now = datetime.now(timezone.utc).isoformat()

    # Log the event for daily summaries
    await db.notification_log.insert_one({
        "category": category,
        "event_type": event_type,
        "details": details,
        "main_site_id": main_site_id,
        "site_name": site_name,
        "actor_name": actor_name,
        "actor_email": actor_email,
        "timestamp": now,
        "emails_sent": [],
    })

    # Check if SMTP is configured
    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp_config or not smtp_config.get("password"):
        return

    # Get role notification settings
    role_settings = await db.notification_config.find_one({"type": "role_notifications"}, {"_id": 0})
    if not role_settings:
        return
    roles_config = role_settings.get("roles", {})

    # Find which roles should be notified for this category
    target_roles = []
    for role_slug, role_cfg in roles_config.items():
        cats = role_cfg.get("categories", [])
        mode = role_cfg.get("mode", "daily")
        if category in cats and mode in ("realtime", "both"):
            target_roles.append(role_slug)

    if not target_roles:
        return

    # Find users with these roles in the relevant main site
    emails_sent = []
    query = {}
    if main_site_id:
        accesses = await db.main_site_users.find(
            {"main_site_id": main_site_id, "role": {"$in": target_roles}},
            {"_id": 0, "user_id": 1},
        ).to_list(200)
        user_ids = [a["user_id"] for a in accesses]
        if not user_ids:
            return
        query = {"id": {"$in": user_ids}}
    else:
        # Global events: notify network admins with matching role config
        query = {"is_network_admin": True}

    users = await db.users.find(query, {"_id": 0, "id": 1, "email": 1, "name": 1}).to_list(200)

    html = build_notification_html(event_type, category, details, site_name, actor_name)
    subject = f"Clara: {event_type}"

    for user in users:
        if user["email"] == actor_email:
            continue  # Don't notify the actor
        success = await send_email_with_config(smtp_config, user["email"], subject, html)
        if success:
            emails_sent.append(user["email"])

    # Update log with sent emails
    if emails_sent:
        await db.notification_log.update_one(
            {"timestamp": now, "event_type": event_type},
            {"$set": {"emails_sent": emails_sent}},
        )
