"""Notification configuration and management endpoints."""
from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from datetime import datetime, timezone
import uuid
from services.auth import get_current_user
from services.email_service import (
    SMTP_PROVIDERS, NOTIFICATION_CATEGORIES,
    test_smtp_config, send_email_with_config, build_notification_html,
    _get_branding_info,
    build_broadcast_html, get_site_notification_layout, _get_site_logo,
    DEFAULT_LAYOUT, SEVERITY_STYLES,
)
from database import db

notifications_router = APIRouter(prefix="/notifications", tags=["notifications"])


def require_system_admin(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_system_admin"):
        raise HTTPException(403, "System admin access required")
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
async def get_smtp_config(current_user: dict = Depends(require_system_admin)):
    """Get the current SMTP configuration (password masked)."""
    config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not config:
        return {"configured": False}
    config["configured"] = True
    if config.get("password"):
        config["password"] = "••••••••"
    return config


@notifications_router.put("/smtp-config")
async def save_smtp_config(data: dict, current_user: dict = Depends(require_system_admin)):
    """Save SMTP configuration."""
    provider_id = data.get("provider", "custom")
    provider = SMTP_PROVIDERS.get(provider_id, SMTP_PROVIDERS["custom"])

    host = data.get("host") or provider.get("host", "")
    port = data.get("port") or provider.get("port", 587)

    if not host or not data.get("username"):
        raise HTTPException(400, "Host and username are required")

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
async def test_smtp(data: dict, current_user: dict = Depends(require_system_admin)):
    """Test SMTP connection with provided or stored credentials."""
    config = dict(data)

    # If password is masked, fetch the real one
    if config.get("password") == "••••••••" or not config.get("password"):
        existing = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0, "password": 1})
        if existing and existing.get("password"):
            config["password"] = existing["password"]
        else:
            return {"success": False, "message": "No password provided"}

    if not config.get("host") or not config.get("username"):
        return {"success": False, "message": "Host and username are required"}

    result = await test_smtp_config(config)
    return result


@notifications_router.post("/smtp-test-email")
async def send_test_email(
    data: dict,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_system_admin),
):
    """Send a test email to the specified address."""
    to_email = data.get("to_email", current_user.get("email"))
    if not to_email:
        raise HTTPException(400, "Email address required")

    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp_config or not smtp_config.get("password"):
        raise HTTPException(400, "SMTP not configured")

    branding = await _get_branding_info()
    html = build_notification_html(
        "Test Notification",
        "system",
        "This is a test email from Clara Global Protect. If you receive this, the SMTP configuration is working correctly!",
        user_name=current_user.get("name", ""),
        brand_name=branding["brand_name"],
        brand_logo_url=branding["brand_logo_url"],
    )

    success = await send_email_with_config(smtp_config, to_email, "Clara Global Protect — Test", html)
    if success:
        return {"message": f"Test email sent to {to_email}"}
    raise HTTPException(500, "Failed to send email. Please check the SMTP settings.")


# ── ROLE NOTIFICATION SETTINGS ──────────────────────────────────
@notifications_router.get("/role-settings")
async def get_role_notification_settings(
    main_site_id: str = "",
    current_user: dict = Depends(require_system_admin),
):
    """Get notification settings per role for a specific main site (or global)."""
    query = {"type": "role_notifications", "main_site_id": main_site_id or "global"}
    settings = await db.notification_config.find_one(query, {"_id": 0})
    return settings.get("roles", {}) if settings else {}


@notifications_router.put("/role-settings")
async def save_role_notification_settings(data: dict, current_user: dict = Depends(require_system_admin)):
    """Save notification settings per role for a specific main site.
    
    Format: { "main_site_id": "...", "roles": { "admin": { "categories": [...], "mode": "realtime"|"daily"|"both" }, ... } }
    """
    main_site_id = data.get("main_site_id", "global") or "global"
    roles = data.get("roles", {})
    await db.notification_config.update_one(
        {"type": "role_notifications", "main_site_id": main_site_id},
        {"$set": {
            "type": "role_notifications",
            "main_site_id": main_site_id,
            "roles": roles,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user["id"],
        }},
        upsert=True,
    )
    return {"message": "Settings saved", "roles": roles}


@notifications_router.get("/site-roles/{main_site_id}")
async def get_site_roles(main_site_id: str, current_user: dict = Depends(require_system_admin)):
    """Get all roles defined for a specific main site."""
    roles = await db.roles.find(
        {"main_site_id": main_site_id},
        {"_id": 0, "slug": 1, "name": 1}
    ).to_list(100)
    # Always include default roles
    defaults = [
        {"slug": "admin", "name": "Admin"},
        {"slug": "presenter", "name": "Presenter"},
        {"slug": "editor", "name": "Editor"},
        {"slug": "viewer", "name": "Viewer"},
    ]
    seen = {r["slug"] for r in roles}
    for d in defaults:
        if d["slug"] not in seen:
            roles.insert(0, d)
    return roles


# ── SYSTEM ALERT EMAIL ──────────────────────────────────────────
@notifications_router.get("/system-alert")
async def get_system_alert_settings(current_user: dict = Depends(require_system_admin)):
    """Get the system alert email configuration."""
    doc = await db.notification_config.find_one({"type": "system_alert"}, {"_id": 0})
    return doc or {"email": "", "enabled": False, "mode": "both"}


@notifications_router.put("/system-alert")
async def save_system_alert_settings(data: dict, current_user: dict = Depends(require_system_admin)):
    """Save the system alert email — receives ALL notifications from ALL sites."""
    await db.notification_config.update_one(
        {"type": "system_alert"},
        {"$set": {
            "type": "system_alert",
            "email": data.get("email", ""),
            "enabled": data.get("enabled", False),
            "mode": data.get("mode", "both"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user["id"],
        }},
        upsert=True,
    )
    return {"message": "System alert settings saved"}



# ── NOTIFICATION LOG (for daily summaries) ──────────────────────
@notifications_router.get("/log")
async def get_notification_log(
    limit: int = 50,
    current_user: dict = Depends(require_system_admin),
):
    """Get recent notification log entries."""
    logs = await db.notification_log.find(
        {}, {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    return logs


@notifications_router.post("/send-daily-digest")
async def manual_send_daily_digest(
    current_user: dict = Depends(require_system_admin),
):
    """Manually trigger the daily digest email."""
    from services.notification_scheduler import send_daily_digest
    await send_daily_digest()
    return {"message": "Daily digest sent"}




# ── PER-SITE NOTIFICATION LAYOUT ───────────────────────────────
@notifications_router.get("/layout")
async def get_layout_settings(
    main_site_id: str = "",
    current_user: dict = Depends(get_current_user),
):
    """Get the email layout config for a site (or global)."""
    layout = await get_site_notification_layout(main_site_id or "global")
    return layout


@notifications_router.put("/layout")
async def save_layout_settings(
    data: dict,
    current_user: dict = Depends(require_system_admin),
):
    """Save layout config for a site."""
    site_scope = data.get("main_site_id") or "global"
    update = {
        "type": "layout",
        "main_site_id": site_scope,
        "show_main_site_logo": bool(data.get("show_main_site_logo", True)),
        "show_clara_logo": bool(data.get("show_clara_logo", True)),
        "banner_gradient_from": data.get("banner_gradient_from") or DEFAULT_LAYOUT["banner_gradient_from"],
        "banner_gradient_to": data.get("banner_gradient_to") or DEFAULT_LAYOUT["banner_gradient_to"],
        "footer_text": data.get("footer_text") or DEFAULT_LAYOUT["footer_text"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user["id"],
    }
    await db.notification_config.update_one(
        {"type": "layout", "main_site_id": site_scope},
        {"$set": update},
        upsert=True,
    )
    return {"message": "Layout saved", "main_site_id": site_scope}


# ── BROADCAST PREVIEW (HTML render only) ────────────────────────
@notifications_router.post("/broadcast/preview")
async def preview_broadcast(
    data: dict,
    current_user: dict = Depends(require_system_admin),
):
    """Render an HTML preview of the broadcast email — does NOT send."""
    main_site_id = data.get("main_site_id") or ""
    layout = await get_site_notification_layout(main_site_id or "global")
    if "layout_override" in data and isinstance(data["layout_override"], dict):
        layout = {**layout, **{k: v for k, v in data["layout_override"].items() if v is not None}}
    site_name = ""
    site_logo = ""
    if main_site_id:
        site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0, "name": 1, "logo_url": 1})
        if site:
            site_name = site.get("name", "")
            site_logo = site.get("logo_url", "") or ""
    branding = await _get_branding_info()
    body = data.get("body") or "<p>(empty body)</p>"
    html = build_broadcast_html(
        title=data.get("title") or "Untitled announcement",
        body_html=body,
        severity=data.get("severity") or "info",
        site_name=site_name,
        sender_name=current_user.get("name") or current_user.get("email", ""),
        layout=layout,
        site_logo_url=site_logo,
        clara_logo_url=branding.get("brand_logo_url") or "",
    )
    return {"html": html, "severity": data.get("severity") or "info"}


# ── BROADCAST AUDIENCE COUNT ─────────────────────────────────────
async def _resolve_broadcast_recipients(audience: str, main_site_id: str = "", roles: list = None) -> list:
    """Resolve email recipients based on audience."""
    recipients = {}
    roles = roles or []

    if audience == "system_admins":
        async for u in db.users.find({"is_system_admin": True}, {"_id": 0, "id": 1, "email": 1, "name": 1}):
            recipients[u["email"]] = u
    elif audience == "site_admins" and main_site_id:
        accesses = await db.main_site_users.find(
            {"main_site_id": main_site_id, "role": {"$in": ["admin", "owner"]}}, {"_id": 0, "user_id": 1}
        ).to_list(500)
        ids = [a["user_id"] for a in accesses]
        async for u in db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "email": 1, "name": 1}):
            recipients[u["email"]] = u
    elif audience == "site_editors" and main_site_id:
        accesses = await db.main_site_users.find(
            {"main_site_id": main_site_id, "role": {"$in": ["admin", "owner", "editor"]}}, {"_id": 0, "user_id": 1}
        ).to_list(500)
        ids = [a["user_id"] for a in accesses]
        async for u in db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "email": 1, "name": 1}):
            recipients[u["email"]] = u
    elif audience == "site_all_users" and main_site_id:
        accesses = await db.main_site_users.find({"main_site_id": main_site_id}, {"_id": 0, "user_id": 1}).to_list(2000)
        ids = [a["user_id"] for a in accesses]
        async for u in db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "email": 1, "name": 1}):
            recipients[u["email"]] = u
    elif audience == "site_specific_roles" and main_site_id and roles:
        accesses = await db.main_site_users.find(
            {"main_site_id": main_site_id, "role": {"$in": roles}}, {"_id": 0, "user_id": 1}
        ).to_list(2000)
        ids = [a["user_id"] for a in accesses]
        async for u in db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "email": 1, "name": 1}):
            recipients[u["email"]] = u
    elif audience == "global_all_users":
        async for u in db.users.find({}, {"_id": 0, "id": 1, "email": 1, "name": 1}):
            recipients[u["email"]] = u

    return list(recipients.values())


@notifications_router.post("/broadcast/audience-count")
async def get_audience_count(
    data: dict,
    current_user: dict = Depends(require_system_admin),
):
    recipients = await _resolve_broadcast_recipients(
        audience=data.get("audience", "system_admins"),
        main_site_id=data.get("main_site_id", ""),
        roles=data.get("roles", []),
    )
    return {"count": len(recipients), "sample": [r["email"] for r in recipients[:5]]}


# ── BROADCAST SEND ───────────────────────────────────────────────
@notifications_router.post("/broadcast")
async def send_broadcast(
    data: dict,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_system_admin),
):
    """Send a broadcast / announcement / maintenance message to selected audience."""
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    severity = data.get("severity") or "info"
    audience = data.get("audience") or "system_admins"
    main_site_id = data.get("main_site_id") or ""
    roles = data.get("roles") or []
    show_in_app_banner = bool(data.get("show_in_app_banner", severity == "maintenance"))
    banner_starts_at = data.get("banner_starts_at")
    banner_ends_at = data.get("banner_ends_at")
    test_to_self = bool(data.get("test_to_self"))

    if not title or not body:
        raise HTTPException(status_code=400, detail="Title and body are required")
    if severity not in SEVERITY_STYLES:
        raise HTTPException(status_code=400, detail="Invalid severity")

    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp_config or not smtp_config.get("password"):
        raise HTTPException(status_code=400, detail="SMTP is not configured. Configure it in Notification Settings first.")

    layout = await get_site_notification_layout(main_site_id or "global")
    site_name, site_logo = "", ""
    if main_site_id:
        site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0, "name": 1, "logo_url": 1})
        if site:
            site_name = site.get("name", "")
            site_logo = site.get("logo_url", "") or ""
    branding = await _get_branding_info()

    html = build_broadcast_html(
        title=title,
        body_html=body,
        severity=severity,
        site_name=site_name,
        sender_name=current_user.get("name") or current_user.get("email", ""),
        layout=layout,
        site_logo_url=site_logo,
        clara_logo_url=branding.get("brand_logo_url") or "",
    )
    subject = f"[{SEVERITY_STYLES[severity]['label']}] {title}"

    # Resolve recipients
    if test_to_self:
        recipients = [{"email": current_user["email"], "name": current_user.get("name", "")}]
    else:
        recipients = await _resolve_broadcast_recipients(audience=audience, main_site_id=main_site_id, roles=roles)

    # Persist broadcast record (always — even if no recipients) for audit trail
    broadcast_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    broadcast_record = {
        "id": broadcast_id,
        "title": title,
        "body": body,
        "severity": severity,
        "audience": audience,
        "main_site_id": main_site_id,
        "roles": roles,
        "show_in_app_banner": show_in_app_banner,
        "banner_starts_at": banner_starts_at or now,
        "banner_ends_at": banner_ends_at,
        "sent_by": current_user["id"],
        "sent_by_name": current_user.get("name") or current_user.get("email", ""),
        "sent_at": now,
        "test_to_self": test_to_self,
        "recipients_total": len(recipients),
        "recipients_sent": [],
        "recipients_failed": [],
    }
    await db.notification_broadcasts.insert_one(dict(broadcast_record))

    if not recipients:
        return {"message": "No recipients matched.", "broadcast_id": broadcast_id, "sent": 0}

    # Send in background to avoid timeout
    async def _send_all():
        sent, failed = [], []
        for rec in recipients:
            ok = await send_email_with_config(smtp_config, rec["email"], subject, html)
            (sent if ok else failed).append(rec["email"])
        await db.notification_broadcasts.update_one(
            {"id": broadcast_id},
            {"$set": {"recipients_sent": sent, "recipients_failed": failed}},
        )
        await db.notification_log.insert_one({
            "category": "broadcast",
            "event_type": "broadcast_sent",
            "details": f"{title} → {len(sent)} sent / {len(failed)} failed",
            "main_site_id": main_site_id,
            "site_name": site_name,
            "actor_name": current_user.get("name", ""),
            "actor_email": current_user.get("email", ""),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "emails_sent": sent,
            "emails_failed": failed,
            "emails_attempted": [r["email"] for r in recipients],
            "broadcast_id": broadcast_id,
        })

    background_tasks.add_task(_send_all)

    return {
        "message": "Broadcast queued",
        "broadcast_id": broadcast_id,
        "queued": len(recipients),
        "show_in_app_banner": show_in_app_banner,
    }


# ── ACTIVE IN-APP BANNER (read by frontend on every page) ────────
@notifications_router.get("/active-banner")
async def get_active_banner(
    main_site_id: str = "",
    current_user: dict = Depends(get_current_user),
):
    """Return active in-app banners visible to the current user."""
    now = datetime.now(timezone.utc).isoformat()
    query = {
        "show_in_app_banner": True,
        "$or": [{"banner_ends_at": None}, {"banner_ends_at": {"$gt": now}}, {"banner_ends_at": ""}],
    }
    site_filter = []
    if main_site_id:
        site_filter.append({"main_site_id": main_site_id})
    site_filter.append({"main_site_id": ""})
    query["$and"] = [{"$or": site_filter}]

    cursor = db.notification_broadcasts.find(query, {"_id": 0}).sort("banner_starts_at", -1).limit(5)
    banners = []
    async for b in cursor:
        banners.append({
            "id": b["id"],
            "title": b["title"],
            "body": b["body"],
            "severity": b["severity"],
            "banner_ends_at": b.get("banner_ends_at"),
        })
    return banners


@notifications_router.delete("/active-banner/{broadcast_id}")
async def deactivate_banner(
    broadcast_id: str,
    current_user: dict = Depends(require_system_admin),
):
    """Remove a broadcast's in-app banner (does not unsend the email)."""
    res = await db.notification_broadcasts.update_one(
        {"id": broadcast_id},
        {"$set": {"show_in_app_banner": False}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    return {"message": "Banner deactivated"}


@notifications_router.get("/broadcasts")
async def list_broadcasts(
    limit: int = 50,
    current_user: dict = Depends(require_system_admin),
):
    cursor = db.notification_broadcasts.find({}, {"_id": 0}).sort("sent_at", -1).limit(limit)
    out = []
    async for b in cursor:
        out.append(b)
    return out


# ── HARDCODED SYSTEM ADMIN EMAIL — always receives all alerts ──
SYSTEM_ADMIN_EMAIL = "clara.global@koodh.com"


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
        "emails_failed": [],
        "emails_attempted": [],
    })

    # Check if SMTP is configured
    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp_config or not smtp_config.get("password"):
        return

    branding = await _get_branding_info()
    html = build_notification_html(event_type, category, details, site_name, actor_name, brand_name=branding["brand_name"], brand_logo_url=branding["brand_logo_url"])
    subject = f"Clara Global Protect: {event_type}"

    emails_sent = []
    emails_failed = []
    emails_attempted = []

    # ── Role-based notifications ──
    role_settings = None
    if main_site_id:
        role_settings = await db.notification_config.find_one(
            {"type": "role_notifications", "main_site_id": main_site_id}, {"_id": 0}
        )
    if not role_settings:
        role_settings = await db.notification_config.find_one(
            {"type": "role_notifications", "main_site_id": "global"}, {"_id": 0}
        )
    if not role_settings:
        role_settings = await db.notification_config.find_one(
            {"type": "role_notifications", "main_site_id": {"$exists": False}}, {"_id": 0}
        )

    if role_settings:
        roles_config = role_settings.get("roles", {})
        target_roles = []
        for role_slug, role_cfg in roles_config.items():
            cats = role_cfg.get("categories", [])
            mode = role_cfg.get("mode", "daily")
            if category in cats and mode in ("realtime", "both"):
                target_roles.append(role_slug)

        if target_roles:
            query = {}
            if main_site_id:
                accesses = await db.main_site_users.find(
                    {"main_site_id": main_site_id, "role": {"$in": target_roles}},
                    {"_id": 0, "user_id": 1},
                ).to_list(200)
                user_ids = [a["user_id"] for a in accesses]
                if user_ids:
                    query = {"id": {"$in": user_ids}}
            else:
                query = {"is_network_admin": True}

            if query:
                users = await db.users.find(query, {"_id": 0, "id": 1, "email": 1, "name": 1}).to_list(200)
                for user in users:
                    if user["email"] == actor_email:
                        continue
                    emails_attempted.append(user["email"])
                    success = await send_email_with_config(smtp_config, user["email"], subject, html)
                    if success:
                        emails_sent.append(user["email"])
                    else:
                        emails_failed.append(user["email"])

    # ── System Admin Email: ALWAYS send to hardcoded admin + DB-configured alert ──
    admin_emails = {SYSTEM_ADMIN_EMAIL}

    # Also include DB-configured system alert email
    system_alert = await db.notification_config.find_one({"type": "system_alert"}, {"_id": 0})
    if system_alert and system_alert.get("enabled") and system_alert.get("email"):
        sa_mode = system_alert.get("mode", "both")
        if sa_mode in ("realtime", "both"):
            admin_emails.add(system_alert["email"])

    for admin_email in admin_emails:
        if admin_email not in emails_sent and admin_email not in emails_failed and admin_email != actor_email:
            emails_attempted.append(admin_email)
            success = await send_email_with_config(smtp_config, admin_email, subject, html)
            if success:
                emails_sent.append(admin_email)
            else:
                emails_failed.append(admin_email)

    # Update log with delivery results
    update_fields = {"emails_attempted": emails_attempted}
    if emails_sent:
        update_fields["emails_sent"] = emails_sent
    if emails_failed:
        update_fields["emails_failed"] = emails_failed
    if update_fields:
        await db.notification_log.update_one(
            {"timestamp": now, "event_type": event_type},
            {"$set": update_fields},
        )
